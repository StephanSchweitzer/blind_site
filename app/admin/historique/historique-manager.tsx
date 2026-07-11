'use client';

import React, { useState } from 'react';
import { Trash2, Pencil, Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { IconPicker } from '@/components/admin/IconPicker';
import { resolveIcon } from '@/lib/icons';
import type { HistoryEvent } from '@prisma/client';

type Draft = { year: string; title: string; description: string; iconKey: string };

export function HistoriqueManager({ initial }: { initial: HistoryEvent[] }) {
    const [events, setEvents] = useState<HistoryEvent[]>(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState<Draft>({ year: '', title: '', description: '', iconKey: 'Calendar' });

    async function refetch() {
        const res = await fetch('/api/historique');
        if (res.ok) setEvents(await res.json());
    }

    async function submit(method: 'POST' | 'PUT', url: string, payload: Draft) {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur');
            await refetch();
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur');
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: number) {
        setBusy(true);
        try {
            await fetch(`/api/historique/${id}`, { method: 'DELETE' });
            await refetch();
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto py-8 space-y-6">
                <Card className="bg-card border-border">
                    <CardHeader className="border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-foreground">Historique ({events.length})</CardTitle>
                        <Button onClick={() => { setAdding(true); setDraft({ year: '', title: '', description: '', iconKey: 'Calendar' }); }} className="bg-muted text-foreground border-border hover:bg-muted">
                            <Plus className="h-4 w-4 mr-1" /> Ajouter
                        </Button>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                        {adding && (
                            <EventForm
                                draft={draft}
                                setDraft={setDraft}
                                busy={busy}
                                onCancel={() => setAdding(false)}
                                onSave={async () => { if (await submit('POST', '/api/historique', draft)) setAdding(false); }}
                            />
                        )}

                        {events.map((ev) => {
                            const Icon = resolveIcon(ev.iconKey);
                            if (editingId === ev.id) {
                                return (
                                    <EventForm
                                        key={ev.id}
                                        draft={draft}
                                        setDraft={setDraft}
                                        busy={busy}
                                        onCancel={() => setEditingId(null)}
                                        onSave={async () => { if (await submit('PUT', `/api/historique/${ev.id}`, draft)) setEditingId(null); }}
                                    />
                                );
                            }
                            return (
                                <div key={ev.id} className="flex items-center gap-2 sm:gap-3 rounded-lg border border-border bg-background px-3 py-2">
                                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                                    <span className="font-mono text-sm text-muted-foreground w-auto sm:w-14 shrink-0">{ev.year}</span>
                                    <span className="flex-1 min-w-0 text-foreground font-medium line-clamp-2 break-words">{ev.title}</span>
                                    <Button size="icon" variant="ghost" className="size-8 sm:size-10 shrink-0" onClick={() => { setEditingId(ev.id); setAdding(false); setDraft({ year: String(ev.year), title: ev.title, description: ev.description, iconKey: ev.iconKey }); }} aria-label="Modifier">
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="size-8 sm:size-10 shrink-0" disabled={busy} onClick={() => remove(ev.id)} aria-label="Supprimer">
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function EventForm({ draft, setDraft, busy, onSave, onCancel }: {
    draft: Draft;
    setDraft: React.Dispatch<React.SetStateAction<Draft>>;
    busy: boolean;
    onSave: () => void;
    onCancel: () => void;
}) {
    const field = 'bg-card border-border text-foreground';
    return (
        <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
                <Input type="number" placeholder="Année" value={draft.year} onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))} className={`${field} sm:w-28`} />
                <div className="sm:w-48"><IconPicker value={draft.iconKey} onChange={(v) => setDraft((d) => ({ ...d, iconKey: v }))} /></div>
                <Input placeholder="Titre" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={`${field} flex-1`} />
            </div>
            <Textarea placeholder="Description" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className={`${field} min-h-24`} />
            <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4 mr-1" /> Annuler</Button>
                <Button size="sm" disabled={busy} onClick={onSave} className="bg-blue-600 text-white hover:bg-blue-700"><Check className="h-4 w-4 mr-1" /> Enregistrer</Button>
            </div>
        </div>
    );
}
