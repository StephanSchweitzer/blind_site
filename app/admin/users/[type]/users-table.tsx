'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Search, X, Plus } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { AddUserFormBackend } from '@/admin/AddUserFormBackend';
import { EditUserModal, loadUserForEdit } from '@/admin/EditUserModal';
import { useRecordLoader } from '@/hooks/useRecordLoader';
import { UserType } from '@/types';
import {
    getAccessLevelLabel,
    getAccessLevelColor,
    USER_TYPE_META,
    LANGUAGE_VALUES,
    getLanguageLabel,
} from '@/lib/user-enums';
import {
    OFFERED_USER_ACTIVITY_STATUSES,
    LEGACY_USER_ACTIVITY_STATUSES,
    getUserActivityStatusLabel,
    getUserActivityStatusColor,
} from '@/lib/user-activity-enums';
import { describeUnavailability, resolveEffectiveActivityStatus } from '@/lib/users/activityStatus';
import { CopyIdButton } from '@/admin/CopyableId';
import { MobileFilters } from '@/admin/MobileFilters';
import { parisDate } from '@/lib/paris-day';
import { AideLink } from '@/components/ui/admin/AideLink';
import { SearchRescue } from '@/components/ui/search-rescue';
import type { RescueSuggestion } from '@/lib/search-suggestion-types';
import type { PageInfo } from '@/lib/pagination';
import { AdminPaginatedList } from '@/admin/AdminPagination';

interface UsersTableProps {
    type: UserType;
    initialUsers: Array<{
        id: number;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        memberType: string;
        accessLevel: string;
        activityStatus: string;
        unavailableFrom: Date | string | null;
        unavailableUntil: Date | string | null;
        lastUpdated: string | null;
        civility?: { name: string } | null;
    }>;
    /** Page courante, taille, total — lib/pagination.ts `pageInfo`. */
    pagination: PageInfo;
    initialSearch: string;
    initialStatus: string;
    initialLanguage: string;
    initialCotisation: string;
    scopedTotal: number;
    activeCount: number;
    inactiveCount: number;
    currentUserAccessLevel?: string;
    /** « Vouliez-vous dire … ? », computed only when the search found nobody. */
    searchSuggestions?: RescueSuggestion[];
    /** The same search's matches in the OTHER tabs, when this one found someone. */
    alsoFoundIn?: { tab: string; label: string; count: number }[];
}

/**
 * Status badge: the EFFECTIVE status, with the end date of an unavailability
 * spelled out under it. A window that has elapsed, or has not started, simply
 * reads as Actif — nothing rewrote the row.
 */
