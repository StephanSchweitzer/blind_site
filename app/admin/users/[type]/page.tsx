import { prisma } from '@/lib/prisma';
import { Prisma, Language } from '@prisma/client';
import UsersTable from './users-table';
import { notFound } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { UserTypeTabs } from './user-type-tabs';
import { UserType, USER_TYPE_VALUES, isUserType } from '@/lib/user-enums';
import { activityStatusFilterWhere, effectivelyActiveWhere } from '@/lib/users/activityStatus';
import { LANGUAGE_VALUES } from '@/lib/user-enums';
import { cotisationCoverageQuery } from '@/lib/cotisation';
import { pageInfo, pageSkip, parsePageParam, parsePageSizeParam, redirectPastLastPage } from '@/lib/pagination';
import { buildUserNameSearch } from '@/lib/search';
import { rescueEmptySearch, rescueNote, RESCUE_CANDIDATES, type RescueFilter } from '@/lib/search-rescue';
import { getUserDisplayName } from '@/lib/users/displayName';
import { resolveEffectiveActivityStatus } from '@/lib/users/activityStatus';
import { getUserActivityStatusLabel } from '@/lib/user-activity-enums';
import { getAccessLevelLabel, getLanguageLabel, getMemberTypeLabel, USER_TYPE_META } from '@/lib/user-enums';
import type { RescueRow, RescueSuggestion } from '@/lib/search-suggestion-types';

interface PageProps {
    params: Promise<{ type: string }>;
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function generateStaticParams() {
    return USER_TYPE_VALUES.map((type) => ({ type }));
}

async function getUsers(
    page: number,
    pageSize: number,
    searchTerm: string,
    userType: UserType,
    statusFilter: string,
    languageFilter: string,
    cotisationFilter: string
) {
    const usersPerPage = pageSize;

    // Every where clause of the page, for a given search term — built as a
    // function so the « Essayez plutôt » block can count another term, the same
    // one with some filters `lifted` (keyed by URL parameter), or the same one
    // in another tab (`tab`) — see lib/search-rescue.ts.
    const wheresFor = (term: string, lifted: string[] = [], tab: UserType = userType) => {
        // Base filter: member type + free-text search. Status filter is applied
        // separately so the active/inactive counts always reflect the full set.
        const baseWhere: Prisma.UserWhereInput = tabWhere(tab);

        // Tokens AND-ed, each satisfiable by any name column, so "Leila Be" matches
        // firstName="Leila" + lastName="Bennour" and the order is irrelevant
        // ("Bennour Leila" works too). Handed to the shared builder rather than
        // spelled out here: this list used to carry its own copy, which left it the
        // only people-search that ignored the legacy `name` column and matched
        // apostrophes byte for byte. See buildUserNameSearch.
        const nameSearch = buildUserNameSearch(term);
        if (nameSearch?.AND) {
            baseWhere.AND = nameSearch.AND;
        }

        // "Scoped" population: base + search + language + cotisation, but NOT the
        // activity-status filter. The actifs/inactifs breakdown is computed over this
        // set so the two counts always reflect the current filters AND always sum to
        // the scoped total (active + inactive partitions it exactly).
        const scopedWhere: Prisma.UserWhereInput = { ...baseWhere };

        if (languageFilter && (LANGUAGE_VALUES as readonly string[]).includes(languageFilter) && !lifted.includes('language')) {
            scopedWhere.languages = { some: { language: languageFilter as Language } };
        }

        // Cotisation filter: "à jour" = has an active cotisation still in coverage;
        // "en retard" = none (covers both lapsed cotisations and no cotisation at all).
        // Mirrors lib/cotisation.ts computeCotisationStatus: calendar-year coverage via
        // cotisationYear, with the legacy rolling rule for rows that predate it.
        if ((cotisationFilter === 'a_jour' || cotisationFilter === 'en_retard') && !lifted.includes('cotisation')) {
            const { currentYear, legacyCutoff } = cotisationCoverageQuery();
            const cotisationMatch: Prisma.PaymentWhereInput = {
                type: 'COTISATION',
                isActive: true,
                OR: [
                    // Calendar-year: covers the current year or a prepaid future year.
                    { cotisationYear: { gte: currentYear } },
                    // Legacy rows without a cotisationYear: rolling 12 months.
                    {
                        AND: [
                            { cotisationYear: null },
                            {
                                OR: [
                                    { paymentDate: { gte: legacyCutoff } },
                                    { AND: [{ paymentDate: null }, { creationDate: { gte: legacyCutoff } }] },
                                ],
                            },
                        ],
                    },
                ],
            };
            scopedWhere.payments =
                cotisationFilter === 'a_jour' ? { some: cotisationMatch } : { none: cotisationMatch };
        }

        // The list adds the activity-status filter on top of the scoped population.
        // The filter matches the EFFECTIVE status (an unavailability whose window
        // is not in force reads as Actif), so it is a `where` fragment, not a plain
        // column comparison — wrapped in AND so it can't collide with the search's
        // own AND on scopedWhere.
        const statusWhere = lifted.includes('status') ? null : activityStatusFilterWhere(statusFilter);
        const listWhere: Prisma.UserWhereInput = statusWhere
            ? { AND: [scopedWhere, statusWhere] }
            : scopedWhere;
        const activeWhere: Prisma.UserWhereInput = { AND: [scopedWhere, effectivelyActiveWhere()] };
        const inactiveWhere: Prisma.UserWhereInput = {
            AND: [scopedWhere, { NOT: effectivelyActiveWhere() }],
        };
        return { listWhere, activeWhere, inactiveWhere };
    };
    const { listWhere, activeWhere, inactiveWhere } = wheresFor(searchTerm);

    try {
        const [users, totalUsers, activeCount, inactiveCount] = await Promise.all([
            prisma.user.findMany({
                where: listWhere,
                orderBy: { id: 'desc' },
                skip: pageSkip(page, usersPerPage),
                take: usersPerPage,
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    memberType: true,
                    accessLevel: true,
                    activityStatus: true,
                    unavailableFrom: true,
                    unavailableUntil: true,
                    lastUpdated: true,
                    civility: { select: { name: true } },
                },
            }),
            prisma.user.count({ where: listWhere }),
            prisma.user.count({ where: activeWhere }),
            prisma.user.count({ where: inactiveWhere }),
        ]);

        // Only when the search found nobody — see lib/search-rescue.ts.
        const searchSuggestions =
            totalUsers === 0 && searchTerm
                ? await rescueUsers(searchTerm, userType, wheresFor, { statusFilter, languageFilter, cotisationFilter })
                : [];

        return {
            users,
            // Scoped total = actifs + inactifs (they partition the scoped set), so
            // the summary line is always internally consistent.
            scopedTotal: activeCount + inactiveCount,
            activeCount,
            inactiveCount,
            pagination: pageInfo(page, pageSize, totalUsers),
            searchSuggestions,
        };
    } catch (error) {
        console.error('Error fetching users:', error);
        throw new Error('Failed to fetch users');
    }
}

