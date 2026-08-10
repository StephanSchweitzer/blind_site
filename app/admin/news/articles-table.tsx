'use client';

import { useRouter, useSearchParams } from 'next/navigation';
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
import { useDebounce } from 'use-debounce';
import { useEffect, useState, useCallback, useRef } from 'react';
import { NewsType } from '@/types/news';
import NewsTypeBadge from '@/components/NewsTypeBadge';
import {
    AddNewsFormBackend,
    EditNewsFormBackend,
    type NewsFormData,
} from '@/admin/NewsFormBackendBase';
import { toast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';

type Article = {
    id: number;
    title: string;
    publishedAt: Date;
    type: NewsType;
    author: {
        name: string | null;
    } | null;
};

interface ArticlesTableProps {
    initialArticles: Article[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
}

export function ArticlesTable({
                                  initialArticles,
                                  initialPage = 1,
                                  initialSearch = '',
                                  totalPages = 1
                              }: ArticlesTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [search, setSearch] = useState(initialSearch);
    const [prevUrlSearch, setPrevUrlSearch] = useState(initialSearch);
    const [debouncedSearch] = useDebounce(search, 300);
    const [isAddOpen, setIsAddOpen] = useState(false);
    /** Article open in the edit dialogue, with the content the list doesn't carry. */
    const [editing, setEditing] = useState<{ id: number; data: NewsFormData } | null>(null);
    const [isLoadingArticle, setIsLoadingArticle] = useState(false);

// Sync from URL during render instead of in an effect
    const urlSearch = searchParams.get('search') || '';
    if (urlSearch !== prevUrlSearch) {
        setPrevUrlSearch(urlSearch);
        setSearch(urlSearch);
    }

    // Get current page from URL, defaulting to initialPage if invalid
    const currentPage = Math.max(1, parseInt(searchParams.get('page') || initialPage.toString()));

    // Handle debounced search with navigation
    useEffect(() => {
        const currentSearch = searchParams.get('search') || '';
        if (debouncedSearch !== currentSearch) {
            const params = new URLSearchParams(searchParams);
            if (debouncedSearch.trim()) {
                params.set('search', debouncedSearch);
            } else {
                params.delete('search');
            }
            params.set('page', '1'); // Reset to first page on search
            router.push(`?${params.toString()}`, { scroll: false });
        }
    }, [debouncedSearch, router, searchParams]);

    // Improved page change handler
    const handlePageChange = useCallback((newPage: number) => {
        if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;

        const params = new URLSearchParams(searchParams);
        params.set('page', newPage.toString());
        router.push(`?${params.toString()}`, { scroll: false });
    }, [currentPage, totalPages, searchParams, router]);

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

    const handleRowClick = useCallback((articleId: number) => {
        void openArticle(articleId);
    }, [openArticle]);

    // Deep-link: open the edit dialogue directly from /admin/news?news=<id>.
    // openedRef prevents re-firing on router.refresh() / re-render for the same id.
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
    const clearNewsParam = () => {
        if (!searchParams.get('news')) return;
        const params = new URLSearchParams(searchParams.toString());
        params.delete('news');
        const qs = params.toString();
        window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname);
    };

    // Handle edit button click with event propagation stop
    const handleEditClick = useCallback((e: React.MouseEvent, articleId: number) => {
        e.stopPropagation();
        void openArticle(articleId);
    }, [openArticle]);

    const handleSaved = useCallback(() => {
        setEditing(null);
        setIsAddOpen(false);
        router.refresh();
    }, [router]);

    // Generate pagination buttons with improved UX
    const generatePaginationButtons = () => {
        const buttons = [];
        const maxVisiblePages = 5;

        // Previous button
        buttons.push(
            <Button
                key="prev"
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                className="bg-card text-foreground border-border hover:bg-muted disabled:opacity-50"
                onClick={() => handlePageChange(currentPage - 1)}
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>
        );

        // Page number buttons
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        // Adjust start if we're near the end
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        // First page and ellipsis
        if (startPage > 1) {
            buttons.push(
                <Button
                    key={1}
                    variant="outline"
                    size="sm"
                    className="bg-card text-foreground border-border hover:bg-muted"
                    onClick={() => handlePageChange(1)}
                >
                    1
                </Button>
            );
            if (startPage > 2) {
                buttons.push(
                    <span key="ellipsis1" className="text-muted-foreground px-2">...</span>
                );
            }
        }

        // Main page buttons
        for (let i = startPage; i <= endPage; i++) {
            buttons.push(
                <Button
                    key={i}
                    variant={currentPage === i ? "default" : "outline"}
                    size="sm"
                    className={currentPage === i
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-card text-foreground border-border hover:bg-muted"}
                    onClick={() => handlePageChange(i)}
                >
                    {i}
                </Button>
            );
        }

        // Last page and ellipsis
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                buttons.push(
                    <span key="ellipsis2" className="text-muted-foreground px-2">...</span>
                );
            }
            buttons.push(
                <Button
                    key={totalPages}
                    variant="outline"
                    size="sm"
                    className="bg-card text-foreground border-border hover:bg-muted"
                    onClick={() => handlePageChange(totalPages)}
                >
                    {totalPages}
                </Button>
            );
        }

        // Next button
        buttons.push(
            <Button
                key="next"
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                className="bg-card text-foreground border-border hover:bg-muted disabled:opacity-50"
                onClick={() => handlePageChange(currentPage + 1)}
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
        );

        return buttons;
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4 border-b border-border">
                <div>
                    <CardTitle className="text-foreground">Gérer les dernières info</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Gérer et modifier les informations affichées sur dernières info
                    </CardDescription>
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
                <div className="flex items-center gap-2 mb-4">
                    <Input
                        placeholder="Rechercher les dernières infos..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-sm bg-card border-border text-foreground placeholder:text-muted-foreground"
                    />
                    {search && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSearch('')}
                            className="bg-card text-foreground border-border hover:bg-muted"
                        >
                            Effacer
                        </Button>
                    )}
                </div>

                <div className="rounded-md border border-border bg-card">
                    <Table>
                        <TableHeader className="bg-card">
                            <TableRow className="border-b border-border">
                                <TableHead className="text-foreground font-medium">Titre</TableHead>
                                <TableHead className="text-foreground font-medium">Type</TableHead>
                                <TableHead className="text-foreground font-medium">Auteur</TableHead>
                                <TableHead className="text-foreground font-medium">Date de Publication</TableHead>
                                <TableHead className="text-foreground font-medium">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {initialArticles.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                        {search ? 'Aucun article trouvé pour cette recherche' : 'Aucun article trouvé'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                initialArticles.map((article) => (
                                    <TableRow
                                        key={article.id}
                                        className="border-b border-border hover:bg-muted cursor-pointer transition-colors"
                                        onClick={() => handleRowClick(article.id)}
                                    >
                                        <TableCell className="text-foreground font-medium">
                                            {article.title}
                                        </TableCell>
                                        <TableCell>
                                            <NewsTypeBadge type={article.type} />
                                        </TableCell>
                                        <TableCell className="text-foreground">
                                            {article.author?.name || 'Inconnu'}
                                        </TableCell>
                                        <TableCell className="text-foreground">
                                            {new Date(article.publishedAt).toLocaleDateString('fr-FR', {
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
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {totalPages > 1 && (
                    <div className="mt-6">
                        <div className="flex justify-center items-center gap-1">
                            {generatePaginationButtons()}
                        </div>
                        <p className="text-center text-sm text-muted-foreground mt-2">
                            Page {currentPage} sur {totalPages} ({initialArticles.length} article{initialArticles.length !== 1 ? 's' : ''})
                        </p>
                    </div>
                )}
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