'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState, useCallback, useRef } from 'react';
import { newsTypeLabels, type NewsType } from '@/types/news';
import NewsTypeBadge from '@/components/NewsTypeBadge';
import { CopyableId, CopyIdButton } from '@/admin/CopyableId';
import {
    AddNewsFormBackend,
    EditNewsFormBackend,
    type NewsFormData,
} from '@/admin/NewsFormBackendBase';
import { toast } from '@/hooks/use-toast';
import { CircleX, Loader2, Plus, Search } from 'lucide-react';
import { parisDate } from '@/lib/paris-day';
import { AideLink } from '@/components/ui/admin/AideLink';
import { SearchRescue } from '@/components/ui/search-rescue';
import { ADMIN_PAGE_SIZE, pageInfo, parsePageParam, parsePageSizeParam } from '@/lib/pagination';
import { AdminPaginatedList } from '@/admin/AdminPagination';
import {
    NEWS_SEARCH_FIELDS,
    NEWS_SEARCH_FIELD_LABELS,
    type AdminNewsQuery,
    type AdminNewsResult,
    type NewsSearchField,
} from '@/lib/news/news-list-types';

const DEBOUNCE_DELAY = 300;
const NEWS_TYPES = Object.keys(newsTypeLabels) as NewsType[];

interface ArticlesTableProps {
    /** Server-rendered results for `initialQuery` — the first paint needs no fetch. */
    initial: AdminNewsResult;
    initialQuery: AdminNewsQuery;
}

/** The part of a query that decides the results — what the fetch is keyed on. */
type ListQuery = Pick<AdminNewsQuery, 'search' | 'field' | 'type' | 'page' | 'limit'>;
const queryKey = (q: ListQuery) => JSON.stringify([q.search.trim(), q.field, q.type, q.page, q.limit]);

/**
 * La requête de la liste, telle qu'elle s'écrit dans l'URL — pour `updateURL`
 * et pour les liens de la barre de pages, qui ne voit pas les écritures de
 * `history.replaceState` (voir `query`, components/ui/admin/AdminPagination.tsx).
 */
function newsListQuery(q: ListQuery): URLSearchParams {
    const params = new URLSearchParams();
    if (q.search.trim()) params.set('search', q.search);
    if (q.field !== 'all') params.set('field', q.field);
    if (q.type) params.set('type', q.type);
    if (q.page > 1) params.set('page', q.page.toString());
    if (q.limit !== ADMIN_PAGE_SIZE) params.set('perPage', q.limit.toString());
    return params;
}

/**
 * Les dernières infos du back-office.
 *
 * La recherche suit le modèle de la table des livres (app/admin/books/
 * books-table.tsx), et pour les mêmes raisons. Elle naviguait avec
 * `router.push` à chaque frappe, ce qui refaisait tout le rendu serveur de la
 * page : la table se vidait puis se remplissait, et une réponse lente pouvait
 * arriver après une plus récente. Ici la table interroge /api/news/search
 * elle-même, annule la requête dépassée, et garde l'URL à jour par l'History API
 * — recharger ou partager le lien redonne la même vue.
 */
