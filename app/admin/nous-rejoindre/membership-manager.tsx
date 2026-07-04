'use client';

import React, { useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, Trash2, Pencil, Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { IconPicker } from '@/components/admin/IconPicker';
import { ThemePicker } from '@/components/admin/ThemePicker';
import { resolveIcon } from '@/lib/icons';
import type { MembershipOption } from '@prisma/client';

type Draft = {
    iconKey: string; colorTheme: string; title: string; body: string;
    highlightLabel: string; highlightValue: string; bullets: string; ctaLabel: string; ctaHref: string;
};
const EMPTY: Draft = { iconKey: 'Heart', colorTheme: 'blue', title: '', body: '', highlightLabel: '', highlightValue: '', bullets: '', ctaLabel: '', ctaHref: '' };

function toDraft(m: MembershipOption): Draft {
    return {
        iconKey: m.iconKey, colorTheme: m.colorTheme, title: m.title, body: m.body,
        highlightLabel: m.highlightLabel ?? '', highlightValue: m.highlightValue ?? '',
        bullets: m.bullets ?? '', ctaLabel: m.ctaLabel ?? '', ctaHref: m.ctaHref ?? '',
    };
}

export function MembershipManager({ initial }: { initial: MembershipOption[] }) {
    const [items, setItems] = useState<MembershipOption[]>(initial);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState<Draft>(EMPTY);

    async function refetch() {
        const res = await fetch('/api/membership');
        if (res.ok) { setItems(await res.json()); setDirty(false); }
    }

    async function submit(method: 'POST' | 'PUT', url: string, payload: Draft) {
        setBusy(true); setError(null);
        try {
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur');
            await refetch();
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur');
            return false;
        } finally { setBusy(false); }
    }

    async function remove(id: number) {
        setBusy(true);
        try { await fetch(`/api/membership/${id}`, { method: 'DELETE' }); await refetch(); }
        finally { setBusy(false); }
    }

    async function saveOrder() {
        setBusy(true); setError(null);
        try {
            const payload = items.map((it, index) => ({ id: it.id, sortOrder: index }));
            const res = await fetch('/api/membership', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: payload }) });
            if (!res.ok) throw new Error('Enregistrement de l\u2019ordre impossible');
            await refetch();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur');
        } finally { setBusy(false); }
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto py-8 space-y-6">
                <Card className="bg-card border-border">
                    <CardHeader className="border-b border-border flex flex-row items-center justify-between">
                        <CardTitle className="text-foreground">Nous rejoindre ({items.length})</CardTitle>
                        <div className="flex gap-2">
                            {dirty && <Button onClick={saveOrder} disabled={busy} className="bg-blue-600 text-white hover:bg-blue-700">Enregistrer l&apos;ordre</Button>}
                            <Button onClick={() => { setAdding(true); setEditingId(null); setDraft(EMPTY); }} className="bg-muted text-foreground border-border hover:bg-muted">
                                <Plus className="h-4 w-4 mr-1" /> Ajouter
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                        {adding && (
                            <MembershipForm draft={draft} setDraft={setDraft} busy={busy}
                                            onCancel={() => setAdding(false)}
                                            onSave={async () => { if (await submit('POST', '/api/membership', draft)) setAdding(false); }} />
                        )}

                        <Reorder.Group axis="y" values={items} onReorder={(next) => { setItems(next); setDirty(true); }} className="space-y-2">
                            {items.map((item) => (
                                <Row key={item.id} item={item} editing={editingId === item.id} busy={busy}
                                     draft={draft} setDraft={setDraft}
                                     onEdit={() => { setEditingId(item.id); setAdding(false); setDraft(toDraft(item)); }}
                                     onCancel={() => setEditingId(null)}
                                     onSave={async () => { if (await submit('PUT', `/api/membership/${item.id}`, draft)) setEditingId(null); }}
                                     onDelete={() => remove(item.id)} />
                            ))}
                        </Reorder.Group>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function Row({ item, editing, busy, draft, setDraft, onEdit, onCancel, onSave, onDelete }: {
    item: MembershipOption; editing: boolean; busy: boolean;
    draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>;
    onEdit: () => void; onCancel: () => void; onSave: () => void; onDelete: () => void;
}) {
    const controls = useDragControls();
    return (
        <Reorder.Item value={item} dragListener={false} dragControls={controls} className="rounded-lg border border-border bg-background">
            {editing ? (
                <div className="p-3"><MembershipForm draft={draft} setDraft={setDraft} busy={busy} onCancel={onCancel} onSave={onSave} /></div>
            ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none text-muted-foreground hover:text-foreground" aria-label="Déplacer">
                        <GripVertical className="h-5 w-5" />
                    </button>
                    {React.createElement(resolveIcon(item.iconKey), { className: 'h-5 w-5 text-muted-foreground shrink-0' })}
                    <span className="flex-1 min-w-0 text-foreground font-medium truncate">{item.title}</span>
                    <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Modifier"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" disabled={busy} onClick={onDelete} aria-label="Supprimer"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
            )}
        </Reorder.Item>
    );
}

function MembershipForm({ draft, setDraft, busy, onSave, onCancel }: {
    draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>;
    busy: boolean; onSave: () => void; onCancel: () => void;
}) {
    const field = 'bg-card border-border text-foreground';
    const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
    return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="sm:w-48"><IconPicker value={draft.iconKey} onChange={(v) => setDraft((d) => ({ ...d, iconKey: v }))} /></div>
                <div className="sm:w-40"><ThemePicker value={draft.colorTheme} onChange={(v) => setDraft((d) => ({ ...d, colorTheme: v }))} /></div>
                <Input placeholder="Titre" value={draft.title} onChange={set('title')} className={`${field} flex-1`} />
            </div>
            <Textarea placeholder="Texte (markdown)" value={draft.body} onChange={set('body')} className={`${field} min-h-28 font-mono text-sm`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Encadré — libellé (ex. Cotisation annuelle)" value={draft.highlightLabel} onChange={set('highlightLabel')} className={field} />
                <Input placeholder="Encadré — valeur (ex. 50€)" value={draft.highlightValue} onChange={set('highlightValue')} className={field} />
            </div>
            <Textarea placeholder="Puces (une par ligne)" value={draft.bullets} onChange={set('bullets')} className={`${field} min-h-20`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Bouton — libellé (optionnel)" value={draft.ctaLabel} onChange={set('ctaLabel')} className={field} />
                <Input placeholder="Bouton — lien (ex. /faire-un-don)" value={draft.ctaHref} onChange={set('ctaHref')} className={field} />
            </div>
            <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4 mr-1" /> Annuler</Button>
                <Button size="sm" disabled={busy} onClick={onSave} className="bg-blue-600 text-white hover:bg-blue-700"><Check className="h-4 w-4 mr-1" /> Enregistrer</Button>
            </div>
        </div>
    );
}