/** Who each tab lists. */
function tabWhere(tab: UserType): Prisma.UserWhereInput {
    return tab === 'auditeurs' ? { memberType: 'auditeur' } :
        tab === 'lecteurs' ? { memberType: 'lecteur' } :
            tab === 'bienfaiteurs' ? { memberType: 'bienfaiteur' } :
                { accessLevel: { in: ['admin', 'super_admin'] } };
}

/**
 * « Essayez plutôt » for the membres — lib/search-rescue.ts. Besides the
 * filters, the other TABS are scopes: the commonest empty search here is a
 * lecteur looked for among the auditeurs, and « Trouvé dans « Lecteurs » »
 * answers it where « Vouliez-vous dire » never could.
 */
async function rescueUsers(
    search: string,
    userType: UserType,
    wheresFor: (term: string, lifted?: string[], tab?: UserType) => { listWhere: Prisma.UserWhereInput },
    active: { statusFilter: string; languageFilter: string; cotisationFilter: string },
): Promise<RescueSuggestion[]> {
    const filters: RescueFilter[] = [];
    const status = active.statusFilter;
    if (activityStatusFilterWhere(status)) {
        filters.push({
            key: 'status',
            label: status === 'ACTIVE' || status === 'active' ? 'Actifs'
                : status === 'inactive' ? 'Inactifs'
                    : `Statut : ${getUserActivityStatusLabel(status)}`,
        });
    }
    if (active.cotisationFilter === 'a_jour' || active.cotisationFilter === 'en_retard') {
        filters.push({
            key: 'cotisation',
            label: active.cotisationFilter === 'a_jour' ? 'Cotisation à jour' : 'Cotisation non à jour',
        });
    }
    if (active.languageFilter && (LANGUAGE_VALUES as readonly string[]).includes(active.languageFilter)) {
        filters.push({ key: 'language', label: `Langue : ${getLanguageLabel(active.languageFilter)}` });
    }
    const scopes: RescueFilter[] = USER_TYPE_VALUES
        .filter((tab) => tab !== userType)
        .map((tab) => ({ key: tab, label: USER_TYPE_META[tab].plural }));

    const whereOf = (q: { query: string; lifted: string[]; scope?: string }) =>
        wheresFor(q.query, q.lifted, isUserType(q.scope ?? '') ? (q.scope as UserType) : userType).listWhere;

    return rescueEmptySearch({
        search,
        domains: ['people'],
        filters,
        scopes,
        count: (q) => prisma.user.count({ where: whereOf(q) }),
        find: (q) =>
            prisma.user.findMany({
                where: whereOf(q),
                orderBy: { id: 'desc' },
                take: RESCUE_CANDIDATES,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    firstName: true,
                    lastName: true,
                    memberType: true,
                    accessLevel: true,
                    activityStatus: true,
                    unavailableFrom: true,
                    unavailableUntil: true,
                    languages: { select: { language: true } },
                },
            }),
        rankText: (u) => [u.firstName, u.lastName, u.name, u.email].filter(Boolean).join(' '),
        toRow: (u, q): RescueRow => ({
            id: u.id,
            title: getUserDisplayName(u),
            detail: [
                u.accessLevel === 'admin' || u.accessLevel === 'super_admin'
                    ? getAccessLevelLabel(u.accessLevel)
                    : u.memberType ? getMemberTypeLabel(u.memberType) : null,
                u.email,
            ].filter(Boolean).join(' · '),
            note: rescueNote(q.lifted, {
                status: () => getUserActivityStatusLabel(resolveEffectiveActivityStatus(u)),
                language: () => u.languages.map((l) => getLanguageLabel(l.language)).join(', ') || 'Aucune langue',
            }),
        }),
    });
}

