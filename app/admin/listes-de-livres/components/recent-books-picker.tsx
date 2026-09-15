import React, { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/custom-switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { parisDate, parisDayKey } from '@/lib/paris-day';
import { ListRef, membershipLabel } from './list-membership';

export interface RecentBook {
    id: number;
    title: string;
    subtitle: string;
    author: string;
    isbn: string | null;
    createdAt: Date;
    hiddenFromCatalogue?: boolean;
}

interface DefaultWindow {
    since: string | null;
    label: string | null;
    active: boolean | null;
}

interface RecentBooksPickerProps {
    /** Les livres cochés dans la liste en cours — ceux qui partiront à l'enregistrement. */
    selectedBookIds: number[];
    /** Les AUTRES listes qui contiennent chaque livre. */
    membership: Map<number, ListRef[]>;
    onAdd: (books: RecentBook[]) => void;
}

// Le plafond de /api/books : au-delà, la fenêtre se charge par pages.
const PAGE_SIZE = 100;

/**
 * « Nouveautés depuis le … » : un choix, jamais un ajout d'office.
 *
 * La création d'une liste chargeait autrefois, cochées, toutes les nouveautés
 * depuis la dernière liste — parfois des centaines — à charge pour le
 * permanent de décocher ce qu'il ne voulait pas. Ici rien n'entre dans la liste
 * sans avoir été coché : la fenêtre s'ouvre sur demande, tout y part décoché,
 * et seul « Ajouter » touche à la liste.
 *
 * Le même composant sert la création et la modification, sans distinction :
 * ce qu'il sait de la page tient dans `selectedBookIds` et `membership`.
 *
 * Le bouton plutôt qu'une ouverture au changement de date : un champ date
 * saisi au clavier émet un changement par segment (jour, mois, année), et
 * chacun ouvrirait la fenêtre sur une date à moitié tapée.
 */
export default function RecentBooksPicker({ selectedBookIds, membership, onAdd }: RecentBooksPickerProps) {
    // `since` vide tant que le défaut n'est pas connu. `sinceTouched` dit si le
    // permanent l'a déplacé : tant que non, on n'envoie PAS de `since`, et le
    // serveur applique l'instant exact de la dernière liste — pas son jour
    // arrondi, qui élargirait la fenêtre de quelques heures.
    const [since, setSince] = useState('');
    const [sinceTouched, setSinceTouched] = useState(false);
    const [defaultWindow, setDefaultWindow] = useState<DefaultWindow | null>(null);

    const [open, setOpen] = useState(false);
    const [books, setBooks] = useState<RecentBook[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [checked, setChecked] = useState<Set<number>>(new Set());
    // Une réponse d'une ouverture précédente ne doit pas se mêler à la suivante.
    const requestId = useRef(0);

    useEffect(() => {
        const loadDefault = async () => {
            try {
                // limit=1 : on ne veut que `recentWindow`, pas les livres.
                const response = await fetch('/api/books?recent=true&limit=1');
                if (!response.ok) return;
                const data = await response.json();
                const recentWindow = data.recentWindow;
                if (!recentWindow) return;
                setDefaultWindow({
                    since: recentWindow.defaultSince,
                    label: recentWindow.defaultLabel,
                    active: recentWindow.defaultActive ?? null,
                });
                if (recentWindow.defaultSince) {
                    setSince((current) => current || parisDayKey(new Date(recentWindow.defaultSince)));
                }
            } catch (error) {
                console.error('Error loading recent-books window:', error);
            }
        };
        void loadDefault();
    }, []);

    const defaultSinceDay = defaultWindow?.since ? parisDayKey(new Date(defaultWindow.since)) : null;

    const loadPage = async (pageNumber: number, reset: boolean) => {
        const id = ++requestId.current;
        setIsLoading(true);
        setLoadError(false);
        try {
            const params = new URLSearchParams({
                recent: 'true',
                limit: String(PAGE_SIZE),
                page: String(pageNumber),
            });
            if (sinceTouched && since) params.append('since', since);

            const response = await fetch(`/api/books?${params.toString()}`);
            if (!response.ok) throw new Error('LOAD_FAILED');
            const data = await response.json();
            if (id !== requestId.current) return;

            const pageBooks: RecentBook[] = data.books ?? [];
            setBooks((prev) => {
                if (reset) return pageBooks;
                const seen = new Set(prev.map((book) => book.id));
                return [...prev, ...pageBooks.filter((book) => !seen.has(book.id))];
            });
            setTotal(typeof data.total === 'number' ? data.total : pageBooks.length);
            setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
            setPage(pageNumber);
        } catch (error) {
            console.error('Error loading recent books:', error);
            if (id === requestId.current) setLoadError(true);
        } finally {
            if (id === requestId.current) setIsLoading(false);
        }
    };

    const openPicker = () => {
        setBooks([]);
        setTotal(0);
        setPage(0);
        setTotalPages(0);
        setChecked(new Set());
        setOpen(true);
        void loadPage(1, true);
    };

    const inCurrentList = new Set(selectedBookIds);
    const selectable = books.filter((book) => !inCurrentList.has(book.id));
    const allChecked = selectable.length > 0 && selectable.every((book) => checked.has(book.id));

    const toggle = (bookId: number) => {
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(bookId)) next.delete(bookId);
            else next.add(bookId);
            return next;
        });
    };

    const toggleAll = (value: boolean) => {
        setChecked(value ? new Set(selectable.map((book) => book.id)) : new Set());
    };

    // Filtré à la validation aussi : un livre coché puis ajouté entre-temps
    // par un autre chemin ne doit pas partir deux fois.
    const toAdd = books.filter((book) => checked.has(book.id) && !inCurrentList.has(book.id));
    const checkedAlreadyListed = toAdd.filter((book) => membership.has(book.id)).length;

    const commit = () => {
        if (toAdd.length === 0) return;
        onAdd(toAdd);
        setOpen(false);
    };

    return (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3">
            <div className="space-y-1">
                <label htmlFor="since" className="text-sm font-medium text-foreground">
                    Nouveautés depuis le
                </label>
                <Input
                    type="date"
                    id="since"
                    value={since}
                    max={parisDayKey(new Date())}
                    onChange={(e) => {
                        setSince(e.target.value);
                        setSinceTouched(e.target.value !== '' && e.target.value !== defaultSinceDay);
                    }}
                    className="bg-card border-border text-foreground w-auto"
                />
            </div>
            <Button
                type="button"
                onClick={openPicker}
                className="bg-muted text-foreground border-border hover:bg-muted"
            >
                Voir les nouveautés
            </Button>
            <div className="flex-1 min-w-[16rem] text-sm text-muted-foreground">
                {defaultWindow === null ? null : defaultWindow.since ? (
                    <>
                        {/* « créée », pas « publiée » : une liste dépubliée
                            porte la coupure comme les autres. Elle est
                            signalée comme telle, sans quoi le permanent
                            chercherait en vain sur le site la liste que
                            cette phrase nomme. */}
                        Dernière liste
                        {defaultWindow.label ? ` « ${defaultWindow.label} »` : ''} créée le{' '}
                        {parisDate(defaultWindow.since)}
                        {defaultWindow.active === false ? ' (dépubliée)' : ''}.{' '}
                        {sinceTouched && defaultSinceDay && (
                            <button
                                type="button"
                                className="underline hover:text-foreground"
                                onClick={() => {
                                    setSince(defaultSinceDay);
                                    setSinceTouched(false);
                                }}
                            >
                                Revenir à cette date
                            </button>
                        )}
                    </>
                ) : (
                    "Aucune liste de livres n'a encore été créée."
                )}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-4xl max-h-[80dvh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">
                            {sinceTouched && since
                                ? `Nouveautés depuis le ${parisDate(`${since}T12:00:00Z`)}`
                                : defaultWindow?.since
                                    ? `Nouveautés depuis le ${parisDate(defaultWindow.since)}`
                                    : 'Nouveautés'}
                        </DialogTitle>
                        <DialogDescription>
                            Seuls les livres disponibles sont proposés : un enregistrement encore
                            en cours n&apos;a rien à faire dans une liste. Cochez ceux à ajouter.
                        </DialogDescription>
                    </DialogHeader>

                    {loadError ? (
                        <p className="text-center py-4 text-destructive">
                            Échec du chargement des nouveautés.
                        </p>
                    ) : isLoading && books.length === 0 ? (
                        <p className="text-center py-4 text-foreground">Chargement...</p>
                    ) : books.length === 0 ? (
                        <p className="text-center py-4 text-muted-foreground">
                            Aucune nouveauté disponible depuis cette date.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            <Table>
                                <TableHeader className="bg-card">
                                    <TableRow className="border-b border-border">
                                        <TableHead className="text-foreground font-medium">
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    id="recent-select-all"
                                                    checked={allChecked}
                                                    onChange={toggleAll}
                                                    disabled={selectable.length === 0}
                                                />
                                                <label htmlFor="recent-select-all" className="text-sm font-medium text-foreground">
                                                    Tout cocher
                                                </label>
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-foreground font-medium">Titre</TableHead>
                                        <TableHead className="text-foreground font-medium">Auteur</TableHead>
                                        <TableHead className="text-foreground font-medium">Date d&apos;ajout</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {books.map((book) => {
                                        const alreadyHere = inCurrentList.has(book.id);
                                        return (
                                            <TableRow
                                                key={book.id}
                                                className={`border-b border-border ${alreadyHere ? 'opacity-50' : 'cursor-pointer hover:bg-muted'}`}
                                                onClick={() => {
                                                    if (!alreadyHere) toggle(book.id);
                                                }}
                                            >
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <Switch
                                                        id={`recent-book-${book.id}`}
                                                        checked={alreadyHere || checked.has(book.id)}
                                                        onChange={() => toggle(book.id)}
                                                        disabled={alreadyHere}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    <div className="flex flex-col">
                                                        <span>
                                                            {book.title}
                                                            {book.hiddenFromCatalogue && (
                                                                <span className="ml-2 text-xs text-muted-foreground">
                                                                    (masqué du catalogue public)
                                                                </span>
                                                            )}
                                                        </span>
                                                        {alreadyHere && (
                                                            <span className="text-sm text-muted-foreground">
                                                                Déjà dans la liste en cours
                                                            </span>
                                                        )}
                                                        {membership.has(book.id) && (
                                                            <span className="text-sm text-amber-500">
                                                                {membershipLabel(membership.get(book.id)!)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-foreground">{book.author}</TableCell>
                                                <TableCell className="text-foreground">{parisDate(book.createdAt)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>

                            {page < totalPages && (
                                <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                                    {books.length} nouveautés chargées sur {total}.
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={isLoading}
                                        onClick={() => void loadPage(page + 1, false)}
                                        className="bg-field border-border text-foreground hover:bg-muted"
                                    >
                                        {isLoading ? 'Chargement...' : 'Charger la suite'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                            {toAdd.length === 0
                                ? 'Aucun livre coché.'
                                : `${toAdd.length} livre${toAdd.length > 1 ? 's' : ''} coché${toAdd.length > 1 ? 's' : ''}`}
                            {checkedAlreadyListed > 0 && (
                                <span className="text-amber-500">
                                    {' '}— dont {checkedAlreadyListed} déjà dans une autre liste
                                </span>
                            )}
                        </p>
                        <div className="flex gap-2 justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                className="bg-field border-border text-foreground hover:bg-muted"
                            >
                                Annuler
                            </Button>
                            <Button
                                type="button"
                                disabled={toAdd.length === 0}
                                onClick={commit}
                                className="bg-muted text-foreground border-border hover:bg-muted"
                            >
                                {toAdd.length > 1 ? `Ajouter les ${toAdd.length} livres` : 'Ajouter à la liste'}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
