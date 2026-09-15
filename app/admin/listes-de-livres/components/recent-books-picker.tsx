import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from '@/lib/utils';
import { parisDate, parisDayKey } from '@/lib/paris-day';
import { ListRef } from './list-membership';
import { BookBadges, ListBook } from './list-book';

interface DefaultWindow {
    since: string | null;
    label: string | null;
    active: boolean | null;
}

export interface RecentWindowState {
    /** Le jour parisien affiché dans le champ ; vide tant que le défaut n'est pas connu. */
    since: string;
    setSince: (day: string) => void;
    /** Vrai si le permanent a déplacé la date. */
    sinceTouched: boolean;
    resetSince: () => void;
    defaultWindow: DefaultWindow | null;
    /** Le `since` à envoyer à /api/books, ou null pour la coupure par défaut. */
    sinceParam: string | null;
    /** La date lisible de la fenêtre appliquée, pour les titres. */
    appliedLabel: string | null;
}

/**
 * La date des nouveautés, tenue au-dessus du contrôle et de la fenêtre.
 *
 * Levée ici plutôt que dans le contrôle : il s'affiche tantôt en grand dans
 * l'état vide de la liste, tantôt dans la barre d'outils, et un changement de
 * place ne doit pas faire oublier la date que le permanent a choisie.
 *
 * Tant que la date n'a pas été déplacée, on n'envoie PAS de `since` : le
 * serveur applique l'instant exact de la dernière liste — pas son jour arrondi,
 * qui élargirait la fenêtre de quelques heures.
 */
export function useRecentWindow(): RecentWindowState {
    const [since, setSinceState] = useState('');
    const [sinceTouched, setSinceTouched] = useState(false);
    const [defaultWindow, setDefaultWindow] = useState<DefaultWindow | null>(null);

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
                    setSinceState((current) => current || parisDayKey(new Date(recentWindow.defaultSince)));
                }
            } catch (error) {
                console.error('Error loading recent-books window:', error);
            }
        };
        void loadDefault();
    }, []);

    const defaultSinceDay = defaultWindow?.since ? parisDayKey(new Date(defaultWindow.since)) : null;
    const sinceParam = sinceTouched && since ? since : null;

    return {
        since,
        setSince: (day) => {
            setSinceState(day);
            setSinceTouched(day !== '' && day !== defaultSinceDay);
        },
        sinceTouched,
        resetSince: () => {
            if (defaultSinceDay) setSinceState(defaultSinceDay);
            setSinceTouched(false);
        },
        defaultWindow,
        sinceParam,
        appliedLabel: sinceParam
            ? parisDate(`${sinceParam}T12:00:00Z`)
            : defaultWindow?.since
                ? parisDate(defaultWindow.since)
                : null,
    };
}

interface RecentBooksControlProps {
    win: RecentWindowState;
    onOpen: () => void;
    /** `hero` : l'état vide d'une liste, où c'est la première chose à faire. */
    size?: 'toolbar' | 'hero';
}

/**
 * « Nouveautés depuis le [date] [Voir] » : un seul contrôle, qui se lit comme
 * une phrase — la date dit ce que le bouton va montrer.
 *
 * Le bouton plutôt qu'une ouverture au changement de date : un champ date
 * saisi au clavier émet un changement par segment (jour, mois, année), et
 * chacun ouvrirait la fenêtre sur une date à moitié tapée.
 */
