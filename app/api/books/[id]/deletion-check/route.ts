import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { readBookDeletionCheck } from '@/lib/books/deletionPreflight';

/**
 * Ce qui empêche de supprimer cette fiche, et ce qu'il reste à décider — AVANT
 * d'ouvrir la fenêtre de confirmation.
 *
 * L'interface ne connaissait ces refus qu'en tentant la suppression et en lisant
 * le 409 : le permanent confirmait, attendait, et découvrait seulement alors
 * qu'une demande nommait le livre ou qu'une autre fiche partageait son dossier
 * audio. En un appel : demandes et attributions (vivantes et supprimées, avec
 * leurs identifiants et les liens vers les listes filtrées), le nombre de pistes
 * et le poids du dossier, et les autres fiches qui pointent sur le même préfixe.
 *
 * Le listing du préfixe n'est pas renvoyé : il ne sert qu'au chemin d'écriture
 * (voir readBookDeletionCheck), et la fenêtre n'a que faire des clés brutes.
 *
 * Volontairement un GET sans effet de bord — contrairement à l'ouverture de
 * l'éditeur audio, ce contrôle ne rafraîchit PAS l'état audio en cache : on est
 * en train de décider du sort de la fiche, ce n'est pas le moment de lui écrire
 * des colonnes.
 */
export const GET = withAdmin(async (_req, { params }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    try {
        const { preflight } = await readBookDeletionCheck(bookId);
        if (!preflight) {
            return NextResponse.json({ error: 'Livre introuvable' }, { status: 404 });
        }
        return NextResponse.json(preflight);
    } catch (error) {
        // Le stockage est injoignable : on ne peut pas dire ce que contient le
        // dossier, donc on ne prétend pas le savoir. La fenêtre le dit et
        // n'offre aucune option — décider du dossier sans pouvoir le lire est
        // exactement ce qu'il ne faut pas faire ici.
        console.error('Contrôle de suppression impossible pour le livre', bookId, error);
        return NextResponse.json(
            {
                error:
                    'Impossible de lire le dossier audio de ce livre : le stockage est ' +
                    'injoignable. Réessayez dans un instant — rien n’a été modifié.',
            },
            { status: 503 },
        );
    }
});
