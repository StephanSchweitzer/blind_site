import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isSuperAdmin, type CurrentUser } from '@/lib/auth/guards';
import { toDayStart } from '@/lib/users/activityStatus';
import { parisDayKey } from '@/lib/paris-day';
import { getUserDisplayName, getUserNameOnly } from '@/lib/users/displayName';
import { recordHref } from '@/lib/audit/labels';
import {
    POST_IT_LINK_LABELS,
    POST_IT_MAX_LENGTH,
    type PostItInput,
    type PostItItem,
    type PostItLink,
    type PostItLinkKind,
    type PostItPerson,
} from './types';

/**
 * Les post-its : lecture, mise en forme et validation, partagées par le tableau
 * de bord, la page /admin/post-its et l'API (app/api/post-its).
 *
 * Les droits tiennent en une règle : tout permanent lit les post-its et peut en
 * marquer un « Fait » (c'est un tableau commun, et le geste se défait) ; seuls
 * l'auteur et un super admin en modifient le texte ou le suppriment.
 */

const PERSON_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const NAMED_SELECT = { ...PERSON_SELECT, civility: { select: { name: true } } } as const;

export const POST_IT_INCLUDE = {
    author: { select: PERSON_SELECT },
    doneBy: { select: PERSON_SELECT },
    user: { select: { ...NAMED_SELECT, deletedAt: true } },
    order: {
        select: { id: true, deletedAt: true, aveugle: { select: NAMED_SELECT }, catalogue: { select: { title: true } } },
    },
    assignment: { select: { id: true, deletedAt: true, catalogue: { select: { title: true } } } },
    bill: { select: { id: true, deletedAt: true, isActive: true, client: { select: NAMED_SELECT } } },
} satisfies Prisma.PostItInclude;

type PostItRow = Prisma.PostItGetPayload<{ include: typeof POST_IT_INCLUDE }>;

/** Le prénom et le nom, sans civilité — c'est un collègue, pas un destinataire. */
function person(user: { id: number; firstName: string | null; lastName: string | null; email: string | null } | null): PostItPerson | null {
    if (!user) return null;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'Sans nom';
    return { id: user.id, name };
}

function href(kind: PostItLinkKind, id: number): string {
    const model = { user: 'User', order: 'Orders', assignment: 'Assignment', bill: 'Bill' }[kind];
    return recordHref(model, String(id)) ?? '/admin';
}

function linkOf(row: PostItRow): PostItLink | null {
    const make = (kind: PostItLinkKind, id: number, detail: string | null, deleted: boolean): PostItLink => ({
        kind,
        id,
        label: kind === 'user'
            ? detail || `${POST_IT_LINK_LABELS.user} #${id}`
            : `${POST_IT_LINK_LABELS[kind]} #${id}${detail ? ` — ${detail}` : ''}`,
        href: href(kind, id),
        deleted,
    });
    if (row.user) return make('user', row.user.id, getUserDisplayName(row.user), row.user.deletedAt !== null);
    if (row.order) {
        return make('order', row.order.id, getUserNameOnly(row.order.aveugle) || row.order.catalogue?.title || null, row.order.deletedAt !== null);
    }
    if (row.assignment) return make('assignment', row.assignment.id, row.assignment.catalogue?.title ?? null, row.assignment.deletedAt !== null);
    if (row.bill) {
        return make('bill', row.bill.id, getUserNameOnly(row.bill.client) || null, row.bill.deletedAt !== null || !row.bill.isActive);
    }
    return null;
}

/** Jour stocké à minuit UTC → 'YYYY-MM-DD', relu en UTC pour ne pas glisser d'un jour. */
const dayString = (date: Date | null): string | null => (date ? date.toISOString().slice(0, 10) : null);

export function canEditPostIt(me: CurrentUser, authorId: number | null): boolean {
    return isSuperAdmin(me.accessLevel) || (authorId !== null && authorId === me.id);
}

export function serializePostIt(row: PostItRow, me: CurrentUser, today = parisDayKey(new Date())): PostItItem {
    const remindOn = dayString(row.remindOn);
    return {
        id: row.id,
        content: row.content,
        remindOn,
        due: row.doneAt === null && remindOn !== null && remindOn <= today,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        doneAt: row.doneAt?.toISOString() ?? null,
        author: person(row.author),
        doneBy: person(row.doneBy),
        link: linkOf(row),
        canEdit: canEditPostIt(me, row.authorId),
    };
}

/**
 * Plafond des post-its ouverts lus d'un coup. Ce n'est pas une pagination : un
 * tableau qui en compte autant a cessé d'être un tableau de post-its, et ce
 * plafond garde au moins la page légère le jour où cela arrive.
 */
export const OPEN_POST_ITS_CAP = 200;

