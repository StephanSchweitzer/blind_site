import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { put, list, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { withoutAudit } from "@/lib/audit/context";

const pollyClient = new PollyClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    }
});

// One synthesis per request (Polly neural ~3000 char limit) and keeps the spoken
// blurb "brief", matching the modal's button. Long descriptions are truncated.
const MAX_SPOKEN = 2800;

// Mirror of the modal's client-side formatter.
function formatMinutes(min: number): string {
    if (min < 60) return `${min} minute${min > 1 ? 's' : ''}`;
    const hours = Math.floor(min / 60);
    const rem = min % 60;
    return `${hours} heure${hours > 1 ? 's' : ''} et ${rem} minute${rem > 1 ? 's' : ''}`;
}

/**
 * Les annonces d'avant pour ce livre — l'ancien nom fixe `book-<id>.mp3` comme
 * les versions suffixées — n'ont plus de lecteur une fois la nouvelle en base :
 * elles ne feraient qu'occuper le stockage Blob. Le motif exige « book-<id> »
 * suivi de « . » ou « - » : `book-4` ne doit pas emporter `book-42`.
 *
 * Au mieux : l'annonce est déjà servie, un échec ici n'a pas à la faire échouer.
 */
async function pruneSupersededAnnouncements(bookId: number, keepUrl: string): Promise<void> {
    try {
        const own = new RegExp(`^book_descriptions/book-${bookId}(-[A-Za-z0-9]+)?\\.mp3$`);
        const { blobs } = await list({ prefix: `book_descriptions/book-${bookId}` });
        await discardBlobs(blobs.filter((b) => own.test(b.pathname) && b.url !== keepUrl).map((b) => b.url));
    } catch (error) {
        console.warn("Nettoyage des anciennes annonces impossible pour le livre", bookId, error);
    }
}

async function discardBlobs(urls: string[]): Promise<void> {
    if (!urls.length) return;
    try {
        await del(urls);
    } catch (error) {
        console.warn("Suppression d'annonces périmées impossible", urls, error);
    }
}

/**
 * Public (no-auth, accessibility) text-to-speech for a book's brief announcement.
 *
 * Securing a paid service the public can call:
 *  1. Reference input only — caller sends bookId, never free text, so Polly can
 *     only ever read a real catalogue book's own fields.
 *  2. Cache via Book.polly_audio_url — synthesized at most once per book;
 *     thereafter we return the stored URL. Cost is bounded by catalogue size.
 *  3. Catalogue public uniquement — voir le findFirst ci-dessous.
 *
 * Le cache est invalidé aux deux endroits où le texte lu peut bouger : PUT
 * /api/books/[id] pour le titre, l'auteur et la description, et
 * refreshBookAudioState (lib/audio/state.ts) pour la durée de lecture, qui est
 * dérivée de l'audio et ne passe pas par la route.
 */