export function RecentBooksControl({ win, onOpen, size = 'toolbar' }: RecentBooksControlProps) {
    const { since, setSince, sinceTouched, resetSince, defaultWindow } = win;
    const hero = size === 'hero';

    return (
        <div className={cn('space-y-1.5', hero && 'flex flex-col items-center text-center')}>
            <div
                className={cn(
                    'inline-flex items-stretch overflow-hidden rounded-md border border-border bg-field shadow-sm',
                    hero ? 'h-11' : 'h-9'
                )}
            >
                <label
                    htmlFor={`since-${size}`}
                    className="flex items-center gap-2 whitespace-nowrap pl-3 pr-2 text-sm text-muted-foreground"
                >
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                    {/* Le libellé complet déborde d'un écran de téléphone. */}
                    <span className="hidden sm:inline">Nouveautés depuis le</span>
                    <span className="sm:hidden">Depuis le</span>
                </label>
                <input
                    type="date"
                    id={`since-${size}`}
                    value={since}
                    max={parisDayKey(new Date())}
                    onChange={(e) => setSince(e.target.value)}
                    className="bg-transparent px-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [color-scheme:light] dark:[color-scheme:dark]"
                />
                <Button
                    type="button"
                    onClick={onOpen}
                    className={cn('rounded-none border-l border-border', hero ? 'h-full px-5' : 'h-full px-3')}
                >
                    Voir
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">
                {defaultWindow === null ? (
                    <span className="invisible">…</span>
                ) : defaultWindow.since ? (
                    <>
                        {/* « créée », pas « visible » : une liste masquée
                            porte la coupure comme les autres. Elle est
                            signalée comme telle, sans quoi le permanent
                            chercherait en vain sur le site la liste que
                            cette phrase nomme. */}
                        Dernière liste
                        {defaultWindow.label ? ` « ${defaultWindow.label} »` : ''} créée le{' '}
                        {parisDate(defaultWindow.since)}
                        {defaultWindow.active === false ? ' (masquée)' : ''}
                        {sinceTouched && (
                            <>
                                {' · '}
                                <button
                                    type="button"
                                    className="underline underline-offset-2 hover:text-foreground"
                                    onClick={resetSince}
                                >
                                    Revenir à cette date
                                </button>
                            </>
                        )}
                    </>
                ) : (
                    "Aucune liste de livres n'a encore été créée."
                )}
            </p>
        </div>
    );
}

interface RecentBooksDialogProps {
    win: RecentWindowState;
    onClose: () => void;
    /** Les livres déjà dans la liste en cours. */
    inListIds: Set<number>;
    /** Les AUTRES listes qui contiennent chaque livre. */
    membership: Map<number, ListRef[]>;
    onAdd: (books: ListBook[]) => void;
}

// Le plafond de /api/books : au-delà, la fenêtre se charge par pages.
const PAGE_SIZE = 100;

/**
 * La fenêtre des nouveautés : un choix, jamais un ajout d'office.
 *
 * La création d'une liste chargeait autrefois, cochées, toutes les nouveautés
 * depuis la dernière liste — parfois des centaines — à charge pour le
 * permanent de décocher ce qu'il ne voulait pas. Ici tout part décoché, et
 * seul « Ajouter » touche à la liste.
 *
 * Montée seulement quand elle est ouverte : chaque ouverture repart d'un
 * chargement frais et d'aucune coche, sans effet de remise à zéro.
 */