export default async function UsersPage({ params, searchParams }: PageProps) {
    const me = await getCurrentUser();

    if (!me) {
        redirect('/login');
    }

    if (!isAdmin(me.accessLevel)) {
        redirect('/');
    }

    const resolvedParams = await params;
    const userType = resolvedParams.type;

    if (!isUserType(userType)) {
        notFound();
    }

    const searchParamsResolved = await searchParams;

    const page = parsePageParam(searchParamsResolved.page);
    const pageSize = parsePageSizeParam(searchParamsResolved.perPage);
    const searchTerm = Array.isArray(searchParamsResolved.search)
        ? searchParamsResolved.search[0]
        : searchParamsResolved.search || '';
    const statusFilter = Array.isArray(searchParamsResolved.status)
        ? searchParamsResolved.status[0]
        : searchParamsResolved.status || '';
    const languageFilter = Array.isArray(searchParamsResolved.language)
        ? searchParamsResolved.language[0]
        : searchParamsResolved.language || '';
    const cotisationFilter = Array.isArray(searchParamsResolved.cotisation)
        ? searchParamsResolved.cotisation[0]
        : searchParamsResolved.cotisation || '';

    // Only the data fetch is guarded. JSX is returned at the top level so render
    // errors propagate to an error boundary instead of being silently swallowed.
    let data: Awaited<ReturnType<typeof getUsers>>;
    try {
        data = await getUsers(page, pageSize, searchTerm, userType, statusFilter, languageFilter, cotisationFilter);
    } catch (error) {
        console.error('Error in Users page:', error);
        notFound();
    }

    const { users, pagination, scopedTotal, activeCount, inactiveCount, searchSuggestions } = data;
    redirectPastLastPage(`/admin/users/${userType}`, searchParamsResolved, pagination, users.length);

    const serializedUsers = users.map(user => ({
        ...user,
        lastUpdated: user.lastUpdated ? user.lastUpdated.toISOString() : null,
    }));

    return (
        <div className="space-y-6">
            <UserTypeTabs currentType={userType} />

            <UsersTable
                type={userType}
                initialUsers={serializedUsers}
                pagination={pagination}
                initialSearch={searchTerm}
                initialStatus={statusFilter}
                initialLanguage={languageFilter}
                initialCotisation={cotisationFilter}
                scopedTotal={scopedTotal}
                activeCount={activeCount}
                inactiveCount={inactiveCount}
                currentUserAccessLevel={me.accessLevel}
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}