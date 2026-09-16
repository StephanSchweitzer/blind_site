'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AudioLines, Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
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
import { extensionForMimeType } from '@/lib/audio-file-extension';
import { parisDate } from '@/lib/paris-day';
import BooksSection from './books-section';
import { ListBook, ListStatusBadge } from './list-book';

export interface ListeDeLivresValues {
    title: string;
    description: string;
    audioPath: string | null;
    active: boolean;
    books: ListBook[];
}

export interface ListeDeLivresPayload {
    title: string;
    description: string | null;
    audioPath: string | null;
    active: boolean;
    bookIds: number[];
}

interface ListeDeLivresFormProps {
    /** Absent à la création. */
    listId?: number;
    createdAt?: string;
    initialValues: ListeDeLivresValues;
    /** Lève une erreur au message lisible si l'enregistrement échoue. */
    onSave: (payload: ListeDeLivresPayload) => Promise<void>;
    onDelete?: () => Promise<void>;
}

const LIST_URL = '/admin/listes-de-livres';

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
    const [tempAudioBlob, setTempAudioBlob] = useState<Blob | null>(null);
    const [isReplacingAudio, setIsReplacingAudio] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isDirty = useMemo(() => {
        const ids = (list: ListBook[]) => JSON.stringify(list.map((book) => book.id).sort((a, b) => a - b));
        return (
            title !== initialValues.title ||
            description !== initialValues.description ||
            active !== initialValues.active ||
            audioPath !== initialValues.audioPath ||
            tempAudioBlob !== null ||
            ids(books) !== ids(initialValues.books)
        );
    }, [title, description, active, audioPath, tempAudioBlob, books, initialValues]);

    const { navigateWithoutWarning, NavigationWarningDialog } = useWarnIfUnsavedChanges({
        unsaved: isDirty && !isSaving && !isDeleting,
        message:
            'Les modifications de cette liste de livres ne sont pas enregistrées.\n\n' +
            'Pour les garder, cliquez sur « Enregistrer » en bas de la page ; sinon quittez la page.',
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

            await onSave({
                title: title.trim(),
                description: description.trim() || null,
                audioPath: finalAudioPath || null,
                active,
                bookIds: books.map((book) => book.id),
            });
            leave();
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
                <Link
                    href={LIST_URL}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" /> Listes de livres
                </Link>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Le titre de la liste plutôt que « Modifier la liste de
                                livres » : le lien de retour dit déjà où l'on est, et
                                le sous-titre répétait ce titre entre guillemets. */}
                            <h1 className="break-words text-2xl font-bold text-foreground">
                                {isNew ? 'Nouvelle liste de livres' : initialValues.title}
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
                        <CardTitle className="text-lg text-foreground">Informations</CardTitle>
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
                        <label htmlFor="active" className="flex cursor-pointer items-start justify-between gap-4 p-5">
                            <div>
                                <div className="text-base font-semibold text-foreground">Visible sur le site public</div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {active
                                        ? 'La liste apparaît dans la partie publique du site.'
                                        : "La liste n'apparaît que dans l'administration : composez-la à votre rythme, puis rendez-la visible une fois prête."}
                                </p>
                            </div>
                            <Switch id="active" checked={active} onCheckedChange={setActive} className="mt-0.5" />
                        </label>
                    </Card>

                    {/* ── présentation audio ──────────────────────────── */}
                    <Card className="flex flex-1 flex-col bg-card border-border">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg text-foreground">Présentation audio</CardTitle>
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
                                    {!audioPath && initialValues.audioPath && (
                                        <button
                                            type="button"
                                            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                            onClick={() => setAudioPath(initialValues.audioPath)}
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
            <BooksSection books={books} setBooks={setBooks} listId={listId} />

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
                        Annuler
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
                            La liste « {initialValues.title} » sera supprimée, et retirée du site si elle y est
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

            <NavigationWarningDialog />
        </form>
    );
}