export function RecentBooksDialog({ win, onClose, inListIds, membership, onAdd }: RecentBooksDialogProps) {
    const [books, setBooks] = useState<ListBook[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [checked, setChecked] = useState<Set<number>>(new Set());
    const requestId = useRef(0);
    const { sinceParam, appliedLabel } = win;

    // Aucun setState ici : la lecture est séparée de l'application, pour que
    // le chargement initial puisse partir d'un effet sans y écrire l'état.
    const fetchPage = async (pageNumber: number) => {
        const params = new URLSearchParams({
            recent: 'true',
            limit: String(PAGE_SIZE),
            page: String(pageNumber),
        });
        if (sinceParam) params.append('since', sinceParam);
        const response = await fetch(`/api/books?${params.toString()}`);
        if (!response.ok) throw new Error('LOAD_FAILED');
        return response.json();
    };

    const loadPage = (pageNumber: number) => {
        const id = ++requestId.current;
        fetchPage(pageNumber)
            .then((data) => {
                if (id !== requestId.current) return;
                const pageBooks: ListBook[] = data.books ?? [];
                setBooks((prev) => {
                    const seen = new Set(prev.map((book) => book.id));
                    return [...prev, ...pageBooks.filter((book) => !seen.has(book.id))];
                });
                setTotal(typeof data.total === 'number' ? data.total : pageBooks.length);
                setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
                setPage(pageNumber);
                setIsLoading(false);
            })
            .catch((error) => {
                console.error('Error loading recent books:', error);
                if (id !== requestId.current) return;
                setLoadError(true);
                setIsLoading(false);
            });
    };

    // Le chargement initial ; `sinceParam` est figé le temps que la fenêtre
    // est ouverte (elle est démontée à la fermeture).
    useEffect(() => {
        loadPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectable = books.filter((book) => !inListIds.has(book.id));
    const allChecked = selectable.length > 0 && selectable.every((book) => checked.has(book.id));

    const toggle = (bookId: number) => {
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(bookId)) next.delete(bookId);
            else next.add(bookId);
            return next;
        });
    };

    const toAdd = books.filter((book) => checked.has(book.id) && !inListIds.has(book.id));
    const checkedAlreadyListed = toAdd.filter((book) => membership.has(book.id)).length;

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="flex max-h-[85dvh] max-w-4xl flex-col gap-0 p-0 bg-card border-border">
                <DialogHeader className="border-b border-border px-6 py-4">
                    <DialogTitle className="text-foreground">
                        {appliedLabel ? `Nouveautés depuis le ${appliedLabel}` : 'Nouveautés'}
                    </DialogTitle>
                    <DialogDescription>
                        Seuls les livres disponibles sont proposés : un enregistrement encore en
                        cours n&apos;a rien à faire dans une liste. Cochez ceux à ajouter.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-[12rem] flex-1 overflow-y-auto px-6 py-2">
                    {loadError ? (
                        <p className="py-10 text-center text-sm text-destructive">
                            Échec du chargement des nouveautés.
                        </p>
                    ) : isLoading && books.length === 0 ? (
                        <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des nouveautés…
                        </p>
                    ) : books.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">
                            Aucune nouveauté disponible depuis cette date.
                        </p>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b border-border hover:bg-transparent">
                                        <TableHead className="w-10">
                                            <Checkbox
                                                aria-label="Tout cocher"
                                                checked={allChecked}
                                                onCheckedChange={(value) =>
                                                    setChecked(value === true ? new Set(selectable.map((book) => book.id)) : new Set())
                                                }
                                                disabled={selectable.length === 0}
                                            />
                                        </TableHead>
                                        <TableHead className="text-foreground font-medium">Titre</TableHead>
                                        <TableHead className="text-foreground font-medium">Auteur</TableHead>
                                        <TableHead className="text-foreground font-medium whitespace-nowrap">Ajouté le</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {books.map((book) => {
                                        const alreadyHere = inListIds.has(book.id);
                                        return (
                                            <TableRow
                                                key={book.id}
                                                className={cn(
                                                    'border-b border-border',
                                                    alreadyHere ? 'opacity-60' : 'cursor-pointer hover:bg-muted/60',
                                                    checked.has(book.id) && 'bg-primary/5'
                                                )}
                                                onClick={() => { if (!alreadyHere) toggle(book.id); }}
                                            >
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox
                                                        aria-label={`Cocher « ${book.title} »`}
                                                        checked={alreadyHere || checked.has(book.id)}
                                                        onCheckedChange={() => toggle(book.id)}
                                                        disabled={alreadyHere}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    <div className="font-medium">{book.title}</div>
                                                    <BookBadges
                                                        book={book}
                                                        membership={membership.get(book.id)}
                                                        inCurrentList={alreadyHere}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">{book.author}</TableCell>
                                                <TableCell className="text-muted-foreground whitespace-nowrap">
                                                    {parisDate(book.createdAt)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>

                            {page < totalPages && (
                                <div className="flex items-center justify-center gap-3 py-4 text-sm text-muted-foreground">
                                    {books.length} nouveautés chargées sur {total}.
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={isLoading}
                                        onClick={() => {
                                            setIsLoading(true);
                                            loadPage(page + 1);
                                        }}
                                    >
                                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Charger la suite
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <DialogFooter className="flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
                    <p className="text-sm text-muted-foreground">
                        {toAdd.length === 0
                            ? 'Aucun livre coché.'
                            : `${toAdd.length} livre${toAdd.length > 1 ? 's' : ''} coché${toAdd.length > 1 ? 's' : ''}`}
                        {checkedAlreadyListed > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                                {' '}— dont {checkedAlreadyListed} déjà dans une autre liste
                            </span>
                        )}
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            disabled={toAdd.length === 0}
                            onClick={() => {
                                onAdd(toAdd);
                                onClose();
                            }}
                        >
                            {toAdd.length > 1 ? `Ajouter les ${toAdd.length} livres` : 'Ajouter à la liste'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
