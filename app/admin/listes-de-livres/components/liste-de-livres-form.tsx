'use client';

import React, { useMemo, useState } from 'react';
import { IntentLink } from '@/components/admin/IntentLink';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AudioLines, Eye, Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AideLink } from '@/components/ui/admin/AideLink';
import AudioRecorder from '@/components/AudioRecorder';
import { CoupDeCoeurPDFButton } from '@/admin/CoupDeCoeurPDFButton';
import { useWarnIfUnsavedChanges } from '@/components/userWarnIfUnsavedChanges';
import { toast } from '@/hooks/use-toast';
import { extensionForMimeType } from '@/lib/audio-file-extension';
import { parisDate } from '@/lib/paris-day';
import BooksSection from './books-section';
import { ListBook, ListNotes, ListStatusBadge, orderedListBooks } from './list-book';

export interface ListeDeLivresValues {
    title: string;
    description: string;
    audioPath: string | null;
    active: boolean;
    books: ListBook[];
    notes: ListNotes;
    /** Genres et livres dans l'ordre choisi (celui de `books`) ; faux : ordre alphabétique. */
    customOrder: boolean;
}

export interface ListeDeLivresPayload {
    title: string;
    description: string | null;
    audioPath: string | null;
    active: boolean;
    /** Dans l'ordre affiché ; `position` null partout pour l'ordre alphabétique. */
    books: { bookId: number; note: string | null; position: number | null }[];
}

interface ListeDeLivresFormProps {
    /** Absent à la création. */
    listId?: number;
    createdAt?: string;
    initialValues: ListeDeLivresValues;
    /** Lève une erreur au message lisible si l'enregistrement échoue. À la création, renvoie l'identifiant de la liste. */
    onSave: (payload: ListeDeLivresPayload) => Promise<{ id: number } | void>;
    onDelete?: () => Promise<void>;
}

const LIST_URL = '/admin/listes-de-livres';

const withNote = (map: ListNotes, bookId: number, note: string | null): ListNotes => {
    const next = { ...map };
    if (note) next[bookId] = note;
    else delete next[bookId];
    return next;
};

/**
 * L'éditeur d'une liste de livres, commun à la création et à la modification.
 *
 * Les deux pages étaient deux copies qui avaient divergé — composants de switch
 * différents, bouton d'enregistrement pleine largeur d'un côté et aligné à
 * droite de l'autre, avertissement de sortie sur une seule, messages d'erreur
 * en anglais sur l'autre. Elles ne diffèrent plus que par ce qu'elles chargent
 * et la route qu'elles appellent.
 */
