import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { restoreTrack, AudioTrashError } from '@/lib/audio/trash';
import { AUDIO_TRASH_RETENTION_DAYS } from '@/lib/audio/purge';

/**
 * The corbeille for one book: what was deleted, by whom, and when.
 *
 * A row deleted before the nightly purge shipped is exempt (`retainForever`)
 * and never expires. Anything deleted after that is swept once it passes
 * AUDIO_TRASH_RETENTION_DAYS — see lib/audio/purge.ts. `purgeEligibleAt` and
 * `retainForever` are handed to the client so the dialogue can say so, rather
 * than repeating the old "restorable at any time" promise for rows that no
 * longer have one.
 */
export const GET = withAdmin(async (_req, { params }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const rows = await prisma.deletedAudioTrack.findMany({
        where: { bookId },
        orderBy: { deletedAt: 'desc' },
        select: {
            id: true,
            filename: true,
            originalKey: true,
            sizeBytes: true,
            deletedAt: true,
            restoredAt: true,
            purgedAt: true,
            retainForever: true,
            deletedBy: { select: { id: true, name: true, email: true } },
            restoredBy: { select: { id: true, name: true, email: true } },
        },
    });

    return NextResponse.json({
        bookId,
        retentionDays: AUDIO_TRASH_RETENTION_DAYS,
        items: rows.map((r) => ({
            ...r,
            // BigInt doesn't survive JSON.stringify.
            sizeBytes: Number(r.sizeBytes),
            purgeEligibleAt: r.retainForever
                ? null
                : new Date(r.deletedAt.getTime() + AUDIO_TRASH_RETENTION_DAYS * 86_400_000).toISOString(),
        })),
    });
});

/** Put a track back where it came from. */
export const POST = withAdmin(async (req, { params, me }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const trashId = Number(body?.trashId);
    if (!Number.isInteger(trashId)) {
        return NextResponse.json({ message: 'Entrée de corbeille invalide' }, { status: 400 });
    }

    // The row must belong to the book named in the URL, so a crafted id can't
    // restore into a folder the caller wasn't looking at.
    const row = await prisma.deletedAudioTrack.findUnique({
        where: { id: trashId },
        select: { bookId: true },
    });
    if (!row || row.bookId !== bookId) {
        return NextResponse.json({ message: 'Entrée de corbeille introuvable' }, { status: 404 });
    }

    try {
        const result = await restoreTrack({ trashId, userId: me.id });
        return NextResponse.json({
            message: 'Le fichier a été restauré dans le dossier du livre.',
            ...result,
        });
    } catch (e) {
        if (e instanceof AudioTrashError) {
            return NextResponse.json({ message: e.message }, { status: 409 });
        }
        console.error('Restauration audio échouée', e);
        return NextResponse.json({ message: 'La restauration a échoué.' }, { status: 500 });
    }
});
