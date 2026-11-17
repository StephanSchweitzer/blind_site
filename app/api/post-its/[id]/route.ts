// app/api/post-its/[id]/route.ts
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { invalidIdResponse, isRecordNotFound, notFoundResponse, parseRecordId } from '@/lib/api-errors';
import { canEditPostIt, POST_IT_INCLUDE, serializePostIt, validatePostItInput } from '@/lib/post-its/postIts';

const GONE = 'Ce post-it n’existe plus : il a peut-être été supprimé depuis un autre onglet.';
const NOT_YOURS = 'Seuls son auteur et un super admin peuvent modifier ou supprimer ce post-it.';

/**
 * PATCH /api/post-its/[id]
 *   { done: true | false } — marquer « Fait » ou rouvrir : tout permanent.
 *   { content, remindOn, link } — réécrire le post-it : son auteur ou un super admin.
 * Les deux formes ne se mélangent pas : un corps qui porte `done` ne change que cela.
 */
export const PATCH = withAdmin(async (req, { me, params }) => {
    const id = parseRecordId((await params!).id);
    if (id === null) return invalidIdResponse();

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) ?? {};
    } catch {
        return NextResponse.json({ error: 'Format de requête invalide' }, { status: 400 });
    }

    const existing = await prisma.postIt.findUnique({ where: { id }, select: { authorId: true, doneAt: true } });
    if (!existing) return notFoundResponse(GONE);

    if (typeof body.done === 'boolean') {
        const done = body.done;
        // Déjà dans l'état demandé (deux onglets) : rien à écrire, donc rien au journal.
        if (done === (existing.doneAt !== null)) {
            const row = await prisma.postIt.findUnique({ where: { id }, include: POST_IT_INCLUDE });
            return NextResponse.json(serializePostIt(row!, me));
        }
        const row = await prisma.postIt.update({
            where: { id },
            data: done ? { doneAt: new Date(), doneById: me.id } : { doneAt: null, doneById: null },
            include: POST_IT_INCLUDE,
        });
        return NextResponse.json(serializePostIt(row, me));
    }

    if (!canEditPostIt(me, existing.authorId)) return NextResponse.json({ error: NOT_YOURS }, { status: 403 });
    const checked = await validatePostItInput(body);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
    try {
        const row = await prisma.postIt.update({ where: { id }, data: checked.data, include: POST_IT_INCLUDE });
        return NextResponse.json(serializePostIt(row, me));
    } catch (error) {
        if (isRecordNotFound(error)) return notFoundResponse(GONE);
        throw error;
    }
});

export const DELETE = withAdmin(async (_req, { me, params }) => {
    const id = parseRecordId((await params!).id);
    if (id === null) return invalidIdResponse();

    const existing = await prisma.postIt.findUnique({ where: { id }, select: { authorId: true } });
    if (!existing) return notFoundResponse(GONE);
    if (!canEditPostIt(me, existing.authorId)) return NextResponse.json({ error: NOT_YOURS }, { status: 403 });

    try {
        await prisma.postIt.delete({ where: { id } });
    } catch (error) {
        if (isRecordNotFound(error)) return notFoundResponse(GONE);
        throw error;
    }
    return NextResponse.json({ ok: true });
});
