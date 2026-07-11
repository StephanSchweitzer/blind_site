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
import type { PracticalInfo } from '@prisma/client';

type Draft = { iconKey: string; colorTheme: string; question: string; body: string };
const EMPTY: Draft = { iconKey: 'BookMarked', colorTheme: 'blue', question: '', body: '' };

export function PracticalInfoManager({ initial }: { initial: PracticalInfo[] }) {
    const [items, setItems] = useState<PracticalInfo[]>(initial);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState<Draft>(EMPTY);

    async function refetch() {
        const res = await fetch('/api/practical-info');
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
        try { await fetch(`/api/practical-info/${id}`, { method: 'DELETE' }); await refetch(); }
        finally { setBusy(false); }
    }

    async function saveOrder() {
        setBusy(true); setError(null);
        try {
            const payload = items.map((it, index) => ({ id: it.id, sortOrder: index }));
            const res = await fetch('/api/practical-info', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: payload }) });
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
                    <CardHeader className="border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-foreground">Informations pratiques ({items.length})</CardTitle>
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
                            <InfoForm draft={draft} setDraft={setDraft} busy={busy}
                                      onCancel={() => setAdding(false)}
                                      onSave={async () => { if (await submit('POST', '/api/practical-info', draft)) setAdding(false); }} />
                        )}

                        <Reorder.Group axis="y" values={items} onReorder={(next) => { setItems(next); setDirty(true); }} className="space-y-2">
                            {items.map((item) => (
                                <Row key={item.id} item={item} editing={editingId === item.id} busy={busy}
                                     draft={draft} setDraft={setDraft}
                                     onEdit={() => { setEditingId(item.id); setAdding(false); setDraft({ iconKey: item.iconKey, colorTheme: item.colorTheme, question: item.question, body: item.body }); }}
                                     onCancel={() => setEditingId(null)}
                                     onSave={async () => { if (await submit('PUT', `/api/practical-info/${item.id}`, draft)) setEditingId(null); }}
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
    item: PracticalInfo; editing: boolean; busy: boolean;
    draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>;
    onEdit: () => void; onCancel: () => void; onSave: () => void; onDelete: () => void;
}) {
    const controls = useDragControls();
    return (
        <Reorder.Item value={item} dragListener={false} dragControls={controls} className="rounded-lg border border-border bg-background">
            {editing ? (
                <div className="p-3"><InfoForm draft={draft} setDraft={setDraft} busy={busy} onCancel={onCancel} onSave={onSave} /></div>
            ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none text-muted-foreground hover:text-foreground" aria-label="Déplacer">
                        <GripVertical className="h-5 w-5" />
                    </button>
                    {React.createElement(resolveIcon(item.iconKey), { className: 'h-5 w-5 text-muted-foreground shrink-0' })}
                    <span className="flex-1 min-w-0 text-foreground font-medium line-clamp-2 break-words">{item.question}</span>
                    <Button size="icon" variant="ghost" className="size-8 sm:size-10 shrink-0" onClick={onEdit} aria-label="Modifier"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8 sm:size-10 shrink-0" disabled={busy} onClick={onDelete} aria-label="Supprimer"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
            )}
        </Reorder.Item>
    );
}

function InfoForm({ draft, setDraft, busy, onSave, onCancel }: {
    draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>;
    busy: boolean; onSave: () => void; onCancel: () => void;
}) {
    const field = 'bg-card border-border text-foreground';
    return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="sm:w-48"><IconPicker value={draft.iconKey} onChange={(v) => setDraft((d) => ({ ...d, iconKey: v }))} /></div>
                <div className="sm:w-40"><ThemePicker value={draft.colorTheme} onChange={(v) => setDraft((d) => ({ ...d, colorTheme: v }))} /></div>
                <Input placeholder="Question" value={draft.question} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} className={`${field} flex-1`} />
            </div>
            <Textarea placeholder="Réponse (markdown : **gras**, [lien](url), listes)" value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} className={`${field} min-h-40 font-mono text-sm`} />
            <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4 mr-1" /> Annuler</Button>
                <Button size="sm" disabled={busy} onClick={onSave} className="bg-blue-600 text-white hover:bg-blue-700"><Check className="h-4 w-4 mr-1" /> Enregistrer</Button>
            </div>
        </div>
    );
}