function StatusCell({
    user,
}: {
    user: { activityStatus: string; unavailableFrom: Date | string | null; unavailableUntil: Date | string | null };
}) {
    const status = resolveEffectiveActivityStatus(user);
    const detail = describeUnavailability(user);

    return (
        <div className="flex flex-col gap-0.5">
            <span className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-xs font-medium ${getUserActivityStatusColor(status)}`}>
                {getUserActivityStatusLabel(status)}
            </span>
            {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        </div>
    );
}

export default function UsersTable({
                                       type,
                                       initialUsers,
                                       pagination,
                                       initialSearch,
                                       initialStatus,
                                       initialLanguage,
                                       initialCotisation,
                                       scopedTotal,
                                       activeCount,
                                       inactiveCount,
                                       currentUserAccessLevel,
                                       searchSuggestions,
                                       alsoFoundIn = [],
                                   }: UsersTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    // Pagination : un clic simple navigue dans une transition, pour griser la liste.
    const navigate = (href: string) => startTransition(() => router.push(href, { scroll: false }));

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const { data: session } = useSession();
    // Creating a permanent is a super_admin-only gesture (it's an accessLevel
    // change — see CLAUDE.md); any other tab (auditeurs, lecteurs,
    // bienfaiteurs) is open to admins too.
    const canCreateUsers = type === 'permanents'
        ? session?.user.accessLevel === 'super_admin'
        : session?.user.accessLevel === 'admin' || session?.user.accessLevel === 'super_admin';
    const [statusFilter, setStatusFilter] = useState(initialStatus || 'all');
    const [languageFilter, setLanguageFilter] = useState(initialLanguage || 'all');
    const [cotisationFilter, setCotisationFilter] = useState(initialCotisation || 'all');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const { plural, singular } = USER_TYPE_META[type];

    // Which activity segment (if any) the current status filter is showing. The
    // actif/inactif figures double as toggle chips that drive this filter.
    const activeSelected = statusFilter === 'ACTIVE' || statusFilter === 'active';
    const inactiveSelected = statusFilter === 'inactive';

    const updateUrl = (updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        });
        startTransition(() => {
            router.push(`?${params.toString()}`);
        });
    };

    const handleSearch = () => {
        updateUrl({ search: searchTerm || undefined, page: '1' });
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        updateUrl({ search: undefined, page: '1' });
    };

    const handleStatusFilter = (value: string) => {
        setStatusFilter(value);
        updateUrl({ status: value === 'all' ? undefined : value, page: '1' });
    };

    const handleLanguageFilter = (value: string) => {
        setLanguageFilter(value);
        updateUrl({ language: value === 'all' ? undefined : value, page: '1' });
    };

    const handleCotisationFilter = (value: string) => {
        setCotisationFilter(value);
        updateUrl({ cotisation: value === 'all' ? undefined : value, page: '1' });
    };

    const handleUserAdded = () => {
        setIsAddModalOpen(false);
        router.refresh();
    };

    // One request per open; the modal opens at once on its skeleton. Row click
    // and the ?user= deep link go through the same path.
    const userLoader = useRecordLoader(loadUserForEdit);
    const openUserById = (userId: number | string) => userLoader.open(String(userId));

    const closeUserModal = () => {
        userLoader.close();
        clearUserParam();
        // The activity-status changer (UserActivityHistory) inside this modal
        // persists via its own request without refreshing the table; the main-form
        // save path doesn't run for a status-only change. Refresh on close so the
        // new status shows without a hard reload.
        router.refresh();
    };

    const handleRowClick = (user: typeof initialUsers[0]) => openUserById(user.id);

    // Deep-link: open the edit modal when arriving with ?user=<id>.
    // openedRef prevents re-firing on router.refresh() / re-render for the same id.
    const userParam = searchParams.get('user');
    const openedRef = useRef<string | null>(null);

    useEffect(() => {
        if (userParam && openedRef.current !== userParam) {
            openedRef.current = userParam;
            openUserById(userParam);
        } else if (!userParam) {
            openedRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userParam]);

    const clearUserParam = () => {
        // No deep-link param to clear (the normal row-click edit case): do nothing.
        if (!searchParams.get('user')) return;
        const params = new URLSearchParams(searchParams.toString());
        params.delete('user');
        // Use the History API, not router.replace(), so dropping the param doesn't
        // start a navigation that pre-empts the router.refresh() fired right after it.
        const qs = params.toString();
        window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname);
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Non disponible';
        return parisDate(dateString, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    return (
        <Card className="border-border bg-card shadow-xl">
            <CardHeader className="border-b border-border">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-2xl text-foreground">{plural}</CardTitle>
                            <AideLink section="membres" />
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
                            <span>
                                {scopedTotal} {singular}{scopedTotal > 1 ? 's' : ''} au total
                            </span>
                            <span aria-hidden className="text-muted-foreground/50">&#8226;</span>
                            <button
                                type="button"
                                aria-pressed={activeSelected}
                                onClick={() => handleStatusFilter(activeSelected ? 'all' : 'ACTIVE')}
                                title={activeSelected ? 'Retirer le filtre' : 'Afficher uniquement les actifs'}
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium transition-colors ${
                                    activeSelected
                                        ? 'bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${activeSelected ? 'bg-emerald-400' : 'bg-emerald-500/50'}`} />
                                {activeCount} actif{activeCount > 1 ? 's' : ''}
                            </button>
                            <button
                                type="button"
                                aria-pressed={inactiveSelected}
                                onClick={() => handleStatusFilter(inactiveSelected ? 'all' : 'inactive')}
                                title={inactiveSelected ? 'Retirer le filtre' : 'Afficher uniquement les inactifs'}
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium transition-colors ${
                                    inactiveSelected
                                        ? 'bg-red-100 text-red-900 ring-1 ring-inset ring-red-300 dark:bg-red-950 dark:text-red-300 dark:ring-red-800'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${inactiveSelected ? 'bg-red-400' : 'bg-red-500/50'}`} />
                                {inactiveCount} inactif{inactiveCount > 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                    {canCreateUsers && (
                        <Button
                            onClick={() => setIsAddModalOpen(true)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Ajouter un membre
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-6">
                    <div className="flex flex-1 gap-2 sm:min-w-[280px]">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher par nom, email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
                            />
                        </div>
                        <Button onClick={handleSearch} size="icon" className="shrink-0 bg-card border border-border text-foreground hover:bg-muted hover:text-white">
                            <Search className="h-4 w-4" />
                        </Button>
                        {searchTerm && (
                            <Button onClick={handleClearSearch} size="icon" variant="ghost" className="shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted">
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    <MobileFilters
                        activeCount={[
                            statusFilter !== 'all' && statusFilter !== '',
                            cotisationFilter !== 'all',
                            type === 'lecteurs' && languageFilter !== 'all',
                        ].filter(Boolean).length}
                        className="flex flex-col md:flex-row md:flex-wrap gap-2"
                    >
                    <Select value={statusFilter} onValueChange={handleStatusFilter}>
                        <SelectTrigger className="bg-card border-border text-foreground sm:w-56">
                            <SelectValue placeholder="Statut" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all" className="text-foreground">Tous les statuts</SelectItem>
                            <SelectItem value="inactive" className="text-foreground">Inactifs (tous sauf actifs)</SelectItem>
                            {OFFERED_USER_ACTIVITY_STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="text-foreground">
                                    {getUserActivityStatusLabel(s)}
                                </SelectItem>
                            ))}
                            {/* Retired statuses stay filterable so the people left
                                on them can still be found — just listed apart. */}
                            {LEGACY_USER_ACTIVITY_STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="text-muted-foreground">
                                    {getUserActivityStatusLabel(s)} (ancien)
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={cotisationFilter} onValueChange={handleCotisationFilter}>
                        <SelectTrigger className="bg-card border-border text-foreground sm:w-52">
                            <SelectValue placeholder="Cotisation" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all" className="text-foreground">Toutes les cotisations</SelectItem>
                            <SelectItem value="a_jour" className="text-foreground">Cotisation à jour</SelectItem>
                            <SelectItem value="en_retard" className="text-foreground">Cotisation non à jour</SelectItem>
                        </SelectContent>
                    </Select>
                    {type === 'lecteurs' && (
                        <Select value={languageFilter} onValueChange={handleLanguageFilter}>
                            <SelectTrigger className="bg-card border-border text-foreground sm:w-48">
                                <SelectValue placeholder="Langue" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                <SelectItem value="all" className="text-foreground">Toutes les langues</SelectItem>
                                {LANGUAGE_VALUES.map((l) => (
                                    <SelectItem key={l} value={l} className="text-foreground">
                                        {getLanguageLabel(l)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    </MobileFilters>
                </div>

                {/* Another tab: its own page, the search and filters carried over —
                    the same link « Essayez plutôt » builds when nobody is found. */}
                {initialUsers.length > 0 && alsoFoundIn.length > 0 && (
                    <p className="-mt-3 mb-4 text-sm text-muted-foreground">
                        Aussi dans :{' '}
                        {alsoFoundIn.map((t, i) => {
                            const params = new URLSearchParams(searchParams.toString());
                            params.delete('page');
                            return (
                                <span key={t.tab}>
                                    {i > 0 && <span aria-hidden className="text-muted-foreground/50"> · </span>}
                                    <Link
                                        href={`/admin/users/${t.tab}?${params.toString()}`}
                                        className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                                    >
                                        {t.label} ({t.count})
                                    </Link>
                                </span>
                            );
                        })}
                    </p>
                )}

                <AdminPaginatedList
                    info={pagination}
                    noun={{ one: singular, many: `${singular}s`, feminine: false }}
                    label="Pages de la liste"
                    onNavigate={navigate}
                    pending={isPending}
                >
                <div className="space-y-6">
                    {initialUsers.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center border border-border rounded-lg bg-card/50">
                            <p className="text-muted-foreground text-lg">Aucun {singular} trouv&#233;</p>
                            <SearchRescue
                                suggestions={searchSuggestions}
                                unit={{ one: 'personne', many: 'personnes', feminine: true }}
                                onApply={(s) => {
                                    setSearchTerm(s.query);
                                    // A lifted filter is its URL parameter, cleared.
                                    const lifted = Object.fromEntries(s.lifted.map((key) => [key, undefined]));
                                    if (s.kind === 'scope' && s.scope) {
                                        // Another tab: its own page, the other filters carried over.
                                        const params = new URLSearchParams(searchParams.toString());
                                        params.set('search', s.query);
                                        params.delete('page');
                                        startTransition(() => router.push(`/admin/users/${s.scope}?${params.toString()}`));
                                        return;
                                    }
                                    updateUrl({ ...lifted, search: s.query, page: '1' });
                                }}
                                onOpenRow={(row, s) => {
                                    // The dialogue is shaped by its tab's member type: a person
                                    // from another tab opens there, through its deep link.
                                    if (s.kind === 'scope' && s.scope) {
                                        router.push(`/admin/users/${s.scope}?user=${row.id}`);
                                    } else {
                                        openUserById(row.id);
                                    }
                                }}
                            />
                        </div>
                    ) : (
                        <div className="border border-border rounded-lg overflow-clip">
                            <div>
                                <Table stickyHeader mobileCards>
                                    <TableHeader className="bg-card">
                                        <TableRow className="border-b border-border hover:bg-muted">
                                            <TableHead className="text-foreground font-medium">ID</TableHead>
                                            {/* Le nom d'abord : c'est par lui qu'on cherche quelqu'un, et
                                                beaucoup d'auditeurs n'ont pas d'email. */}
                                            <TableHead className="text-foreground font-medium">Nom complet</TableHead>
                                            <TableHead className="text-foreground font-medium">Email</TableHead>
                                            {/* Sur un onglet d'un seul type de membre, une colonne \u00ab Type \u00bb
                                                r\u00e9p\u00e9terait l'onglet sur chaque ligne ; seuls les permanents
                                                ont une valeur qui varie : leur niveau d'acc\u00e8s. */}
                                            {type === 'permanents' && (
                                                <TableHead className="text-foreground font-medium">Niveau d&apos;acc&#232;s</TableHead>
                                            )}
                                            <TableHead className="text-foreground font-medium">Statut</TableHead>
                                            <TableHead className="text-foreground font-medium">Derni&#232;re mise &#224; jour</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialUsers.map((user) => (
                                            <TableRow
                                                key={user.id}
                                                onClick={() => handleRowClick(user)}
                                                className="group border-b border-border hover:bg-muted cursor-pointer"
                                            >
                                                <TableCell className="font-medium text-foreground whitespace-nowrap">
                                                    <CopyIdButton id={user.id} label="de la personne" />
                                                </TableCell>
                                                <TableCell className="font-medium text-foreground">
                                                    {(user.firstName || user.lastName || user.civility)
                                                        ? `${user.civility?.name ? user.civility.name + ' ' : ''}${user.firstName || ''} ${user.lastName || ''}`.trim()
                                                        : <span className="font-normal text-muted-foreground italic">Non d&#233;fini</span>}
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    {user.email || <span className="text-muted-foreground italic">Non d&#233;fini</span>}
                                                </TableCell>
                                                {type === 'permanents' && (
                                                    <TableCell>
                                                        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${getAccessLevelColor(user.accessLevel)}`}>
                                                            {getAccessLevelLabel(user.accessLevel)}
                                                        </span>
                                                    </TableCell>
                                                )}
                                                <TableCell>
                                                    <StatusCell user={user} />
                                                </TableCell>
                                                <TableCell className="text-foreground">{formatDate(user.lastUpdated)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                </div>

                </AdminPaginatedList>
            </CardContent>

            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Ajouter une nouvelle personne</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddUserFormBackend
                            onSuccess={handleUserAdded}
                            userType={type}
                            currentUserAccessLevel={currentUserAccessLevel}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            {userLoader.openId && (
                <EditUserModal
                    // A fresh form per person: its state is seeded from the loaded record once.
                    key={userLoader.openId}
                    isOpen
                    onOpenChange={(open) => { if (!open) closeUserModal(); }}
                    userId={userLoader.openId}
                    user={userLoader.data}
                    error={userLoader.error}
                    currentUserAccessLevel={currentUserAccessLevel}
                    userType={type}
                />
            )}
        </Card>
    );
}