export async function POST(req: NextRequest) {
    // Corps illisible = 400, pas 500 : un POST sans corps faisait jeter
    // `req.json()` hors de tout try, et la route — ouverte sans session —
    // répondait par une erreur serveur non gérée.
    const body = await req.json().catch(() => null);
    const bookId = (body as { bookId?: unknown } | null)?.bookId;

    const id = Number(bookId);
    if (!Number.isInteger(id)) {
        return NextResponse.json({ error: 'bookId invalide' }, { status: 400 });
    }

    // hiddenFromCatalogue est respecté ici comme partout ailleurs côté public
    // (app/(public)/catalogue/data.ts, app/(public)/listes-de-livres/data.ts). Cette route est
    // ouverte sans session et accepte n'importe quel bookId : sans ce filtre,
    // n'importe qui pouvait faire lire à voix haute le titre, l'auteur et la
    // description d'un ouvrage délibérément masqué du site — et en faire
    // déposer l'enregistrement sur une URL Vercel Blob PUBLIQUE, qui lui
    // survivait. Le bouton n'existe que dans BookModal, servi uniquement par
    // ces deux pages, qui filtrent déjà : rien de légitime ne passe par là.
    //
    // findFirst et non findUnique : Prisma n'accepte pas de filtre non unique
    // dans un where de findUnique.
    const book = await prisma.book.findFirst({
        where: { id, hiddenFromCatalogue: false },
        select: {
            id: true,
            title: true,
            author: true,
            description: true,
            readingDurationMinutes: true,
            polly_audio_url: true,
        },
    });

    if (!book) {
        return NextResponse.json({ error: 'Livre non trouvé' }, { status: 404 });
    }

    // Cache hit — never call Polly.
    if (book.polly_audio_url) {
        return NextResponse.json({ audioUrl: book.polly_audio_url });
    }

    // Compose the announcement server-side, exactly as the modal did.
    const duration = book.readingDurationMinutes
        ? `Durée de l'enregistrement: ${formatMinutes(book.readingDurationMinutes)}. `
        : '';
    const descPart = book.description
        ? `Description: ${book.description}`
        : 'Aucune description disponible.';
    let text = `${book.title}. écrit par ${book.author}. ${duration}${descPart}`;
    if (text.length > MAX_SPOKEN) text = text.slice(0, MAX_SPOKEN);

    const command = new SynthesizeSpeechCommand({
        Engine: 'neural',
        LanguageCode: 'fr-FR',
        Text: text,
        OutputFormat: 'mp3',
        VoiceId: 'Lea',
    });

    // Synthèse, dépôt et mise en cache sous un seul try : trois appels à des
    // services extérieurs (Polly, Vercel Blob) qui échouent pour des raisons
    // qui ne regardent pas l'appelant — quota atteint, panne réseau,
    // identifiants absents. Sans lui, l'échec remontait en erreur non gérée sur
    // une route publique. Une réponse non-200 laisse BookModal annoncer « La
    // lecture audio n'a pas pu démarrer » à l'auditeur, ce qui est le message
    // juste ; une erreur non gérée ne lui disait rien de plus mais salissait
    // les logs et exposait la trace.
    try {
        const response = await pollyClient.send(command);
        const audioData = await response.AudioStream?.transformToByteArray();
        if (!audioData) {
            return NextResponse.json({ error: 'Échec de la synthèse' }, { status: 500 });
        }

        const fileName = `book-${book.id}.mp3`;
        let audioUrl: string;

        // UNE URL NEUVE PAR SYNTHÈSE.
        //
        // Le chemin était fixe (book_descriptions/book-<id>.mp3). Or @vercel/blob
        // refuse d'écraser un blob existant sans `allowOverwrite` : une fois
        // l'annonce invalidée (titre, auteur, description ou durée changés —
        // polly_audio_url remis à null), chaque nouvel essai payait la synthèse
        // Polly, puis échouait au dépôt, pour toujours. Et l'écrasement n'aurait
        // pas suffi : l'URL publique est mise en cache par le CDN (un mois par
        // défaut), qui aurait continué de servir l'ancien texte. Le suffixe
        // aléatoire donne à chaque version sa propre URL, donc un cache juste.
        if (process.env.NODE_ENV === 'development') {
            const dir = path.join(process.cwd(), 'public', 'book_descriptions');
            await mkdir(dir, { recursive: true });
            await writeFile(path.join(dir, fileName), Buffer.from(audioData));
            // Même fichier en local, mais une URL neuve pour le cache du navigateur.
            audioUrl = `/book_descriptions/${fileName}?v=${Date.now()}`;
        } else {
            const { url } = await put(`book_descriptions/${fileName}`, Buffer.from(audioData), {
                access: 'public',
                contentType: 'audio/mpeg',
                addRandomSuffix: true,
            });
            audioUrl = url;
        }

        // Enregistrée seulement si personne ne l'a fait entre-temps : deux
        // auditeurs qui cliquent en même temps synthétisent chacun la leur, et
        // le nettoyage ci-dessous supprime les versions qui ne sont pas en base.
        // Sans cette condition, la seconde écriture pouvait désigner un blob que
        // la première venait d'effacer. withoutAudit : polly_audio_url est un
        // DERIVED_FIELD, le journal n'en garderait rien (comme dans
        // refreshBookAudioState).
        const { count } = await withoutAudit(() =>
            prisma.book.updateMany({
                where: { id: book.id, polly_audio_url: null },
                data: { polly_audio_url: audioUrl },
            })
        );
        if (count === 0) {
            const winner = await prisma.book.findUnique({
                where: { id: book.id },
                select: { polly_audio_url: true },
            });
            if (winner?.polly_audio_url) {
                if (process.env.NODE_ENV !== 'development') await discardBlobs([audioUrl]);
                return NextResponse.json({ audioUrl: winner.polly_audio_url });
            }
        }

        if (process.env.NODE_ENV !== 'development') {
            await pruneSupersededAnnouncements(book.id, audioUrl);
        }

        return NextResponse.json({ audioUrl });
    } catch (error) {
        console.error('Synthèse vocale échouée pour le livre', book.id, error);
        return NextResponse.json({ error: 'Échec de la synthèse' }, { status: 500 });
    }
}