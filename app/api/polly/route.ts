import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

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
 * Public (no-auth, accessibility) text-to-speech for a book's brief announcement.
 *
 * Securing a paid service the public can call:
 *  1. Reference input only — caller sends bookId, never free text, so Polly can
 *     only ever read a real catalogue book's own fields.
 *  2. Cache via Book.polly_audio_url — synthesized at most once per book;
 *     thereafter we return the stored URL. Cost is bounded by catalogue size.
 * Clear polly_audio_url in the book update route when title/author/duration/
 * description change, so the cached audio regenerates.
 */
export async function POST(req: NextRequest) {
    const { bookId } = await req.json();

    const id = Number(bookId);
    if (!Number.isInteger(id)) {
        return NextResponse.json({ error: 'bookId invalide' }, { status: 400 });
    }

    const book = await prisma.book.findUnique({
        where: { id },
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

    const response = await pollyClient.send(command);
    const audioData = await response.AudioStream?.transformToByteArray();
    if (!audioData) {
        return NextResponse.json({ error: 'Échec de la synthèse' }, { status: 500 });
    }

    const fileName = `book-${book.id}.mp3`;
    let audioUrl: string;

    if (process.env.NODE_ENV === 'development') {
        const dir = path.join(process.cwd(), 'public', 'book_descriptions');
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, fileName), Buffer.from(audioData));
        audioUrl = `/book_descriptions/${fileName}`;
    } else {
        const { url } = await put(`book_descriptions/${fileName}`, Buffer.from(audioData), {
            access: 'public',
            contentType: 'audio/mpeg',
        });
        audioUrl = url;
    }

    await prisma.book.update({
        where: { id: book.id },
        data: { polly_audio_url: audioUrl },
    });

    return NextResponse.json({ audioUrl });
}