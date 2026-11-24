'use client';

import React, { useCallback, useEffect, useId, useState } from 'react';
import { Check, Link2, Pencil, Plus, RotateCcw, StickyNote, Trash2 } from 'lucide-react';
import { IntentLink } from '@/components/admin/IntentLink';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/hooks/use-toast';
import { apiErrorToast, ApiErrorMessage } from '@/admin/ApiErrorMessage';
import { DatePickerField, fromDayString, toDayString } from '@/admin/DatePickerField';
import { UserSearchCombobox, type UserSearchResult } from '@/admin/UserSearchCombobox';
import { readUserError, toUserFacingError, UserFacingError } from '@/lib/user-error';
import { parisDate } from '@/lib/paris-day';
import { cn } from '@/lib/utils';
import {
    POST_IT_LINK_LABELS,
    POST_IT_MAX_LENGTH,
    type PostItInput,
    type PostItItem,
    type PostItLinkKind,
    type PostItState,
} from '@/lib/post-its/types';

/**
 * Le tableau des post-its : sur le tableau de bord (les ouverts) et sur
 * /admin/post-its (ouverts ou terminés, page par page).
 *
 * Une liste de cartes, pas un mur où l'on fait glisser des notes : un mur se
 * parcourt mal au clavier et pas du tout au lecteur d'écran, et l'ordre y
 * dépend de qui a rangé en dernier. Ici l'ordre est celui du serveur — rappels
 * arrivés en tête, puis du plus récent au plus ancien (lib/post-its/postIts.ts).
 *
 * Le rose est une couleur de post-it de bureau, et celle de leur carte et de leur
 * icône dans le menu (section-icons.ts) : un post-it se reconnaît partout de la
 * même teinte. Pas de rouge, pas de priorité : un rappel arrivé passe en tête,
 * en bleu, sans plus.
 */

type Mode = 'dashboard' | PostItState;

const PERSON_DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };

