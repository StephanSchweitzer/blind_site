import { Prisma, OrderBillingStatus, BillingStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { andClauses, buildOrderSearchWhere } from '@/lib/search';
import { getOpenOrderDelais, retardWhere, serializeDelaisFor, type Delai } from '@/lib/orders/delais';
import {
    blockedDuplicationWhere,
    findBlockedDuplications,
    serializeBlockedDuplications,
} from '@/lib/orders/duplicationBlocked';
import { resolveBookFilter } from '@/lib/books/bookFilter';
import { ordersTableInclude } from '@/types/models/order.model';
import { orderListOrderBy, parseOrderSort } from '@/lib/orders/orderSort';
import { outOfRangePage, pageInfo, pageSkip, parsePageParam, parsePageSizeParam } from '@/lib/pagination';

/**
 * La liste des demandes, telle que l'URL la décrit — une seule lecture des
 * paramètres et une seule clause `where`, pour /admin/orders et pour l'onglet
 * « Demandes » du dossier d'un auditeur.
 *
 * Les deux pages en portaient chacune une copie ; celle du dossier avait déjà
 * dérivé une fois (ses filtres écrasaient la recherche au lieu de s'y ajouter).
 * Elles ne diffèrent que par `aveugleId`, que le dossier fixe.
 */

const first = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw);

export type OrderListFilters = {
    search: string;
    /** `needsReturn` : livre prêté, demande pas encore clôturée. */
    filter: string;
    statusId?: number;
    billingStatus?: string;
    isDuplication?: string;
    retard?: string;
};

export function parseOrderListFilters(sp: Record<string, string | string[] | undefined>): OrderListFilters {
    const statusId = Number.parseInt(first(sp.statusId) ?? '', 10);
    return {
        search: first(sp.search) || '',
        filter: first(sp.filter) || 'all',
        statusId: Number.isFinite(statusId) ? statusId : undefined,
        billingStatus: first(sp.billingStatus),
        isDuplication: first(sp.isDuplication),
        retard: first(sp.retard),
    };
}

/**
 * La clause de la liste. `lifted` retire des filtres par leur nom de paramètre
 * d'URL — c'est ce qu'utilise « Essayez plutôt » (lib/search-rescue.ts).
 */
export function orderListWhere(
    f: OrderListFilters,
    ctx: { delais: Map<number, Delai>; bookId?: number; aveugleId?: number },
    lifted: string[] = [],
): Prisma.OrdersWhereInput {
    const on = (key: string) => !lifted.includes(key);
    const where: Prisma.OrdersWhereInput = {};

    if (ctx.aveugleId) where.aveugleId = ctx.aveugleId;
    // « Ce livre » — see lib/books/bookFilter.ts.
    if (ctx.bookId && on('bookId')) where.catalogueId = ctx.bookId;

    // One definition, shared with /api/orders — the two used to carry separate
    // copies of this clause and had already drifted apart.
    const tokenClauses = f.search ? buildOrderSearchWhere(f.search) : null;
    if (tokenClauses) where.AND = tokenClauses;

    if (f.filter === 'needsReturn' && on('filter')) {
        where.AND = [...andClauses(where), { lentPhysicalBook: true }, { closureDate: null }];
    }

    if (f.statusId && on('statusId')) where.statusId = f.statusId;

    if (on('billingStatus')) {
        if (f.billingStatus === 'PAID') {
            where.bill = { is: { state: BillingStatus.PAID } };
        } else if (f.billingStatus && f.billingStatus !== 'all') {
            where.billingStatus = f.billingStatus as OrderBillingStatus;
        }
    }

    if (on('isDuplication')) {
        if (f.isDuplication === 'true') where.isDuplication = true;
        else if (f.isDuplication === 'false') where.isDuplication = false;
        // Duplications that can't start yet — the book is still being recorded.
        else if (f.isDuplication === 'blocked') Object.assign(where, blockedDuplicationWhere);
    }

    // Délais par étape (lib/orders/delais.ts) — no longer « déposée il y a
    // plus de 3 mois », which flagged a book the day its lecteur started it.
    const retardClause = on('retard') ? retardWhere(f.retard, ctx.delais) : null;
    if (retardClause) where.AND = [...andClauses(where), retardClause];

    return where;
}

/* ─── Chargement d'une page de la liste ───────────────────────────────── */

export type OrderListPage = Awaited<ReturnType<typeof loadOrderList>>;

/**
 * Une page de demandes, prête pour `OrdersTable` : les lignes, la pagination,
 * le tri et ce que les badges des lignes lisent.
 *
 * `redirectToPage` est non nul quand `?page=` dépasse la fin (voir
 * `outOfRangePage`) : la page appelante redirige, hors de tout try/catch —
 * `redirect()` lève une exception que Next doit voir passer.
 */
export async function loadOrderList(
    sp: Record<string, string | string[] | undefined>,
    opts: { aveugleId?: number } = {},
) {
    const filters = parseOrderListFilters(sp);
    const sort = parseOrderSort(sp);
    const page = parsePageParam(sp.page);
    const pageSize = parsePageSizeParam(sp.perPage);
    const filterBook = await resolveBookFilter(sp.bookId);

    // Délais par étape — read once, used by the « Retard » filter, by the row
    // badges and by the rescue notes, so all three agree (lib/orders/delais.ts).
    const delais = await getOpenOrderDelais(opts.aveugleId ? { aveugleId: opts.aveugleId } : {});
    const ctx = { delais, bookId: filterBook?.id, aveugleId: opts.aveugleId };
    const whereFor = (search: string, lifted: string[] = []) =>
        orderListWhere({ ...filters, search }, ctx, lifted);
    const where = whereFor(filters.search);

    const [orders, total, statuses] = await Promise.all([
        prisma.orders.findMany({
            where,
            orderBy: orderListOrderBy(sort),
            skip: pageSkip(page, pageSize),
            take: pageSize,
            include: ordersTableInclude,
        }),
        prisma.orders.count({ where }),
        prisma.status.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    ]);

    const pagination = pageInfo(page, pageSize, total);

    // Derived on read, one query for the page — see lib/orders/duplicationBlocked.ts.
    const blockedDuplications = await findBlockedDuplications(orders);

    return {
        filters,
        filterBook,
        sort,
        pagination,
        redirectToPage: outOfRangePage(pagination, orders.length),
        statuses,
        delais,
        whereFor,
        rows: orders.map(serializeOrderRow),
        serializedDelais: serializeDelaisFor(orders.map((o) => o.id), delais),
        blockedDuplications: serializeBlockedDuplications(blockedDuplications),
    };
}

function serializeOrderRow(order: Prisma.OrdersGetPayload<{ include: typeof ordersTableInclude }>) {
    return {
        ...order,
        cost: order.cost ? Number(order.cost) : null,
        pricePerPage: order.pricePerPage != null ? Number(order.pricePerPage) : null,
        transferFee: order.transferFee != null ? Number(order.transferFee) : null,
        requestReceivedDate: order.requestReceivedDate.toISOString(),
        closureDate: order.closureDate ? order.closureDate.toISOString() : null,
        createdAt: order.createdDate ? order.createdDate.toISOString() : null,
        updatedAt: order.updatedAt ? order.updatedAt.toISOString() : null,
    };
}