/**
 * L'ordre des post-its ouverts : ceux dont le jour de rappel est arrivé
 * d'abord (le plus ancien rappel en tête — il attend depuis le plus longtemps),
 * puis tous les autres, du plus récent au plus ancien. Un rappel encore à venir
 * ne remonte pas : il reste à sa place, sa date affichée, jusqu'à son jour.
 */
function sortOpen(items: PostItItem[]): PostItItem[] {
    return [...items].sort((a, b) => {
        if (a.due !== b.due) return a.due ? -1 : 1;
        if (a.due && b.due && a.remindOn !== b.remindOn) return a.remindOn! < b.remindOn! ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
    });
}

export interface PostItFilter {
    userId?: number;
    orderId?: number;
    assignmentId?: number;
    billId?: number;
}

export async function listOpenPostIts(me: CurrentUser, filter: PostItFilter = {}): Promise<{ items: PostItItem[]; total: number }> {
    const where: Prisma.PostItWhereInput = { doneAt: null, ...filter };
    const [rows, total] = await Promise.all([
        prisma.postIt.findMany({
            where,
            include: POST_IT_INCLUDE,
            orderBy: { createdAt: 'desc' },
            take: OPEN_POST_ITS_CAP,
        }),
        prisma.postIt.count({ where }),
    ]);
    const today = parisDayKey(new Date());
    return { items: sortOpen(rows.map((row) => serializePostIt(row, me, today))), total };
}

export async function listDonePostIts(
    me: CurrentUser,
    page: number,
    limit: number,
): Promise<{ items: PostItItem[]; total: number }> {
    const where: Prisma.PostItWhereInput = { doneAt: { not: null } };
    const [rows, total] = await Promise.all([
        prisma.postIt.findMany({
            where,
            include: POST_IT_INCLUDE,
            orderBy: [{ doneAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.postIt.count({ where }),
    ]);
    const today = parisDayKey(new Date());
    return { items: rows.map((row) => serializePostIt(row, me, today)), total };
}

// ── validation ──────────────────────────────────────────────────────────────

export type PostItValidation =
    | { ok: true; data: { content: string; remindOn: Date | null; userId: number | null; orderId: number | null; assignmentId: number | null; billId: number | null } }
    | { ok: false; status: number; error: string };

const LINK_KINDS = Object.keys(POST_IT_LINK_LABELS) as PostItLinkKind[];

/**
 * Un lien doit viser une ligne qui existe et n'est pas supprimée : un post-it
 * lié à une demande supprimée ne mènerait nulle part. (S'il l'est après coup,
 * le lien reste, barré — c'est `deleted` dans PostItLink.)
 */
async function linkTargetExists(kind: PostItLinkKind, id: number): Promise<boolean> {
    switch (kind) {
        case 'user':
            return (await prisma.user.count({ where: { id } })) > 0;
        case 'order':
            return (await prisma.orders.count({ where: { id } })) > 0;
        case 'assignment':
            return (await prisma.assignment.count({ where: { id } })) > 0;
        case 'bill':
            return (await prisma.bill.count({ where: { id, isActive: true, deletedAt: null } })) > 0;
    }
}

const NOT_FOUND_LINK: Record<PostItLinkKind, string> = {
    user: 'Cette fiche est introuvable.',
    order: 'Aucune demande ne porte ce numéro.',
    assignment: 'Aucune attribution ne porte ce numéro.',
    bill: 'Aucune facture ne porte ce numéro.',
};

/** Lit et vérifie le corps d'un POST ou d'un PATCH complet. */
export async function validatePostItInput(body: unknown): Promise<PostItValidation> {
    const input = (body ?? {}) as Partial<PostItInput>;
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!content) return { ok: false, status: 400, error: 'Le post-it est vide.' };
    if (content.length > POST_IT_MAX_LENGTH) {
        return { ok: false, status: 400, error: `Un post-it tient en ${POST_IT_MAX_LENGTH} caractères au plus.` };
    }

    let remindOn: Date | null = null;
    if (input.remindOn !== null && input.remindOn !== undefined && input.remindOn !== '') {
        remindOn = typeof input.remindOn === 'string' ? toDayStart(input.remindOn) : null;
        if (!remindOn) return { ok: false, status: 400, error: 'La date de rappel est invalide.' };
    }

    const links = { userId: null, orderId: null, assignmentId: null, billId: null } as {
        userId: number | null; orderId: number | null; assignmentId: number | null; billId: number | null;
    };
    const link = input.link;
    if (link !== null && link !== undefined) {
        const kind = link.kind;
        const id = Number(link.id);
        if (!LINK_KINDS.includes(kind as PostItLinkKind) || !Number.isInteger(id) || id <= 0) {
            return { ok: false, status: 400, error: 'Le lien du post-it est invalide.' };
        }
        if (!(await linkTargetExists(kind, id))) return { ok: false, status: 400, error: NOT_FOUND_LINK[kind] };
        links[`${kind}Id` as keyof typeof links] = id;
    }

    return { ok: true, data: { content, remindOn, ...links } };
}
