'use client';

import { useEffect, useState } from 'react';
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

interface CoupsTableProps {
    initialItems: CoupDeCoeurWithBooks[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
}

export function CoupsTable({ initialItems, initialSearch, totalPages }: CoupsTableProps) {
    const router = useRouter();
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

    // Get current page from URL
    const currentPage = parseInt(searchParams.get('page') || '1');

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
            params.set('page', '1'); // Reset to first page on search
            router.push(`?${params.toString()}`, { scroll: false });
        }
    }, [debouncedSearch, router, searchParams]);

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams);
        params.set('page', newPage.toString());
        if (search) {
            params.set('search', search);
        }
        router.push(`?${params.toString()}`, { scroll: false });
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4 border-b border-border">
                <div>
                    <CardTitle className="text-foreground">Gestion des listes de livres</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Gérez et modifiez les listes de livres
                    </CardDescription>
                </div>
                <Link href="/admin/listes-de-livres/new" className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto bg-muted text-foreground border-border hover:bg-muted">
                        Ajouter une liste de livres
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                    <Input
                        placeholder="Rechercher des listes de livres ou des livres..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-sm bg-card border-border text-foreground placeholder:text-muted-foreground"
                    />
                </div>

                <div className="rounded-md border border-border bg-card">
                    <Table>
                        <TableHeader className="bg-card">
                            <TableRow className="border-b border-border">
                                <TableHead className="text-foreground font-medium">Titre</TableHead>
                                <TableHead className="text-foreground font-medium">Ajouté par</TableHead>
                                <TableHead className="text-foreground font-medium">Statut</TableHead>
                                <TableHead className="text-foreground font-medium">Livres</TableHead>
                                <TableHead className="text-foreground font-medium">Créé le</TableHead>
                                <TableHead className="text-foreground font-medium">Actions</TableHead>
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
                            {items.map((item) => (
                                <TableRow
                                    key={item.id}
                                    className="border-b border-border hover:bg-muted cursor-pointer"
                                    onClick={() => window.location.href = `/admin/listes-de-livres/${item.id}`}
                                >
                                    <TableCell className="text-foreground">{item.title}</TableCell>
                                    <TableCell className="text-foreground">{item.addedBy?.name || 'Inconnu'}</TableCell>
                                    <TableCell className="text-foreground">{item.active ? 'Actif' : 'Inactif'}</TableCell>
                                    <TableCell className="text-foreground">{item.books.length} livres</TableCell>
                                    <TableCell className="text-foreground">
                                        {new Date(item.createdAt).toLocaleDateString('fr-FR', {
                                            month: 'numeric',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="bg-muted text-foreground border-border hover:bg-muted"
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent row click when clicking the button
                                                window.location.href = `/admin/listes-de-livres/${item.id}`;
                                            }}
                                        >
                                            Modifier
                                        </Button>
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

                <div className="flex flex-wrap justify-center items-center gap-2 mt-6">
                    {Array.from({ length: totalPages }, (_, index) => (
                        <Button
                            key={index + 1}
                            variant={currentPage === index + 1 ? "default" : "outline"}
                            size="sm"
                            className={currentPage === index + 1
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-card text-foreground border-border hover:bg-muted"}
                            onClick={() => handlePageChange(index + 1)}
                        >
                            {index + 1}
                        </Button>
                    ))}
                </div>
                <p className="text-center text-sm text-muted-foreground mt-2">
                    Page {currentPage} sur {totalPages}
                </p>
            </CardContent>
        </Card>
    );
}