export function ArticlesTable({ initial, initialQuery }: ArticlesTableProps) {
    const searchParams = useSearchParams();

    const [searchTerm, setSearchTerm] = useState(initialQuery.search);
    const [field, setField] = useState<NewsSearchField>(initialQuery.field);
    const [type, setType] = useState<NewsType | null>(initialQuery.type);
    const [currentPage, setCurrentPage] = useState(initialQuery.page);
    const [pageSize, setPageSize] = useState(initialQuery.limit);
    const [results, setResults] = useState<AdminNewsResult>(initial);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [isAddOpen, setIsAddOpen] = useState(false);
    /** Article open in the edit dialogue, with the content the list doesn't carry. */
    const [editing, setEditing] = useState<{ id: number; data: NewsFormData } | null>(null);
    const [isLoadingArticle, setIsLoadingArticle] = useState(false);

    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    /** The query `results` currently answers; a matching query skips the fetch. */
    const shownKeyRef = useRef(queryKey(initialQuery));

    // History API, not router.replace: a router navigation would re-render
    // page.tsx on the server — the very flicker this table exists to avoid.
    // The `news` deep-link survives, so a dialogue opened by it isn't orphaned.
    const updateURL = useCallback((q: ListQuery) => {
        const params = newsListQuery(q);
        const deepLink = new URLSearchParams(window.location.search).get('news');
        if (deepLink) params.set('news', deepLink);
        const qs = params.toString();
        window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname);
    }, []);

    const performSearch = useCallback(async (q: ListQuery, force = false) => {
        const key = queryKey(q);
        if (!force && key === shownKeyRef.current) {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
            setIsSearching(false);
            return;
        }

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        updateURL(q);
        setIsSearching(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                search: q.search,
                field: q.field,
                page: q.page.toString(),
                limit: q.limit.toString(),
                // « Vouliez-vous dire … ? » when nothing is found — see lib/search-suggest.ts.
                suggest: '1',
            });
            if (q.type) params.set('type', q.type);

            const response = await fetch(`/api/news/search?${params}`, {
                signal: controller.signal,
                cache: 'no-store',
            });
            if (!response.ok) throw new Error('Search failed');
            const data = (await response.json()) as AdminNewsResult;
            if (abortControllerRef.current !== controller) return;
            setResults(data);
            shownKeyRef.current = key;
            // Au-delà de la dernière page (infos supprimées depuis, lien périmé) :
            // on retombe sur la dernière — voir lib/pagination.ts.
            if (data.items.length === 0 && data.total > 0 && q.page > data.totalPages) {
                setCurrentPage(data.totalPages);
            }
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                setError('Une erreur s’est produite lors de la recherche.');
                console.error('News search error:', err);
            }
        } finally {
            // A superseded request settles after its replacement started:
            // clearing the flag here would hide the spinner too early.
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
                setIsSearching(false);
            }
        }
    }, [updateURL]);

    // Debounced while a term is typed, immediate for a click on a filter or a page.
    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            void performSearch({ search: searchTerm, field, type, page: currentPage, limit: pageSize });
        }, searchTerm ? DEBOUNCE_DELAY : 0);
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [searchTerm, field, type, currentPage, pageSize, performSearch]);

    useEffect(() => () => {
        abortControllerRef.current?.abort();
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    }, []);

    const handleSearchChange = useCallback((value: string) => {
        // Drop the in-flight request at the keystroke rather than when the
        // debounce fires, so its older results can't land mid-typing.
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setIsSearching(true);
        setSearchTerm(value);
        setCurrentPage(1);
    }, []);

    const handleFieldChange = useCallback((value: NewsSearchField) => {
        setField(value);
        setCurrentPage(1);
    }, []);

    /** A type pill toggles: clicking the selected one clears the filter. */
    const handleTypeClick = useCallback((value: NewsType | null) => {
        setType((current) => (current === value ? null : value));
        setCurrentPage(1);
    }, []);

    // La barre de pages donne une adresse (lien réel, pour l'ouvrir ailleurs) ;
    // ici on n'en lit que la page et la taille, la liste se recharge seule.
    const navigate = useCallback((href: string) => {
        const params = new URL(href, window.location.origin).searchParams;
        setPageSize(parsePageSizeParam(params.get('perPage')));
        setCurrentPage(parsePageParam(params.get('page')));
    }, []);
    const listInfo = pageInfo(currentPage, pageSize, results.total);

    /** After a save or a deletion: same view, fresh rows and counts. */
    const refresh = useCallback(() => {
        void performSearch({ search: searchTerm, field, type, page: currentPage, limit: pageSize }, true);
    }, [performSearch, searchTerm, field, type, currentPage, pageSize]);

    // The list only carries title/type/date — the content comes from the API
    // when the dialogue opens, the same way the catalogue loads a book.
    const openArticle = useCallback(async (articleId: number) => {
        setIsLoadingArticle(true);
        try {
            const res = await fetch(`/api/news/${articleId}`, {
                headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
            });
            if (!res.ok) throw new Error('Échec du chargement');
            const article = await res.json();
            setEditing({
                id: articleId,
                data: {
                    title: article.title ?? '',
                    content: article.content ?? '',
                    type: article.type ?? 'GENERAL',
                },
            });
        } catch {
            toast({
                title: 'Erreur',
                description: 'Échec du chargement de l’information. Veuillez réessayer.',
                variant: 'destructive',
            });
        } finally {
            setIsLoadingArticle(false);
        }
    }, []);

    // Deep-link: open the edit dialogue directly from /admin/news?news=<id>.
    // openedRef prevents re-firing on re-render for the same id.
    const newsParam = searchParams.get('news');
    const openedNewsRef = useRef<string | null>(null);

    useEffect(() => {
        if (newsParam && openedNewsRef.current !== newsParam) {
            openedNewsRef.current = newsParam;
            void openArticle(parseInt(newsParam, 10));
        } else if (!newsParam) {
            openedNewsRef.current = null;
        }
    }, [newsParam, openArticle]);

    // Strip the `news` param so closing/reopening behaves cleanly and the
    // deep-link state doesn't linger after the dialogue is dismissed.
    // Read from the live URL rather than `searchParams`: the table rewrites the
    // query string itself (updateURL), and this must keep what it wrote.
    const clearNewsParam = useCallback(() => {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('news')) return;
        params.delete('news');
        const qs = params.toString();
        window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname);
    }, []);

    const handleEditClick = useCallback((e: React.MouseEvent, articleId: number) => {
        e.stopPropagation();
        void openArticle(articleId);
    }, [openArticle]);

    const handleSaved = useCallback(() => {
        setEditing(null);
        setIsAddOpen(false);
        clearNewsParam();
        refresh();
    }, [refresh, clearNewsParam]);

    const items = results.items;
    const hasFilters = !!searchTerm.trim() || type !== null;
    // Types worth a pill: those the current search finds, plus the selected one
    // even at zero — otherwise the only way to clear it would vanish.
    const typePills = NEWS_TYPES.filter((t) => results.typeCounts[t] > 0 || t === type);

    return (
        <Card className="bg-card border-border">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4 border-b border-border">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-foreground">Gérer les dernières infos</CardTitle>
                        <AideLink section="pages-publiques" />
                    </div>
                    <CardDescription className="text-muted-foreground">
                        Gérer et modifier les informations affichées sur Dernières infos
                    </CardDescription>
                    <div className="text-sm text-muted-foreground mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
                        <button
                            type="button"
                            aria-pressed={type === null}
                            onClick={() => handleTypeClick(null)}
                            title="Tous les types"
                            className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-medium transition-colors ${
                                type === null
                                    ? 'bg-muted text-foreground ring-1 ring-inset ring-border'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                        >
                            {results.allCount} info{results.allCount !== 1 ? 's' : ''}
                            {searchTerm.trim() ? ' trouvée' + (results.allCount !== 1 ? 's' : '') : ' au total'}
                        </button>
                        {typePills.map((t) => (
                            <span key={t} className="contents">
                                <span aria-hidden className="text-muted-foreground/50">&#8226;</span>
                                <button
                                    type="button"
                                    aria-pressed={type === t}
                                    onClick={() => handleTypeClick(t)}
                                    title={type === t ? 'Retirer le filtre' : `Afficher uniquement : ${newsTypeLabels[t]}`}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium transition-colors ${
                                        type === t
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                >
                                    {newsTypeLabels[t]}
                                    <span className="tabular-nums">{results.typeCounts[t]}</span>
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
                <Button
                    className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                    onClick={() => setIsAddOpen(true)}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Ajouter une info
                </Button>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:items-end mb-4">
                    <div className="relative w-full sm:flex-1 sm:max-w-xl">
                        <Input
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Rechercher les dernières infos..."
                            aria-label="Rechercher les dernières infos"
                            className="pl-10 pr-10 bg-card text-foreground border-border placeholder:text-muted-foreground"
                        />
                        <Search className="absolute left-3 top-2.5 text-muted-foreground" size={20} aria-hidden="true" />
                        {isSearching && searchTerm.length > 0 && (
                            <Loader2 className="absolute right-3 top-2.5 text-muted-foreground animate-spin" size={20} aria-hidden="true" />
                        )}
                        {!isSearching && searchTerm.length > 0 && (
                            <button
                                type="button"
                                onClick={() => handleSearchChange('')}
                                aria-label="Effacer la recherche"
                                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors rounded-full"
                            >
                                <CircleX aria-hidden="true" size={20} />
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col gap-1 w-full sm:w-44">
                        <label htmlFor="news-search-field" className="text-xs font-medium text-muted-foreground">
                            Rechercher dans
                        </label>
                        <select
                            id="news-search-field"
                            value={field}
                            onChange={(e) => handleFieldChange(e.target.value as NewsSearchField)}
                            className="w-full px-4 py-2 rounded-md bg-card text-foreground border-border focus:ring-2 focus:ring-ring"
                        >
                            {NEWS_SEARCH_FIELDS.map((f) => (
                                <option key={f} value={f}>{NEWS_SEARCH_FIELD_LABELS[f]}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && (
                    <div role="alert" className="text-center py-4 bg-red-50 text-red-700 rounded-lg border border-red-200 mb-4 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800">
                        {error}
                    </div>
                )}

                <AdminPaginatedList
                    info={listInfo}
                    query={newsListQuery({ search: searchTerm, field, type, page: currentPage, limit: pageSize }).toString()}
                    noun={{ one: 'info', many: 'infos', feminine: true }}
                    label="Pages des dernières infos"
                    onNavigate={navigate}
                    pending={isSearching}
                >
                {isSearching && items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 bg-card rounded-lg">
                        <Loader2 className="animate-spin h-10 w-10 text-muted-foreground" />
                        <p className="mt-4 text-foreground">Recherche en cours...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-12 bg-card rounded-lg border border-border">
                        <p className="text-foreground">
                            {hasFilters ? 'Aucune info trouvée pour cette recherche' : 'Aucune info publiée'}
                        </p>
                        {searchTerm.trim() && (
                            <SearchRescue
                                suggestions={results.searchSuggestions}
                                unit={{ one: 'info', many: 'infos', feminine: true }}
                                onApply={(s) => {
                                    if (s.lifted.includes('field')) setField('all');
                                    if (s.lifted.includes('type')) setType(null);
                                    handleSearchChange(s.query);
                                }}
                                onOpenRow={(row) => void openArticle(Number(row.id))}
                            />
                        )}
                    </div>
                ) : (
                    <div className="rounded-md border border-border bg-card">
                        <Table stickyHeader mobileCards>
                            <TableHeader className="bg-card">
                                <TableRow className="border-b border-border">
                                    <TableHead className="text-foreground font-medium">ID</TableHead>
                                    <TableHead className="text-foreground font-medium">Titre</TableHead>
                                    <TableHead className="text-foreground font-medium">Type</TableHead>
                                    <TableHead className="text-foreground font-medium">Auteur</TableHead>
                                    <TableHead className="text-foreground font-medium">Date de publication</TableHead>
                                    <TableHead className="text-foreground font-medium">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((article) => (
                                    <TableRow
                                        key={article.id}
                                        className="group border-b border-border hover:bg-muted cursor-pointer transition-colors"
                                        onClick={() => void openArticle(article.id)}
                                    >
                                        <TableCell className="font-medium text-foreground whitespace-nowrap">
                                            <CopyIdButton id={article.id} label="de l'information" />
                                        </TableCell>
                                        <TableCell className="text-foreground">
                                            <div className="font-medium">{article.title}</div>
                                            {article.excerpt && (
                                                <div className="mt-0.5 max-w-xl text-sm text-muted-foreground line-clamp-2">
                                                    {article.excerpt}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <NewsTypeBadge type={article.type} />
                                        </TableCell>
                                        <TableCell className="text-foreground">
                                            {article.author?.name || 'Inconnu'}
                                        </TableCell>
                                        <TableCell className="text-foreground whitespace-nowrap">
                                            {parisDate(article.publishedAt, {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-muted text-foreground border-border hover:bg-muted transition-colors"
                                                onClick={(e) => handleEditClick(e, article.id)}
                                            >
                                                Modifier
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                </AdminPaginatedList>
            </CardContent>

            {isLoadingArticle && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50 gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-white" />
                    <span className="text-white text-sm">Chargement de l&apos;information...</span>
                </div>
            )}

            {/* Add */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Ajouter une information</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddNewsFormBackend onSuccess={handleSaved} onCancel={() => setIsAddOpen(false)} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit */}
            {editing && (
                <Dialog open onOpenChange={(open) => { if (!open) { setEditing(null); clearNewsParam(); } }}>
                    <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                        <DialogHeader>
                            <DialogTitle className="text-foreground flex flex-wrap items-center gap-3">
                                Modifier la dernière info
                                <CopyableId id={editing.id} label="de l'information" />
                                <NewsTypeBadge type={editing.data.type} />
                            </DialogTitle>
                        </DialogHeader>
                        <div className="overflow-y-auto px-1">
                            <EditNewsFormBackend
                                newsId={editing.id}
                                initialData={editing.data}
                                onSuccess={handleSaved}
                                onCancel={() => setEditing(null)}
                            />
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </Card>
    );
}
