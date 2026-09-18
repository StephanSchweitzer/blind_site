import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { readBookDeletionCheck } from '@/lib/books/deletionPreflight';
import { unexpectedErrorResponse } from '@/lib/api-errors';

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
        // On ne peut pas dire ce que contient le dossier, donc on ne prétend pas
        // le savoir : la fenêtre le dit et n'offre aucune option — décider du
        // dossier sans pouvoir le lire est exactement ce qu'il ne faut pas faire.
        // Le plus souvent le stockage (B2 répond 5xx par intermittence), mais
        // la base peut aussi être en cause : le message n'affirme ni l'un ni
        // l'autre, et la référence permet de trancher dans les journaux.
        return unexpectedErrorResponse({
            where: `GET /api/books/${bookId}/deletion-check`,
            error,
            what:
                'Impossible de vérifier ce que ce livre contient (dossier audio, demandes, ' +
                'attributions) : le stockage ou la base n’a pas répondu.',
            outcome: 'Rien n’a été modifié. Fermez la fenêtre et réessayez dans un instant.',
        });
    }
});
