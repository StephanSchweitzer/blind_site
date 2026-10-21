import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { LIST_NOTE_MAX_LENGTH, normalizeListNote } from '@/lib/books/listEntries';

interface ListNoteDialogProps {
    bookTitle: string;
    note: string | null;
    /**
     * Vrai quand le livre est déjà enregistré dans la liste : la note
     * s'enregistre en quittant la fenêtre. Faux pour un livre ajouté depuis le
     * dernier enregistrement : elle part alors avec la liste.
     */
    savesNow: boolean;
    onClose: () => void;
    /** null retire la note. Lève une erreur au message lisible si l'enregistrement échoue. */
    onSave: (note: string | null) => Promise<void>;
}

/** La note d'un livre pour cette liste seulement. */
export function ListNoteDialog({ bookTitle, note, savesNow, onClose, onSave }: ListNoteDialogProps) {
    const [draft, setDraft] = useState(note ?? '');
    const [pending, setPending] = useState<'save' | 'delete' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const isEdit = note !== null;

    const submit = async (next: string | null, kind: 'save' | 'delete') => {
        setPending(kind);
        setError(null);
        try {
            await onSave(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : "La note n'a pas pu être enregistrée.");
            setPending(null);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
            <DialogContent className="max-w-lg bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="text-foreground">{isEdit ? 'Modifier la note' : 'Ajouter une note'}</DialogTitle>
                    <DialogDescription>
                        Pour « {bookTitle} », dans cette liste seulement. Elle s&apos;affiche en italique après la
                        présentation du livre, sur le site public et dans la liste imprimée.
                        {!savesNow && ' Elle sera enregistrée avec la liste.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                    <label htmlFor="list-note" className="sr-only">Note</label>
                    <Textarea
                        id="list-note"
                        autoFocus
                        value={draft}
                        maxLength={LIST_NOTE_MAX_LENGTH}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Par exemple : Prix Goncourt 2026"
                        className="min-h-[110px] bg-field border-border text-foreground placeholder:text-muted-foreground"
                    />
                    <p className="text-right text-xs text-muted-foreground">
                        {draft.length} / {LIST_NOTE_MAX_LENGTH}
                    </p>
                </div>
                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <DialogFooter className="gap-2 sm:justify-between">
                    {isEdit ? (
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={pending !== null}
                            className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                            onClick={() => void submit(null, 'delete')}
                        >
                            {pending === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />} Supprimer la note
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={pending !== null}>
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void submit(normalizeListNote(draft), 'save')}
                            variant="save"
                        >
                            {pending === 'save' && <Loader2 className="animate-spin" />}
                            {savesNow ? 'Enregistrer la note' : 'Valider'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