/** Jour stocké à minuit UTC : relu en UTC, sinon il glisse à la veille à l'ouest. */
const formatDay = (day: string) =>
    new Date(`${day}T00:00:00.000Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Les premiers mots, pour nommer un post-it dans un bouton ou une confirmation. */
const excerpt = (text: string) => {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 40 ? `${flat.slice(0, 39).trimEnd()}…` : flat;
};

async function send(url: string, init: RequestInit): Promise<PostItItem | null> {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw await readUserError(res);
    return init.method === 'DELETE' ? null : res.json();
}

export function PostItBoard({
    initialItems,
    initialTotal,
    mode,
    page = 1,
    limit = 25,
    headingLevel = 'h3',
}: {
    initialItems: PostItItem[];
    initialTotal: number;
    mode: Mode;
    /** Page des terminés — la page change par l'URL, qui remonte le composant. */
    page?: number;
    limit?: number;
    /** Le niveau des titres (cachés) des cartes, sous celui de la section. */
    headingLevel?: 'h2' | 'h3';
}) {
    const confirm = useConfirm();
    const [items, setItems] = useState(initialItems);
    const [total, setTotal] = useState(initialTotal);
    const [editing, setEditing] = useState<PostItItem | 'new' | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const reload = useCallback(async () => {
        const params = mode === 'termines'
            ? new URLSearchParams({ etat: 'termines', page: String(page), limit: String(limit) })
            : new URLSearchParams();
        const res = await fetch(`/api/post-its?${params}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setItems(data.items);
        setTotal(data.total);
    }, [mode, page, limit]);

    const run = useCallback(async (id: number, what: string, action: () => Promise<unknown>) => {
        setBusyId(id);
        try {
            await action();
            await reload();
        } catch (err) {
            toast(apiErrorToast(err, { title: `${what} impossible`, action: `${what} — post-it #${id}` }));
        } finally {
            setBusyId(null);
        }
    }, [reload]);

    const toggleDone = (item: PostItItem) => {
        const done = item.doneAt === null;
        void run(item.id, done ? 'Marquer comme fait' : 'Rouvrir', async () => {
            await send(`/api/post-its/${item.id}`, { method: 'PATCH', body: JSON.stringify({ done }) });
            toast({ title: done ? 'Post-it marqué comme fait' : 'Post-it rouvert' });
        });
    };

    const remove = async (item: PostItItem) => {
        const ok = await confirm({
            title: 'Supprimer ce post-it ?',
            description: item.doneAt === null
                ? `« ${excerpt(item.content)} »\n\nPour le retirer du tableau sans le perdre, marquez-le plutôt comme fait.`
                : `« ${excerpt(item.content)} »`,
            confirmLabel: 'Supprimer',
            destructive: true,
        });
        if (!ok) return;
        void run(item.id, 'Suppression', async () => {
            await send(`/api/post-its/${item.id}`, { method: 'DELETE' });
            toast({ title: 'Post-it supprimé' });
        });
    };

    const saved = async () => {
        setEditing(null);
        await reload();
    };

    const empty =
        mode === 'termines'
            ? 'Aucun post-it terminé.'
            : 'Aucun post-it pour l’instant.';

    return (
        <div className="space-y-4">
            {mode !== 'termines' && (
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" onClick={() => setEditing('new')} className="gap-2">
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Ajouter un post-it
                    </Button>
                    {mode === 'dashboard' && (
                        <IntentLink href="/admin/post-its?etat=termines" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
                            Voir les post-its terminés
                        </IntentLink>
                    )}
                    {total > items.length && (
                        <span className="text-sm text-muted-foreground">
                            {items.length} affichés sur {total}
                        </span>
                    )}
                </div>
            )}

            {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">{empty}</p>
            ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                        <li key={item.id}>
                            <PostItCard
                                item={item}
                                busy={busyId === item.id}
                                headingLevel={headingLevel}
                                onToggleDone={() => toggleDone(item)}
                                onEdit={() => setEditing(item)}
                                onDelete={() => void remove(item)}
                            />
                        </li>
                    ))}
                </ul>
            )}

            <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
                <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                    {editing !== null && (
                        <PostItForm
                            key={editing === 'new' ? 'new' : editing.id}
                            item={editing === 'new' ? null : editing}
                            onSaved={saved}
                            onCancel={() => setEditing(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function PostItCard({
    item,
    busy,
    headingLevel: Heading,
    onToggleDone,
    onEdit,
    onDelete,
}: {
    item: PostItItem;
    busy: boolean;
    headingLevel: 'h2' | 'h3';
    onToggleDone: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const headingId = useId();
    const done = item.doneAt !== null;
    const name = excerpt(item.content);
    const written = `${item.author?.name ?? 'Auteur inconnu'} · ${parisDate(new Date(item.createdAt), PERSON_DAY)}`;

    return (
        <article
            aria-labelledby={headingId}
            className={cn(
                'flex h-full flex-col gap-3 rounded-lg border p-4 text-foreground',
                done
                    ? 'border-border bg-card'
                    : 'border-pink-600 bg-pink-50 dark:border-pink-500 dark:bg-pink-900/20',
            )}
        >
            <Heading id={headingId} className="sr-only">
                Post-it de {item.author?.name ?? 'auteur inconnu'} : {name}
            </Heading>

            {item.remindOn && !done && (
                <p className="text-sm">
                    {item.due ? (
                        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 font-semibold text-blue-900 dark:bg-blue-900/40 dark:text-blue-200">
                            Rappel le {formatDay(item.remindOn)}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">Rappel le {formatDay(item.remindOn)}</span>
                    )}
                </p>
            )}

            <p className="whitespace-pre-wrap break-words text-base">{item.content}</p>

            {item.link && (
                <p className="text-sm">
                    <IntentLink
                        href={item.link.href}
                        className={cn(
                            'inline-flex items-center gap-1.5 font-medium underline underline-offset-2 hover:text-foreground',
                            item.link.deleted && 'line-through text-muted-foreground',
                        )}
                    >
                        <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {item.link.label}
                    </IntentLink>
                    {item.link.deleted && <span className="text-muted-foreground"> (supprimée)</span>}
                </p>
            )}

            <div className="mt-auto space-y-3">
                <p className="text-sm text-muted-foreground">
                    {written}
                    {done && item.doneAt && (
                        <>
                            <br />
                            Fait{item.doneBy ? ` par ${item.doneBy.name}` : ''} le {parisDate(new Date(item.doneAt), PERSON_DAY)}
                        </>
                    )}
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onToggleDone}
                        disabled={busy}
                        aria-label={`${done ? 'Rouvrir' : 'Marquer comme fait'} : ${name}`}
                        className="gap-1.5 bg-card"
                    >
                        {done ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                        {done ? 'Rouvrir' : 'Fait'}
                    </Button>
                    {item.canEdit && !done && (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={onEdit}
                            disabled={busy}
                            aria-label={`Modifier : ${name}`}
                            className="gap-1.5"
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Modifier
                        </Button>
                    )}
                    {item.canEdit && (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={onDelete}
                            disabled={busy}
                            aria-label={`Supprimer : ${name}`}
                            className="gap-1.5"
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Supprimer
                        </Button>
                    )}
                </div>
            </div>
        </article>
    );
}

type LinkChoice = 'none' | PostItLinkKind;

/** Le numéro attendu pour chaque type de lien, dans le champ « N° ». */
const NUMBER_LABEL: Record<Exclude<PostItLinkKind, 'user'>, string> = {
    order: 'N° de la demande',
    assignment: 'N° de l’attribution',
    bill: 'N° de la facture',
};

function PostItForm({
    item,
    onSaved,
    onCancel,
}: {
    item: PostItItem | null;
    onSaved: () => void;
    onCancel: () => void;
}) {
    const ids = { text: useId(), date: useId(), link: useId(), number: useId(), person: useId() };
    const [content, setContent] = useState(item?.content ?? '');
    const [remindOn, setRemindOn] = useState<Date | null>(fromDayString(item?.remindOn));
    const [linkKind, setLinkKind] = useState<LinkChoice>(item?.link?.kind ?? 'none');
    const [person, setPerson] = useState<UserSearchResult | null>(
        item?.link?.kind === 'user' ? ({ id: item.link.id, firstName: item.link.label } as UserSearchResult) : null,
    );
    const [number, setNumber] = useState(item?.link && item.link.kind !== 'user' ? String(item.link.id) : '');
    const [error, setError] = useState<UserFacingError | null>(null);
    const [saving, setSaving] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        let link: PostItInput['link'] = null;
        if (linkKind === 'user') {
            if (!person) return setError(new UserFacingError('Choisissez la fiche, ou retirez le lien.', 'known'));
            link = { kind: 'user', id: person.id };
        } else if (linkKind !== 'none') {
            const id = Number(number.trim().replace(/^#/, ''));
            if (!Number.isInteger(id) || id <= 0) {
                return setError(new UserFacingError(`Indiquez le ${NUMBER_LABEL[linkKind].toLowerCase()}, ou retirez le lien.`, 'known'));
            }
            link = { kind: linkKind, id };
        }
        const body: PostItInput = { content, remindOn: remindOn ? toDayString(remindOn) : null, link };
        setSaving(true);
        try {
            await send(item ? `/api/post-its/${item.id}` : '/api/post-its', {
                method: item ? 'PATCH' : 'POST',
                body: JSON.stringify(body),
            });
            toast({ title: item ? 'Post-it modifié' : 'Post-it ajouté' });
            onSaved();
        } catch (err) {
            setError(toUserFacingError(err));
        } finally {
            setSaving(false);
        }
    };

    const remaining = POST_IT_MAX_LENGTH - content.length;

    return (
        <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-foreground">
                    <StickyNote className="h-5 w-5 text-pink-700 dark:text-pink-400" aria-hidden="true" />
                    {item ? 'Modifier le post-it' : 'Ajouter un post-it'}
                </DialogTitle>
                <DialogDescription>Tous les permanents le verront sur le tableau de bord.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
                <label htmlFor={ids.text} className="text-sm font-medium text-foreground">
                    Texte <span className="text-red-400">*</span>
                </label>
                <Textarea
                    id={ids.text}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    maxLength={POST_IT_MAX_LENGTH}
                    rows={5}
                    required
                    autoFocus
                    aria-describedby={`${ids.text}-count`}
                />
                <p id={`${ids.text}-count`} className="text-xs text-muted-foreground">
                    {remaining} caractère{remaining > 1 ? 's' : ''} restant{remaining > 1 ? 's' : ''}
                </p>
            </div>

            <div className="space-y-2">
                <label htmlFor={ids.date} className="text-sm font-medium text-foreground">
                    Rappel le <span className="font-normal text-muted-foreground">(facultatif)</span>
                </label>
                <DatePickerField id={ids.date} value={remindOn} onChange={setRemindOn} clearable placeholder="Aucun rappel" />
                <p className="text-xs text-muted-foreground">Ce jour-là, le post-it passe en tête du tableau.</p>
            </div>

            <div className="space-y-2">
                <label htmlFor={ids.link} className="text-sm font-medium text-foreground">
                    Lié à <span className="font-normal text-muted-foreground">(facultatif)</span>
                </label>
                <Select value={linkKind} onValueChange={(v) => { setLinkKind(v as LinkChoice); setError(null); }}>
                    <SelectTrigger id={ids.link} className="bg-card">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Rien</SelectItem>
                        {(Object.keys(POST_IT_LINK_LABELS) as PostItLinkKind[]).map((kind) => (
                            <SelectItem key={kind} value={kind}>{POST_IT_LINK_LABELS[kind]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {linkKind === 'user' && (
                    <UserSearchCombobox
                        value={person}
                        onSelect={(user) => { setPerson(user); setError(null); }}
                        placeholder="Rechercher une personne…"
                    />
                )}
                {linkKind !== 'none' && linkKind !== 'user' && (
                    <div className="space-y-1">
                        <label htmlFor={ids.number} className="text-sm text-muted-foreground">{NUMBER_LABEL[linkKind]}</label>
                        <Input
                            id={ids.number}
                            inputMode="numeric"
                            value={number}
                            onChange={(e) => { setNumber(e.target.value); setError(null); }}
                            placeholder="Par exemple 812"
                            className="bg-card"
                        />
                    </div>
                )}
                <p className="text-xs text-muted-foreground">Un post-it lié s’ouvre sur la fiche, la demande, l’attribution ou la facture.</p>
            </div>

            {error && (
                <div role="alert" className="rounded-md border border-red-500 bg-red-100 px-4 py-3 text-sm text-red-900 dark:bg-red-900/30 dark:text-red-200">
                    <ApiErrorMessage error={error} action={item ? `Modifier le post-it #${item.id}` : 'Ajouter un post-it'} />
                </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                    Annuler
                </Button>
                <Button type="submit" disabled={saving || !content.trim()}>
                    {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
            </div>
        </form>
    );
}

const FILTER_PARAM: Record<PostItLinkKind, string> = {
    user: 'userId',
    order: 'orderId',
    assignment: 'assignmentId',
    bill: 'billId',
};

/**
 * Les post-its ouverts liés à un dossier, affichés sur ce dossier : la fiche
 * d'une personne, la fenêtre d'une demande, d'une attribution ou d'une facture.
 * C'est ce qui garde une note sur un dossier à côté du dossier, plutôt que sur
 * le seul tableau de bord où l'on ne pense pas à la chercher en l'ouvrant.
 *
 * Rien n'est affiché quand il n'y en a pas — pas de « Aucun post-it » dans
 * chaque fenêtre. On peut les marquer « Fait » d'ici ; le texte se modifie
 * depuis le tableau de bord, et l'on n'en ajoute pas d'ici non plus : ces
 * fenêtres sont des formulaires, et un second formulaire dedans se confondrait
 * avec le premier.
 *
 * `initialItems` quand le serveur les a déjà lus (le dossier) ; sinon ils sont
 * demandés à l'ouverture (les fenêtres d'édition).
 */
export function LinkedPostIts({
    kind,
    id,
    initialItems,
    headingLevel: Heading = 'h3',
    className,
}: {
    kind: PostItLinkKind;
    id: number;
    initialItems?: PostItItem[];
    /** h3 dans une fenêtre, dont le titre est le h2 ; h2 sur le dossier. */
    headingLevel?: 'h2' | 'h3';
    className?: string;
}) {
    const [items, setItems] = useState<PostItItem[]>(initialItems ?? []);
    const [busyId, setBusyId] = useState<number | null>(null);
    const headingId = useId();

    useEffect(() => {
        if (initialItems) return;
        const controller = new AbortController();
        fetch(`/api/post-its?${FILTER_PARAM[kind]}=${id}`, { signal: controller.signal, cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => { if (data) setItems(data.items); })
            .catch(() => { /* une note manquante ne doit pas gêner l'ouverture du dossier */ });
        return () => controller.abort();
    }, [kind, id, initialItems]);

    if (items.length === 0) return null;

    const markDone = async (item: PostItItem) => {
        setBusyId(item.id);
        try {
            await send(`/api/post-its/${item.id}`, { method: 'PATCH', body: JSON.stringify({ done: true }) });
            setItems((current) => current.filter((i) => i.id !== item.id));
            toast({ title: 'Post-it marqué comme fait' });
        } catch (err) {
            toast(apiErrorToast(err, { title: 'Marquer comme fait impossible', action: `Marquer comme fait — post-it #${item.id}` }));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section
            aria-labelledby={headingId}
            className={cn('rounded-lg border border-pink-600 bg-pink-50 px-4 py-3 dark:border-pink-500 dark:bg-pink-900/20', className)}
        >
            <Heading id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <StickyNote className="h-4 w-4 text-pink-700 dark:text-pink-400" aria-hidden="true" />
                {items.length > 1 ? `${items.length} post-its` : 'Post-it'}
            </Heading>
            <ul className="mt-2 divide-y divide-pink-600/30 dark:divide-pink-500/30">
                {items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2">
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{item.content}</p>
                            <p className="text-xs text-muted-foreground">
                                {item.author?.name ?? 'Auteur inconnu'} · {parisDate(new Date(item.createdAt), PERSON_DAY)}
                                {item.remindOn && (
                                    item.due ? (
                                        <> · <span className="font-semibold text-blue-800 dark:text-blue-300">Rappel le {formatDay(item.remindOn)}</span></>
                                    ) : (
                                        <> · Rappel le {formatDay(item.remindOn)}</>
                                    )
                                )}
                            </p>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void markDone(item)}
                            disabled={busyId === item.id}
                            aria-label={`Marquer comme fait : ${excerpt(item.content)}`}
                            className="gap-1.5 bg-card"
                        >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Fait
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
