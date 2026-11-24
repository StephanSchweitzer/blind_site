'use client';

import React, { useState } from 'react';
import { Trash2, Pencil, Plus, Check, X, Loader2 } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { IconPicker } from '@/components/admin/IconPicker';
import { resolveIcon } from '@/lib/icons';
import type { HistoryEvent } from '@prisma/client';
import { AideLink } from '@/components/ui/admin/AideLink';
import { AdminPageHeader } from "@/components/ui/admin/AdminPageHeader";

type Draft = { year: string; title: string; description: string; iconKey: string };

export function HistoriqueManager({ initial }: { initial: HistoryEvent[] }) {
    const [events, setEvents] = useState<HistoryEvent[]>(initial);
    // Ce qui tourne : l'enregistrement du formulaire ouvert, ou la suppression
    // d'un événement (son id). Le bouton cliqué tourne, les autres attendent.
    const [running, setRunning] = useState<'save' | number | null>(null);
    const busy = running !== null;
    // Où l'échec est arrivé : sur la ligne concernée, ou en haut (ajout).
    const [error, setError] = useState<{ at: 'top' | number; message: string } | null>(null);
    const fail = (at: 'top' | number, e: unknown, fallback: string) =>
        setError({ at, message: e instanceof Error && e.message ? e.message : fallback });
    const confirm = useConfirm();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState<Draft>({ year: '', title: '', description: '', iconKey: 'Calendar' });

    async function refetch() {
        const res = await fetch('/api/historique');
        if (res.ok) setEvents(await res.json());
    }

    async function submit(method: 'POST' | 'PUT', url: string, payload: Draft, at: 'top' | number) {
        setRunning('save');
        setError(null);
        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Enregistrement impossible');
            await refetch();
            return true;
        } catch (e) {
            fail(at, e, 'Enregistrement impossible');
            return false;
        } finally {
            setRunning(null);
        }
    }

    async function remove(ev: HistoryEvent) {
        // Comme partout ailleurs dans l'administration : la suppression se
        // confirme, et dit laquelle. Elle retire aussi l'événement du site.
        if (!(await confirm({
            title: `Supprimer « ${ev.year} — ${ev.title} » ?`,
            description: "L'événement disparaît de la page Historique du site. Cette action est irréversible.",
            confirmLabel: 'Supprimer',
            destructive: true,
        }))) return;
        setRunning(ev.id);
        setError(null);
        try {
            // La réponse n'était pas lue : un refus passait sans un mot.
            const res = await fetch(`/api/historique/${ev.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Suppression impossible');
            await refetch();
        } catch (e) {
            fail(ev.id, e, 'Suppression impossible');
        } finally {
            setRunning(null);
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="py-8 space-y-6">
                <Card className="bg-card border-border">
                    <CardHeader className="border-b border-border">
                        <AdminPageHeader
                            title={`Historique (${events.length})`}
                            section="Historique"
                            aide={<AideLink section="pages-publiques" />}
                            actions={
                                <Button onClick={() => { setAdding(true); setDraft({ year: '', title: '', description: '', iconKey: 'Calendar' }); }} className="bg-muted text-foreground border-border hover:bg-accent">
                                    <Plus className="h-4 w-4 mr-1" /> Ajouter
                                </Button>
                            }
                        />
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        {error?.at === 'top' && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}

                        {adding && (
                            <EventForm
                                draft={draft}
                                setDraft={setDraft}
                                busy={busy}
                                saving={running === 'save'}
                                onCancel={() => setAdding(false)}
                                onSave={async () => { if (await submit('POST', '/api/historique', draft, 'top')) setAdding(false); }}
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
                                        saving={running === 'save'}
                                        onCancel={() => setEditingId(null)}
                                        onSave={async () => { if (await submit('PUT', `/api/historique/${ev.id}`, draft, ev.id)) setEditingId(null); }}
                                    />
                                );
                            }
                            return (
                                <div key={ev.id} className="rounded-lg border border-border bg-background">
                                    <div className="flex items-center gap-2 sm:gap-3 px-3 py-2">
                                        <Icon className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
                                        <span className="font-mono text-sm text-muted-foreground w-auto sm:w-14 shrink-0">{ev.year}</span>
                                        <span className="flex-1 min-w-0 text-foreground font-medium line-clamp-2 break-words">{ev.title}</span>
                                        <Button size="icon" variant="ghost" className="size-8 sm:size-10 shrink-0" onClick={() => { setEditingId(ev.id); setAdding(false); setDraft({ year: String(ev.year), title: ev.title, description: ev.description, iconKey: ev.iconKey }); }} aria-label={`Modifier « ${ev.year} — ${ev.title} »`}>
                                            <Pencil className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="size-8 sm:size-10 shrink-0" disabled={busy} onClick={() => remove(ev)} aria-label={`Supprimer « ${ev.year} — ${ev.title} »`}>
                                            {running === ev.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />}
                                        </Button>
                                    </div>
                                    {error?.at === ev.id && <p role="alert" className="px-3 pb-2 text-sm text-red-600 dark:text-red-400">{error.message}</p>}
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function EventForm({ draft, setDraft, busy, saving, onSave, onCancel }: {
    draft: Draft;
    setDraft: React.Dispatch<React.SetStateAction<Draft>>;
    busy: boolean;
    saving: boolean;
    onSave: () => void;
    onCancel: () => void;
}) {
    const field = 'bg-card border-border text-foreground';
    return (
        <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
                <Input type="number" placeholder="Année" aria-label="Année" value={draft.year} onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))} className={`${field} sm:w-28`} />
                <div className="sm:w-48"><IconPicker value={draft.iconKey} onChange={(v) => setDraft((d) => ({ ...d, iconKey: v }))} /></div>
                <Input placeholder="Titre" aria-label="Titre" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={`${field} flex-1`} />
            </div>
            <Textarea placeholder="Description" aria-label="Description" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className={`${field} min-h-24`} />
            <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4 mr-1" /> Annuler</Button>
                <Button size="sm" disabled={busy} onClick={onSave} variant="save">{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Enregistrer</Button>
            </div>
        </div>
    );
}
