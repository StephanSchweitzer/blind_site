'use client';

import React, { useMemo, useState } from 'react';
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
import { apiErrorToast } from '@/admin/ApiErrorMessage';
import { toUserFacingError, userErrorFromResponse } from '@/lib/user-error';
import { isAllowedAudioExtension, isAppleDoubleName, renamePreview, trackNameProblem } from '@/lib/audio/naming';

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
    /** Every track of the folder in playback order, for the position preview. */
    folderNames: string[];
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
    folderNames,
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
    // Composé (NFC), comme un envoi : voir sanitiseTrackTitle.
    const typed = base.trim().normalize('NFC');
    // Le nom complet collé, extension comprise — le geste naturel quand on copie
    // un nom de fichier. Gardé tel quel, la piste devenait « ….mp3.mp3 » sans
    // un mot : l'extension tapée est retirée, puisqu'elle est ajoutée d'office.
    const extTyped =
        !!ext && typed.length > ext.length + 1 && typed.toLowerCase().endsWith(`.${ext.toLowerCase()}`);
    const trimmed = extTyped ? typed.slice(0, -(ext.length + 1)).trimEnd() : typed;
    // Une AUTRE extension audio tapée : « x.wav » deviendrait « x.wav.mp3 ».
    const otherExt = !!ext && isAllowedAudioExtension(trimmed);
    const newName = ext ? `${trimmed}.${ext}` : trimmed;
    // Le refus de la route, dit avant l'envoi : un nom en « ._ » est celui d'un
    // fichier de métadonnées Mac, que tous les listings ignorent (isAudioKey).
    const appleDouble = isAppleDoubleName(newName);
    // Même règle que la route (trackNameProblem) : « / », « .. », un nom que
    // Windows ne sait pas créer — ni au téléchargement d'une piste ni en
    // décompressant l'archive. Rien tant que le champ est vide.
    const problem = trimmed ? trackNameProblem(newName) : null;
    // Le refus de la route (« nom déjà pris »), dit pendant la saisie. Sans
    // distinction de casse : deux pistes qui ne diffèrent que par elle n'en
    // font qu'une une fois décompressées sous Windows.
    const taken =
        newName !== track?.name &&
        folderNames.some((n) => n !== track?.name && n.normalize('NFC').toLowerCase() === newName.toLowerCase());
    const valid =
        trimmed.length > 0 &&
        !problem &&
        !otherExt &&
        !appleDouble &&
        !taken &&
        newName !== track?.name;
    // Où la piste ira, dans le portail et sur un CD — le but même d'un renommage.
    const preview = useMemo(
        () => (track && valid ? renamePreview(folderNames, track.name, newName) : null),
        [track, valid, folderNames, newName],
    );

    const handleRename = async () => {
        if (!track || !valid || isRenaming) return;
        setIsRenaming(true);
        try {
            const res = await fetch(`/api/books/${bookId}/audio/track`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: track.key, filename: track.name, newName }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw userErrorFromResponse(res, data);

            toast({
                title: 'Piste renommée',
                description: data?.message ?? `« ${track.name} » a été renommé en « ${newName} ».`,
                className: 'bg-green-100 border-green-500 text-green-900',
            });

            onRenamed?.();
            onOpenChange(false);
        } catch (err) {
            toast(
                apiErrorToast(err, {
                    title: 'Renommage impossible',
                    action: `Renommer la piste « ${track.name} » en « ${newName} » (livre #${bookId})`,
                }),
            );
            // Issue inconnue : le fichier a pu bouger malgré l'erreur. On referme et
            // on relit le dossier, pour que la liste montre l'état réel plutôt
            // que celui d'avant la tentative. Un refus connu, lui, n'a rien
            // changé — la fenêtre reste ouverte.
            if (toUserFacingError(err).kind !== 'known') {
                onRenamed?.();
                onOpenChange(false);
            }
        } finally {
            setIsRenaming(false);
        }
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                // Not closable mid-request — see DeleteAudioTrackModal.
                if (!open && isRenaming) return;
                onOpenChange(open);
            }}
        >
            <DialogContent className="max-w-lg bg-card border-border">
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
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            void handleRename();
                                        }
                                    }}
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
                            {appleDouble && (
                                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                    Un nom commençant par « ._ » (ou contenant « ._ » après un espace) est celui
                                    d’un fichier de métadonnées Mac : la piste disparaîtrait des listings.
                                </p>
                            )}
                            {taken && (
                                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                    Une autre piste de ce dossier porte déjà ce nom.
                                </p>
                            )}
                            {extTyped && !otherExt && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    L’extension « .{ext} » tapée à la fin est ignorée : elle est ajoutée d’office.
                                </p>
                            )}
                            {otherExt && (
                                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                    Ce nom se termine déjà par une extension audio : la piste s’appellerait «{' '}
                                    <span className="font-mono break-all">{newName}</span> ». Retirez-la — l’extension
                                    reste « .{ext} ».
                                </p>
                            )}
                            {problem && (
                                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{problem}</p>
                            )}
                            {preview && (
                                <p className="mt-2 text-sm text-foreground">
                                    {preview.position === track.order
                                        ? `Reste la piste n° ${preview.position}.`
                                        : `Deviendra la piste n° ${preview.position} (au lieu de ${track.order}).`}
                                </p>
                            )}
                            {preview?.cdSwap && (
                                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                    Sur un CD, ce nom passerait {preview.cdSwap.cdFirst ? 'avant' : 'après'} «{' '}
                                    <span className="font-mono break-all">{preview.cdSwap.other}</span> », alors
                                    que le portail le joue {preview.cdSwap.cdFirst ? 'après' : 'avant'} : un graveur
                                    range les noms caractère par caractère, sans lire les nombres ni ignorer les
                                    majuscules. Le plus sûr : un numéro écrit avec autant de chiffres que celui des
                                    autres pistes.
                                </p>
                            )}
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
