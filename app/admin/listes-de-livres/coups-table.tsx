'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDebounce } from 'use-debounce';
import Link from 'next/link';
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
import { CoupDeCoeurPDFButton } from "@/admin/CoupDeCoeurPDFButton";
import type { CoupDeCoeurWithBooks } from "@/types/models/coups-de-coeur.model";
import { parisDate } from '@/lib/paris-day';
import { AideLink } from '@/components/ui/admin/AideLink';
import { Plus, Search } from 'lucide-react';
import { ListStatusBadge } from './components/list-book';
import { SearchRescue } from '@/components/ui/search-rescue';
import type { RescueSuggestion } from '@/lib/search-suggestion-types';
import type { PageInfo } from '@/lib/pagination';
import { AdminPaginatedList } from '@/admin/AdminPagination';

interface CoupsTableProps {
    initialItems: CoupDeCoeurWithBooks[];
    /** Page courante, taille, total — lib/pagination.ts `pageInfo`. */
    pagination: PageInfo;
    initialSearch: string;
    /** « Vouliez-vous dire … ? », computed only when the search found nothing. */
    searchSuggestions?: RescueSuggestion[];
}

export function CoupsTable({ initialItems, pagination, initialSearch, searchSuggestions }: CoupsTableProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    // Pagination : un clic simple navigue dans une transition, pour griser la liste.
    const navigate = (href: string) => startTransition(() => router.push(href, { scroll: false }));
    const searchParams = useSearchParams();
    // initialItems is the source of truth (re-passed by the server on navigation),
    // so render it directly instead of mirroring it into state via an effect.
    const items = initialItems;

    // search is an editable input that ALSO has to follow the URL (e.g. back/forward),
    // so resync it during render with a prev-value guard instead of an effect.
    const urlSearch = searchParams.get('search') || '';
    const [search, setSearch] = useState(initialSearch);
    const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
    const [debouncedSearch] = useDebounce(search, 300);
    if (urlSearch !== prevUrlSearch) {
        setPrevUrlSearch(urlSearch);
        setSearch(urlSearch);
    }

    // Navigating on every keystroke raced concurrent requests against each
    // other — an older, slower response could land after a newer one and
    // snap the input back to a stale value. Debouncing collapses that to one
    // navigation per pause in typing.
    useEffect(() => {
        const currentSearch = searchParams.get('search') || '';
        if (debouncedSearch !== currentSearch) {
            const params = new URLSearchParams(searchParams);
            if (debouncedSearch) {
                params.set('search', debouncedSearch);
            } else {
                params.delete('search');
            }
            params.delete('page'); // Reset to first page on search
            router.push(`?${params.toString()}`, { scroll: false });
        }
    }, [debouncedSearch, router, searchParams]);

    return (
        <Card className="bg-card border-border">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4 border-b border-border">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-2xl font-bold text-foreground">Listes de livres</CardTitle>
                        <AideLink section="liste-de-livres" />
                    </div>
                    <CardDescription className="text-muted-foreground mt-1">
                        Les sélections de livres, visibles ou masquées sur le site public.
                    </CardDescription>
                </div>
                <Button asChild className="w-full sm:w-auto">
                    <Link href="/admin/listes-de-livres/new">
                        <Plus /> Nouvelle liste de livres
                    </Link>
                </Button>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="relative mb-4 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Rechercher une liste ou un livre…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
                    />
                </div>

                <AdminPaginatedList
                    info={pagination}
                    noun={{ one: 'liste', many: 'listes', feminine: true }}
                    label="Pages des listes de livres"
                    onNavigate={navigate}
                    pending={isPending}
                >
                <div className="rounded-md border border-border bg-card">
                    <Table stickyHeader mobileCards>
                        <TableHeader className="bg-card">
                            <TableRow className="border-b border-border">
                                <TableHead className="text-foreground font-medium">Titre</TableHead>
                                <TableHead className="text-foreground font-medium">Ajouté par</TableHead>
                                <TableHead className="text-foreground font-medium">Statut</TableHead>
                                <TableHead className="text-foreground font-medium">Livres</TableHead>
                                <TableHead className="text-foreground font-medium">Créée le</TableHead>
                                {/* Header text is for screen readers only, but the cell itself
                                    must stay in flow — an sr-only <th> is position:absolute and
                                    drops out of the column count, leaving the header one cell
                                    short of every body row. */}
                                <TableHead className="text-foreground font-medium w-[1%] whitespace-nowrap">
                                    <span className="sr-only">Imprimer la liste de livres</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.length === 0 && (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                        {search ? 'Aucune liste de livres ne correspond à cette recherche.' : "Aucune liste de livres pour l'instant."}
                                        <SearchRescue
                                            suggestions={searchSuggestions}
                                            unit={{ one: 'liste', many: 'listes', feminine: true }}
                                            onApply={(s) => setSearch(s.query)}
                                            onOpenRow={(row) => router.push(`/admin/listes-de-livres/${row.id}`)}
                                        />
                                    </TableCell>
                                </TableRow>
                            )}
                            {items.map((item) => (
                                <TableRow
                                    key={item.id}
                                    className="border-b border-border hover:bg-muted/50 cursor-pointer"
                                    // Navigation client : l'ancien `window.location.href`
                                    // rechargeait toute l'application à chaque ouverture.
                                    onClick={() => router.push(`/admin/listes-de-livres/${item.id}`)}
                                >
                                    <TableCell className="text-foreground">
                                        <Link
                                            href={`/admin/listes-de-livres/${item.id}`}
                                            className="font-medium hover:underline underline-offset-2"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {item.title}
                                        </Link>
                                        {item.description && (
                                            <div className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
                                                {item.description}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{item.addedBy?.name || 'Inconnu'}</TableCell>
                                    <TableCell><ListStatusBadge active={item.active} /></TableCell>
                                    <TableCell className="text-muted-foreground whitespace-nowrap">
                                        {(() => {
                                            // Les fiches supprimées restent rattachées (elles reviennent
                                            // si on les restaure) mais ne comptent pas : elles ne
                                            // paraissent ni sur le site ni à l'impression.
                                            const n = item.books.filter(({ book }) => !book.deletedAt).length;
                                            return `${n} livre${n > 1 ? 's' : ''}`;
                                        })()}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground whitespace-nowrap">
                                        {parisDate(item.createdAt)}
                                    </TableCell>
                                    {/* Impression directe, sans ouvrir la liste. */}
                                    <TableCell className="w-[1%] whitespace-nowrap text-right">
                                        <CoupDeCoeurPDFButton variant="icon" coupDeCoeurId={item.id} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                </AdminPaginatedList>
            </CardContent>
        </Card>
    );
}