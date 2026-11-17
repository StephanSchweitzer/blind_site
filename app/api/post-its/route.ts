// app/api/post-its/route.ts
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { parseLimitParam, parsePageParam } from '@/lib/pagination';
import {
    listDonePostIts,
    listOpenPostIts,
    POST_IT_INCLUDE,
    serializePostIt,
    validatePostItInput,
    type PostItFilter,
} from '@/lib/post-its/postIts';

/**
 * GET /api/post-its?etat=ouverts|termines&page=&limit=
 *   Les ouverts arrivent d'un coup, rappels échus en tête (lib/post-its/postIts.ts) ;
 *   les terminés, page par page, du plus récent au plus ancien.
 * GET /api/post-its?userId=… (ou orderId, assignmentId, billId)
 *   Les post-its ouverts liés à ce dossier.
 * POST /api/post-its — { content, remindOn, link }
 */
export const GET = withAdmin(async (req, { me }) => {
    const sp = req.nextUrl.searchParams;
    if (sp.get('etat') === 'termines') {
        const page = parsePageParam(sp.get('page'));
        const limit = parseLimitParam(sp.get('limit'), 25);
        const { items, total } = await listDonePostIts(me, page, limit);
        return NextResponse.json({ items, total, page, limit });
    }

    const filter: PostItFilter = {};
    for (const key of ['userId', 'orderId', 'assignmentId', 'billId'] as const) {
        const raw = sp.get(key);
        if (raw === null) continue;
        const id = Number(raw);
        if (!Number.isInteger(id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
        filter[key] = id;
    }
    const { items, total } = await listOpenPostIts(me, filter);
    return NextResponse.json({ items, total });
});

export const POST = withAdmin(async (req, { me }) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Format de requête invalide' }, { status: 400 });
    }
    const checked = await validatePostItInput(body);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

    const row = await prisma.postIt.create({
        data: { ...checked.data, authorId: me.id },
        include: POST_IT_INCLUDE,
    });
    return NextResponse.json(serializePostIt(row, me), { status: 201 });
});
