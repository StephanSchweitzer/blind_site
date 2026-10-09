import React from 'react';

/**
 * Barre de progression du déplacement des pistes vers la corbeille.
 * Partagée par « Supprimer toutes les pistes » et « Supprimer le livre ».
 */
export function AudioDeleteProgress({ done, total }: { done: number; total: number }) {
    const ratio = done / Math.max(1, total);
    return (
        <div className="space-y-1" aria-live="polite">
            <div className="flex justify-between text-sm text-foreground">
                <span>
                    {done} / {total} piste{total > 1 ? 's' : ''} traitée{total > 1 ? 's' : ''}
                </span>
                <span>{Math.round(ratio * 100)} %</span>
            </div>
            <div
                role="progressbar"
                aria-label="Déplacement des pistes vers la corbeille"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
            >
                <div
                    className="h-full bg-red-600 transition-[width] duration-300"
                    style={{ width: `${ratio * 100}%` }}
                />
            </div>
            <p className="text-xs text-muted-foreground">Ne fermez pas cette fenêtre avant la fin.</p>
        </div>
    );
}
