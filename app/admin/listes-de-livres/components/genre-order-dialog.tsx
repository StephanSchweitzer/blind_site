import React, { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { sectionSpine } from '@/lib/books/genreFamily';

interface GenreOrderDialogProps {
    /** Les genres de la liste, dans l'ordre actuel, avec leur nombre de livres. */
    genres: { name: string; count: number }[];
    onClose: () => void;
    /** Le nouvel ordre des genres ; les livres suivent leur genre. */
    onApply: (order: string[]) => void;
}

/**
 * L'ordre des genres, en glisser-déposer, dans une fenêtre à part.
 *
 * À part parce que le tableau des livres est long et défile : glisser un genre
 * de la treizième place à la première y voulait dire tirer une ligne au-delà du
 * bord de l'écran. Une dizaine de lignes courtes tiennent ici d'un coup d'œil.
 * Les livres, eux, gardent leurs flèches dans le tableau : on les déplace
 * rarement loin, et toujours au sein de leur genre.
 *
 * Même mécanique que l'Équipe (framer-motion `Reorder`, une poignée par ligne),
 * plus le clavier : la poignée prend les flèches haut et bas, que la souris
 * seule de l'Équipe ne permet pas. La couleur de chaque genre suit sa place,
 * comme sur le site.
 */
export function GenreOrderDialog({ genres, onClose, onApply }: GenreOrderDialogProps) {
    const [order, setOrder] = useState(() => genres.map((genre) => genre.name));
    const counts = new Map(genres.map((genre) => [genre.name, genre.count]));
    const [announce, setAnnounce] = useState('');

    // La ligne déplacée au clavier change de place dans le DOM : le focus
    // revient sur sa poignée.
    const pendingFocus = useRef<string | null>(null);
    useEffect(() => {
        const name = pendingFocus.current;
        if (!name) return;
        pendingFocus.current = null;
        document.querySelector<HTMLElement>(`[data-genre-handle="${CSS.escape(name)}"]`)?.focus();
    });

    const moveByKey = (name: string, step: -1 | 1) => {
        const index = order.indexOf(name);
        const target = index + step;
        if (index < 0 || target < 0 || target >= order.length) return;
        const next = [...order];
        [next[index], next[target]] = [next[target], next[index]];
        pendingFocus.current = name;
        setOrder(next);
        setAnnounce(`« ${name} » : ${target + 1}e sur ${order.length}.`);
    };

    const changed = order.some((name, index) => name !== genres[index]?.name);

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="flex max-h-[85dvh] max-w-md flex-col bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="text-foreground">Ordre des genres</DialogTitle>
                    <DialogDescription>
                        Faites glisser un genre par sa poignée, ou sélectionnez la poignée et utilisez les flèches
                        haut et bas. Ses livres le suivent.
                    </DialogDescription>
                </DialogHeader>

                <Reorder.Group
                    axis="y"
                    values={order}
                    onReorder={setOrder}
                    layoutScroll
                    className="-mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1 py-0.5"
                >
                    {order.map((name, index) => (
                        <GenreRow
                            key={name}
                            name={name}
                            count={counts.get(name) ?? 0}
                            index={index}
                            onMoveKey={(step) => moveByKey(name, step)}
                        />
                    ))}
                </Reorder.Group>
                <p className="sr-only" aria-live="polite">{announce}</p>

                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            if (changed) onApply(order);
                            else onClose();
                        }}
                    >
                        Appliquer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function GenreRow({
    name,
    count,
    index,
    onMoveKey,
}: {
    name: string;
    count: number;
    index: number;
    onMoveKey: (step: -1 | 1) => void;
}) {
    const controls = useDragControls();
    return (
        <Reorder.Item
            value={name}
            dragListener={false}
            dragControls={controls}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5"
        >
            <button
                type="button"
                data-genre-handle={name}
                onPointerDown={(event) => controls.start(event)}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        onMoveKey(event.key === 'ArrowUp' ? -1 : 1);
                    }
                }}
                className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                aria-label={`Déplacer « ${name} », ${index + 1}e (flèches haut et bas)`}
            >
                <GripVertical className="h-5 w-5" aria-hidden="true" />
            </button>
            <span aria-hidden="true" className={`block h-4 w-1.5 shrink-0 rounded-[1px] ${sectionSpine(index)}`} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
                {count} {count === 1 ? 'livre' : 'livres'}
            </span>
        </Reorder.Item>
    );
}
