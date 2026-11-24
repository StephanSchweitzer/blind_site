'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { GripVertical, Trash2, Pencil, Plus, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { IconPicker } from '@/components/admin/IconPicker';
import { ThemePicker } from '@/components/admin/ThemePicker';
import { resolveIcon } from '@/lib/icons';
import type { PracticalInfo } from '@prisma/client';
import { AideLink } from '@/components/ui/admin/AideLink';

type Draft = { iconKey: string; colorTheme: string; question: string; body: string };
const EMPTY: Draft = { iconKey: 'BookMarked', colorTheme: 'blue', question: '', body: '' };

export function PracticalInfoManager({ initial }: { initial: PracticalInfo[] }) {
    const [items, setItems] = useState<PracticalInfo[]>(initial);
    const [dirty, setDirty] = useState(false);
    // Ce qui tourne : l'enregistrement du formulaire ouvert, celui de l'ordre, ou
    // la suppression de une question (son id). Le bouton cliqué tourne, les autres attendent.
    const [running, setRunning] = useState<'save' | 'order' | number | null>(null);
    const busy = running !== null;
    // Où l'échec est arrivé : sur la ligne concernée, ou en haut (ajout, ordre).
    const [error, setError] = useState<{ at: 'top' | number; message: string } | null>(null);
    const fail = (at: 'top' | number, e: unknown, fallback: string) =>
        setError({ at, message: e instanceof Error && e.message ? e.message : fallback });
    const [editingId, setEditingId] = useState<number | null>(null);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState<Draft>(EMPTY);
    const confirm = useConfirm();

    // Déplacer au clavier (flèches sur la poignée), comme l'ordre des genres
    // des listes de livres (genre-order-dialog.tsx).
    const [announce, setAnnounce] = useState('');
    const pendingFocus = useRef<number | null>(null);
    useEffect(() => {
        const id = pendingFocus.current;
        if (id === null) return;
        pendingFocus.current = null;
        document.querySelector<HTMLElement>(`[data-row-handle="${id}"]`)?.focus();
    });

    const moveByKey = (item: PracticalInfo, step: -1 | 1) => {
        const index = items.findIndex((it) => it.id === item.id);
        const target = index + step;
        if (index < 0 || target < 0 || target >= items.length) return;
        const next = [...items];
        [next[index], next[target]] = [next[target], next[index]];
        pendingFocus.current = item.id;
        setItems(next);
        setDirty(true);
        setAnnounce(`« ${item.question} » : ${target + 1}e sur ${items.length}.`);
    };

    async function refetch() {
        const res = await fetch('/api/practical-info');
        if (res.ok) { setItems(await res.json()); setDirty(false); }
    }

    async function submit(method: 'POST' | 'PUT', url: string, payload: Draft, at: 'top' | number) {
        setRunning('save'); setError(null);
        try {
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Enregistrement impossible');
            await refetch();
            return true;
        } catch (e) {
            fail(at, e, 'Enregistrement impossible');
            return false;
        } finally { setRunning(null); }
    }

    async function remove(item: PracticalInfo) {
        // Comme partout ailleurs dans l'administration : la suppression se
        // confirme, et dit laquelle. Elle retire aussi la question du site.
        if (!(await confirm({
            title: `Supprimer « ${item.question} » ?`,
            description: 'La question disparaît de la page Informations pratiques du site. Cette action est irréversible.',
            confirmLabel: 'Supprimer',
            destructive: true,
        }))) return;
        setRunning(item.id); setError(null);
        try {
            // La réponse n'était pas lue : un refus passait sans un mot.
            const res = await fetch(`/api/practical-info/${item.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Suppression impossible');
            await refetch();
        } catch (e) {
            fail(item.id, e, 'Suppression impossible');
        } finally { setRunning(null); }
    }

    async function saveOrder() {
        setRunning('order'); setError(null);
        try {
            const payload = items.map((it, index) => ({ id: it.id, sortOrder: index }));
            const res = await fetch('/api/practical-info', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: payload }) });
            if (!res.ok) throw new Error('Enregistrement de l\u2019ordre impossible');
            await refetch();
        } catch (e) {
            fail('top', e, 'Enregistrement de l\u2019ordre impossible');
        } finally { setRunning(null); }
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="py-8 space-y-6">
                <Card className="bg-card border-border">
                    <CardHeader className="border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle as="h1" className="text-foreground">Informations pratiques ({items.length})</CardTitle>
                            <AideLink section="pages-publiques" />
                        </div>
                        <div className="flex gap-2">
                            {dirty && <Button onClick={saveOrder} disabled={busy} variant="save">{running === 'order' && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer l&apos;ordre</Button>}
                            <Button onClick={() => { setAdding(true); setEditingId(null); setDraft(EMPTY); }} className="bg-muted text-foreground border-border hover:bg-accent">
                                <Plus className="h-4 w-4 mr-1" /> Ajouter
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        {error?.at === 'top' && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}
                        <p className="sr-only" aria-live="polite">{announce}</p>

                        {adding && (
                            <InfoForm draft={draft} setDraft={setDraft} busy={busy} saving={running === 'save'}
                                      onCancel={() => setAdding(false)}
                                      onSave={async () => { if (await submit('POST', '/api/practical-info', draft, 'top')) setAdding(false); }} />
                        )}

                        <Reorder.Group axis="y" values={items} onReorder={(next) => { setItems(next); setDirty(true); }} className="space-y-2">
                            {items.map((item, index) => (
                                <Row key={item.id} item={item} index={index} editing={editingId === item.id} busy={busy}
                                     saving={running === 'save'} deleting={running === item.id}
                                     error={error?.at === item.id ? error.message : null}
                                     draft={draft} setDraft={setDraft}
                                     onEdit={() => { setEditingId(item.id); setAdding(false); setDraft({ iconKey: item.iconKey, colorTheme: item.colorTheme, question: item.question, body: item.body }); }}
                                     onCancel={() => setEditingId(null)}
                                     onSave={async () => { if (await submit('PUT', `/api/practical-info/${item.id}`, draft, item.id)) setEditingId(null); }}
                                     onDelete={() => remove(item)}
                                     onMoveKey={(step) => moveByKey(item, step)} />
                            ))}
                        </Reorder.Group>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function Row({ item, index, editing, busy, saving, deleting, error, draft, setDraft, onEdit, onCancel, onSave, onDelete, onMoveKey }: {
    item: PracticalInfo; index: number; editing: boolean; busy: boolean; saving: boolean; deleting: boolean;
    error: string | null;
    draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>;
    onEdit: () => void; onCancel: () => void; onSave: () => void; onDelete: () => void;
    onMoveKey: (step: -1 | 1) => void;
}) {
    const controls = useDragControls();
    const errorLine = error && <p role="alert" className="px-3 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>;
    return (
        <Reorder.Item value={item} dragListener={false} dragControls={controls} className="rounded-lg border border-border bg-background">
            {editing ? (
                <div className="p-3"><InfoForm draft={draft} setDraft={setDraft} busy={busy} saving={saving} onCancel={onCancel} onSave={onSave} /></div>
            ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                    <button
                        type="button"
                        data-row-handle={item.id}
                        onPointerDown={(e) => controls.start(e)}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                onMoveKey(e.key === 'ArrowUp' ? -1 : 1);
                            }
                        }}
                        className="cursor-grab touch-none rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        aria-label={`Déplacer « ${item.question} », ${index + 1}e (flèches haut et bas)`}
                    >
                        <GripVertical className="h-5 w-5" aria-hidden="true" />
                    </button>
                    {React.createElement(resolveIcon(item.iconKey), { className: 'h-5 w-5 text-muted-foreground shrink-0', 'aria-hidden': true })}
                    <span className="flex-1 min-w-0 text-foreground font-medium line-clamp-2 break-words">{item.question}</span>
                    <Button size="icon" variant="ghost" className="size-8 sm:size-10 shrink-0" onClick={onEdit} aria-label={`Modifier « ${item.question} »`}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
                    <Button size="icon" variant="ghost" className="size-8 sm:size-10 shrink-0" disabled={busy} onClick={onDelete} aria-label={`Supprimer « ${item.question} »`}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />}</Button>
                </div>
            )}
            {errorLine}
        </Reorder.Item>
    );
}

function InfoForm({ draft, setDraft, busy, saving, onSave, onCancel }: {
    draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>;
    busy: boolean; saving: boolean; onSave: () => void; onCancel: () => void;
}) {
    const field = 'bg-card border-border text-foreground';
    return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="sm:w-48"><IconPicker value={draft.iconKey} onChange={(v) => setDraft((d) => ({ ...d, iconKey: v }))} /></div>
                <div className="sm:w-40"><ThemePicker value={draft.colorTheme} onChange={(v) => setDraft((d) => ({ ...d, colorTheme: v }))} /></div>
                <Input placeholder="Question" aria-label="Question" value={draft.question} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} className={`${field} flex-1`} />
            </div>
            <Textarea placeholder="Réponse (markdown : **gras**, [lien](url), listes)" aria-label="Réponse" value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} className={`${field} min-h-40 font-mono text-sm`} />
            <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4 mr-1" /> Annuler</Button>
                <Button size="sm" disabled={busy} onClick={onSave} variant="save">{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Enregistrer</Button>
            </div>
        </div>
    );
}