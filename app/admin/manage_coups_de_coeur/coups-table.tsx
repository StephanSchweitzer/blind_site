'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
    if (urlSearch !== prevUrlSearch) {
        setPrevUrlSearch(urlSearch);
        setSearch(urlSearch);
    }

    // Get current page from URL
    const currentPage = parseInt(searchParams.get('page') || '1');

    const handleSearch = (value: string) => {
        setSearch(value);
        const params = new URLSearchParams(searchParams);
        if (value) {
            params.set('search', value);
        } else {
            params.delete('search');
        }
        params.set('page', '1'); // Reset to first page on search
        router.push(`?${params.toString()}`);
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams);
        params.set('page', newPage.toString());
        if (search) {
            params.set('search', search);
        }
        router.push(`?${params.toString()}`);
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
                <Link href="/admin/manage_coups_de_coeur/new" className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto bg-muted text-foreground border-border hover:bg-muted">
                        Nouvelle listes de livres
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="flex items-center space-x-2 mb-4">
                    <Input
                        placeholder="Rechercher des listes de livres..."
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="max-w-sm bg-white text-muted-foreground placeholder:text-muted-foreground"
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
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((item) => (
                                <TableRow
                                    key={item.id}
                                    className="border-b border-border hover:bg-muted cursor-pointer"
                                    onClick={() => window.location.href = `/admin/manage_coups_de_coeur/${item.id}`}
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
                                                window.location.href = `/admin/manage_coups_de_coeur/${item.id}`;
                                            }}
                                        >
                                            Modifier
                                        </Button>
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
                                ? "bg-white text-muted-foreground hover:bg-muted"
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