export default function ListeDeLivresForm({ listId, createdAt, initialValues, onSave, onDelete }: ListeDeLivresFormProps) {
    const router = useRouter();
    const isNew = listId === undefined;

    const [title, setTitle] = useState(initialValues.title);
    const [description, setDescription] = useState(initialValues.description);
    const [active, setActive] = useState(initialValues.active);
    const [audioPath, setAudioPath] = useState(initialValues.audioPath);
    const [books, setBooks] = useState<ListBook[]>(initialValues.books);
    const [notes, setNotes] = useState<ListNotes>(initialValues.notes);
    const [customOrder, setCustomOrder] = useState(initialValues.customOrder);
    // La liste telle qu'enregistrée, à laquelle « Modifications non
    // enregistrées » se compare. Elle avance à chaque enregistrement — on reste
    // sur la page — et à chaque note posée seule (saveNote).
    const [saved, setSaved] = useState<ListeDeLivresValues>(initialValues);
    const [tempAudioBlob, setTempAudioBlob] = useState<Blob | null>(null);
    const [isReplacingAudio, setIsReplacingAudio] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isDirty = useMemo(() => {
        // Les livres et leur note : la note d'un livre retiré de la liste ne compte pas.
        const entries = (list: ListBook[], map: ListNotes) =>
            JSON.stringify(
                list
                    .map((book): [number, string | null] => [book.id, map[book.id] ?? null])
                    .sort((a, b) => a[0] - b[0])
            );
        // L'ordre ne compte que s'il est choisi : en alphabétique, il découle des livres.
        const order = (list: ListBook[], custom: boolean) =>
            custom ? JSON.stringify(orderedListBooks(list, true).map((book) => book.id)) : 'alphabétique';
        return (
            title !== saved.title ||
            description !== saved.description ||
            active !== saved.active ||
            audioPath !== saved.audioPath ||
            tempAudioBlob !== null ||
            entries(books, notes) !== entries(saved.books, saved.notes) ||
            order(books, customOrder) !== order(saved.books, saved.customOrder)
        );
    }, [title, description, active, audioPath, tempAudioBlob, books, notes, customOrder, saved]);

    // Un livre déjà enregistré dans la liste a sa ligne en base : sa note s'y
    // enregistre aussitôt. Un livre ajouté depuis, ou une liste pas encore
    // créée, n'en a pas : sa note part avec « Enregistrer ».
    const savedBookIds = useMemo(() => new Set(saved.books.map((book) => book.id)), [saved.books]);
    const savesNoteNow = (bookId: number) => listId !== undefined && savedBookIds.has(bookId);

    const saveNote = async (bookId: number, note: string | null) => {
        if (savesNoteNow(bookId)) {
            const res = await fetch(`/api/listes-de-livres/${listId}/books/${bookId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note }),
            });
            if (!res.ok) throw new Error("La note n'a pas pu être enregistrée. Réessayez.");
            setSaved((prev) => ({ ...prev, notes: withNote(prev.notes, bookId, note) }));
        }
        setNotes((prev) => withNote(prev, bookId, note));
    };

    const { navigateWithoutWarning } = useWarnIfUnsavedChanges({
        unsaved: isDirty && !isSaving && !isDeleting,
        prompt: {
            description:
                'Les modifications de cette liste de livres ne sont pas enregistrées.\n\n' +
                'Pour les garder, cliquez sur « Enregistrer » en bas de la page ; sinon quittez la page.',
        },
    });

    const leave = () => {
        navigateWithoutWarning(LIST_URL);
        router.refresh();
    };

    const canSave = title.trim() !== '' && books.length > 0 && !isSaving && !isDeleting;

    const handleSubmit = async (e: React.FormEvent) => {
        // Les fenêtres de la section Livres (nouvelle fiche, modification d'un
        // livre) ont leurs propres formulaires, rendus en portail : leur
        // `submit` remonte quand même jusqu'ici par l'arbre React.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (!canSave) return;
        setIsSaving(true);
        setError(null);

        try {
            let finalAudioPath = audioPath;
            if (tempAudioBlob) {
                const filename = `coup_description_${Date.now()}.${extensionForMimeType(tempAudioBlob.type)}`;
                const audioFormData = new FormData();
                audioFormData.append('audio', tempAudioBlob, filename);
                const uploadRes = await fetch('/api/upload-audio', { method: 'POST', body: audioFormData });
                if (!uploadRes.ok) throw new Error("Échec de l'envoi de l'enregistrement audio.");
                finalAudioPath = (await uploadRes.json()).filepath;
            }

            // Dans l'ordre affiché : en ordre choisi, le rang de chaque livre
            // est sa place ici, et celui d'un genre la place de son premier livre.
            const ordered = orderedListBooks(books, customOrder);
            const payload: ListeDeLivresPayload = {
                title: title.trim(),
                description: description.trim() || null,
                audioPath: finalAudioPath || null,
                active,
                books: ordered.map((book, index) => ({
                    bookId: book.id,
                    note: notes[book.id] ?? null,
                    position: customOrder ? index : null,
                })),
            };
            const created = await onSave(payload);

            // Une liste créée s'ouvre à sa propre page : elle existe désormais,
            // avec son bouton d'impression, et ses notes s'enregistrent seules.
            if (isNew) {
                if (created) navigateWithoutWarning(`${LIST_URL}/${created.id}`);
                else leave();
                return;
            }

            // Une liste modifiée reste ouverte. Revenir au tableau après chaque
            // enregistrement décourageait d'enregistrer en cours de route, et
            // obligeait à rouvrir la liste pour l'imprimer ou la poursuivre.
            const next: ListeDeLivresValues = {
                title: payload.title,
                description: payload.description ?? '',
                audioPath: payload.audioPath,
                active,
                books: ordered,
                notes: Object.fromEntries(
                    books.filter((book) => notes[book.id]).map((book) => [book.id, notes[book.id]])
                ),
                customOrder,
            };
            setBooks(ordered);
            setTitle(next.title);
            setDescription(next.description);
            setAudioPath(next.audioPath);
            setTempAudioBlob(null);
            setIsReplacingAudio(false);
            setNotes(next.notes);
            setSaved(next);
            setIsSaving(false);
            toast({ title: 'Liste enregistrée' });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Échec de l'enregistrement de la liste de livres.");
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!onDelete) return;
        setIsDeleting(true);
        setError(null);
        try {
            await onDelete();
            leave();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Échec de la suppression de la liste de livres.');
            setIsDeleting(false);
        }
    };

    const missing = title.trim() === '' ? 'Donnez un titre à la liste' : books.length === 0 ? 'Ajoutez au moins un livre' : null;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* ── en-tête ─────────────────────────────────────────────── */}
            <div className="space-y-3">
                <IntentLink
                    href={LIST_URL}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" /> Listes de livres
                </IntentLink>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Le titre de la liste plutôt que « Modifier la liste de
                                livres » : le lien de retour dit déjà où l'on est, et
                                le sous-titre répétait ce titre entre guillemets. */}
                            <h1 className="break-words text-2xl font-bold text-foreground">
                                {isNew ? 'Nouvelle liste de livres' : saved.title}
                            </h1>
                            {/* Pas de statut avant la création : une liste qui
                                n'existe pas encore n'est ni visible ni masquée. */}
                            {!isNew && <ListStatusBadge active={active} />}
                            <AideLink section="liste-de-livres" />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {isNew
                                ? 'Choisissez les livres, ajoutez si vous le souhaitez une présentation audio, puis rendez-la visible quand elle est prête.'
                                : `Liste de livres${createdAt ? ` créée le ${parisDate(createdAt)}` : ''}`}
                        </p>
                    </div>
                    {!isNew && (
                        <div className="flex items-center gap-2">
                            {/* Nouvel onglet : l'éditeur, et ce qui n'y est pas encore
                                enregistré, restent où ils sont. */}
                            <Button asChild variant="outline" className="border-border bg-card text-foreground hover:bg-muted">
                                <IntentLink
                                    href={`${LIST_URL}/${listId}/apercu`}
                                    target="_blank"
                                    rel="noopener"
                                    title="La liste telle qu'elle apparaît sur le site, dans sa dernière version enregistrée"
                                >
                                    <Eye /> Aperçu
                                    <span className="sr-only"> (s&apos;ouvre dans un nouvel onglet)</span>
                                </IntentLink>
                            </Button>
                            <CoupDeCoeurPDFButton coupDeCoeurId={listId} />
                            <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                                <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Plus d'actions">
                                        <MoreHorizontal />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-56 p-1 bg-card border-border">
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-red-600 hover:bg-red-500/10 dark:text-red-400"
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            setIsDeleteOpen(true);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" /> Supprimer la liste
                                    </button>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Deux colonnes d'égale hauteur, sans vide : la visibilité rejoint
                la présentation audio à droite, et la description, à gauche,
                prend la hauteur qui reste. Seule, la carte audio s'étirait
                jusqu'au bas des Informations autour de deux boutons. */}
            <div className="grid gap-6 lg:grid-cols-5">
                {/* ── informations ────────────────────────────────────── */}
                <Card className="flex min-w-0 flex-col bg-card border-border lg:col-span-3">
                    <CardHeader className="pb-4">
                        <CardTitle as="h2" className="text-lg text-foreground">Informations</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-5">
                        <div className="space-y-2">
                            <label htmlFor="title" className="text-sm font-medium text-foreground">
                                Titre <span className="text-muted-foreground">*</span>
                            </label>
                            <Input
                                id="title"
                                required
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Par exemple : Liste de septembre 2026"
                                className="bg-field border-border text-foreground placeholder:text-muted-foreground"
                            />
                        </div>

                        <div className="flex flex-1 flex-col gap-2">
                            <label htmlFor="description" className="text-sm font-medium text-foreground">
                                Description <span className="font-normal text-muted-foreground">(facultative)</span>
                            </label>
                            <Textarea
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Informations générales affichées en haut de la liste de livres"
                                className="min-h-[120px] flex-1 bg-field border-border text-foreground placeholder:text-muted-foreground"
                            />
                        </div>
                    </CardContent>
                </Card>

                <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
                    {/* ── visibilité ──────────────────────────────────── */}
                    <Card className="bg-card border-border">
                        <label htmlFor="active" className="flex cursor-pointer items-center justify-between gap-4 p-5">
                            {/* L'interrupteur dit l'état ; la phrase dessous le répétait. */}
                            <div className="text-base font-semibold text-foreground">Visible sur le site public</div>
                            <Switch id="active" checked={active} onCheckedChange={setActive} />
                        </label>
                    </Card>

                    {/* ── présentation audio ──────────────────────────── */}
                    <Card className="flex flex-1 flex-col bg-card border-border">
                        <CardHeader className="pb-4">
                            <CardTitle as="h2" className="text-lg text-foreground">Présentation audio</CardTitle>
                            <CardDescription>
                                Facultative : une brève introduction enregistrée pour les auditeurs.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col gap-3">
                            {audioPath && !isReplacingAudio ? (
                                <div className="flex flex-1 flex-col justify-center gap-3 rounded-lg border border-border bg-muted/20 p-4">
                                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        <AudioLines className="h-4 w-4 text-primary" aria-hidden="true" />
                                        Présentation enregistrée
                                    </div>
                                    <audio src={audioPath} controls className="w-full" />
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="outline" size="sm" onClick={() => setIsReplacingAudio(true)}>
                                            Remplacer
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                                            onClick={() => setAudioPath(null)}
                                        >
                                            Retirer
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <AudioRecorder
                                        className="flex-1"
                                        idleTitle={audioPath && isReplacingAudio ? 'Nouvelle présentation audio' : undefined}
                                        onConfirm={setTempAudioBlob}
                                        onClear={() => setTempAudioBlob(null)}
                                    />
                                    {audioPath && isReplacingAudio && (
                                        <button
                                            type="button"
                                            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                            onClick={() => {
                                                setTempAudioBlob(null);
                                                setIsReplacingAudio(false);
                                            }}
                                        >
                                            Garder l&apos;audio actuel
                                        </button>
                                    )}
                                    {!audioPath && saved.audioPath && (
                                        <button
                                            type="button"
                                            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                            onClick={() => setAudioPath(saved.audioPath)}
                                        >
                                            Remettre l&apos;audio retiré
                                        </button>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* ── livres ──────────────────────────────────────────────── */}
            <BooksSection books={books} setBooks={setBooks} notes={notes} customOrder={customOrder} setCustomOrder={setCustomOrder} onSaveNote={saveNote} savesNoteNow={savesNoteNow} listId={listId} />

            {/* ── barre d'enregistrement ──────────────────────────────────
                Collante : une liste d'une trentaine de livres repousse le
                bouton loin sous le pli, et c'est pourtant le geste qui compte. */}
            <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
                <div className={`items-center gap-2 text-sm ${isDirty || missing ? 'flex' : 'hidden sm:flex'}`}>
                    {isDirty ? (
                        <>
                            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                            <span className="text-foreground">Modifications non enregistrées</span>
                        </>
                    ) : (
                        // Une liste pas encore créée n'a rien à modifier : seul ce
                        // qui manque pour la créer y a sa place.
                        !isNew && <span className="text-muted-foreground">Aucune modification</span>
                    )}
                    {missing && (
                        <span className="text-muted-foreground">
                            {isDirty || !isNew ? '· ' : ''}
                            {missing}
                        </span>
                    )}
                </div>
                <div className="ml-auto flex gap-2">
                    <Button type="button" variant="outline" onClick={leave} disabled={isSaving || isDeleting}>
                        {/* Rien à annuler une fois tout enregistré : le bouton ne fait plus que sortir. */}
                        {isDirty || isNew ? 'Annuler' : 'Fermer'}
                    </Button>
                    <Button type="submit" disabled={!canSave}>
                        {isSaving && <Loader2 className="animate-spin" />}
                        {isSaving ? 'Enregistrement…' : isNew ? 'Créer la liste' : 'Enregistrer'}
                    </Button>
                </div>
            </div>

            <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">Supprimer cette liste de livres ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            La liste « {saved.title} » sera supprimée, et retirée du site si elle y est
                            visible. Les livres eux-mêmes restent au catalogue. Cette action est irréversible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleDelete()}
                            className="bg-red-600 text-white hover:bg-red-700"
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </form>
    );
}
