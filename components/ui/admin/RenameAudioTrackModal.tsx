'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface AudioTrackRenameTarget {
    order: number;
    key: string;
    name: string;
}

interface RenameAudioTrackModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    bookId: number;
    track: AudioTrackRenameTarget | null;
    onRenamed?: () => void;
}

/** Splits off the extension so it can be shown fixed and never sent for edit. */
function splitName(name: string): { base: string; ext: string } {
    const m = /^(.*)\.([^.]+)$/.exec(name);
    return m ? { base: m[1], ext: m[2] } : { base: name, ext: '' };
}

/**
 * Rename one track, in place, within the same folder.
 *
 * This exists because the playback order is the natural-sort of the
 * filename itself (see lib/audio/bucket-core.ts) — when a track lands in the
 * wrong position, the fix is the name, not the sort. The extension is fixed
 * and not editable here: swapping it could drop the file out of the
 * AUDIO_EXT filter that decides whether it's even recognised as a track.
 */
export function RenameAudioTrackModal({
    isOpen,
    onOpenChange,
    bookId,
    track,
    onRenamed,
}: RenameAudioTrackModalProps) {
    const { toast } = useToast();
    const [base, setBase] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);

    // Reset the field for each fresh opening, without a state-setting effect.
    //
    // Keyed on the track AND on the dialogue actually being open: keyed on the
    // track alone, cancelling a rename and reopening the SAME row brought back
    // the abandoned draft — the key had not changed, so nothing reset it. The
    // admin was then one click away from applying a name they had explicitly
    // backed out of, over a row whose real name the dialogue displays right
    // above. Reopening now always starts from the name the track has today.
    const [lastOpened, setLastOpened] = useState<string | null>(null);
    const openFor = isOpen && track ? track.key : null;
    if (openFor !== lastOpened) {
        setLastOpened(openFor);
        if (openFor && track) setBase(splitName(track.name).base);
    }

    const ext = track ? splitName(track.name).ext : '';
    const trimmed = base.trim();
    const newName = ext ? `${trimmed}.${ext}` : trimmed;
    const valid = trimmed.length > 0 && !trimmed.includes('/') && newName !== track?.name;

    const handleRename = async () => {
        if (!track || !valid) return;
        setIsRenaming(true);
        try {
            const res = await fetch(`/api/books/${bookId}/audio/track`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: track.key, filename: track.name, newName }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Échec du renommage');

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Renommé</span>,
                description: <span className="text-xl mt-2">{data.message}</span>,
                className: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
            });

            onRenamed?.();
            onOpenChange(false);
        } catch (err) {
            toast({
                variant: 'destructive',
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: (
                    <span className="text-xl mt-2">
                        {err instanceof Error ? err.message : 'Erreur inattendue'}
                    </span>
                ),
                className: 'bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6',
            });
        } finally {
            setIsRenaming(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex items-center gap-2">
                        <Pencil className="h-5 w-5" />
                        Renommer une piste
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground pt-2">
                        Le fichier est déplacé vers son nouveau nom dans le même dossier. L’ordre de
                        lecture, calculé à partir du nom, changera en conséquence.
                    </DialogDescription>
                </DialogHeader>

                {track && (
                    <div className="space-y-4">
                        <div className="rounded-md border border-border bg-field p-3">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                Piste n° {track.order} — nom actuel
                            </div>
                            <div className="mt-1 font-mono text-sm text-foreground break-all whitespace-pre-wrap">
                                {track.name}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="new-name" className="text-sm text-foreground">
                                Nouveau nom
                            </label>
                            <div className="mt-1 flex items-center gap-1">
                                <Input
                                    id="new-name"
                                    value={base}
                                    onChange={(e) => setBase(e.target.value)}
                                    autoComplete="off"
                                    className="bg-field border-border text-foreground font-mono"
                                />
                                {ext && (
                                    <span className="flex-shrink-0 font-mono text-sm text-muted-foreground">
                                        .{ext}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                L’extension est fixe et ne peut pas être modifiée ici.
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isRenaming}
                        className="bg-field border-border text-foreground hover:bg-muted"
                    >
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        onClick={handleRename}
                        disabled={isRenaming || !valid}
                    >
                        {isRenaming ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Renommage...
                            </span>
                        ) : (
                            'Renommer'
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
