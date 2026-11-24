'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { GripVertical, Trash2, Pencil, Plus, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { TeamMember, TeamSection } from '@prisma/client';
import { TEAM_SECTION_LABELS, TEAM_SECTION_ORDER } from '@/lib/team-enums';
import { AideLink } from '@/components/ui/admin/AideLink';
import { AdminPageHeader } from "@/components/ui/admin/AdminPageHeader";

// Re-exported under the local names this file already used; the maps themselves
// live in lib/team-enums.ts so the journal des modifications can word a section
// the same way this screen does.
const SECTION_LABELS: Record<TeamSection, string> = TEAM_SECTION_LABELS;
const SECTION_ORDER: TeamSection[] = TEAM_SECTION_ORDER;

type Groups = Record<TeamSection, TeamMember[]>;

function splitGroups(members: TeamMember[]): Groups {
    const groups: Groups = { DIRECTION: [], CONSEIL: [], PERMANENCE: [] };
    for (const m of members) groups[m.section].push(m);
    for (const s of SECTION_ORDER) groups[s].sort((a, b) => a.sortOrder - b.sortOrder);
    return groups;
}

export function TeamManager({ initial }: { initial: TeamMember[] }) {
    const [groups, setGroups] = useState<Groups>(() => splitGroups(initial));
    const [dirty, setDirty] = useState(false);
    // Ce qui tourne : l'ajout, l'ordre, ou un membre (son id) qu'on enregistre ou
    // supprime. Le bouton ou la ligne concernés tournent, les autres attendent.
    const [running, setRunning] = useState<'add' | 'order' | number | null>(null);
    const busy = running !== null;
    // Où l'échec est arrivé : sur la ligne du membre concerné, ou en haut pour
    // l'ajout et l'ordre. En haut seulement, « Suppression impossible »
    // s'affichait loin de la ligne cliquée.
    const [error, setError] = useState<{ at: 'top' | number; message: string } | null>(null);
    const fail = (at: 'top' | number, e: unknown) =>
        setError({ at, message: e instanceof Error ? e.message : 'Erreur' });
    const confirm = useConfirm();

    // Déplacer au clavier (flèches sur la poignée), comme l'ordre des genres
    // des listes de livres (genre-order-dialog.tsx) : le glisser seul laissait
    // l'ordre hors de portée du clavier.
    const [announce, setAnnounce] = useState('');
    const pendingFocus = useRef<number | null>(null);
    useEffect(() => {
        const id = pendingFocus.current;
        if (id === null) return;
        pendingFocus.current = null;
        document.querySelector<HTMLElement>(`[data-member-handle="${id}"]`)?.focus();
    });

    const moveByKey = (section: TeamSection, member: TeamMember, step: -1 | 1) => {
        const list = groups[section];
        const index = list.findIndex((m) => m.id === member.id);
        const target = index + step;
        if (index < 0 || target < 0 || target >= list.length) return;
        const next = [...list];
        [next[index], next[target]] = [next[target], next[index]];
        pendingFocus.current = member.id;
        setGroups((prev) => ({ ...prev, [section]: next }));
        setDirty(true);
        setAnnounce(`« ${member.name} » : ${target + 1}e sur ${list.length}.`);
    };

    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('');
    const [newSection, setNewSection] = useState<TeamSection>('PERMANENCE');

    const total = useMemo(
        () => SECTION_ORDER.reduce((n, s) => n + groups[s].length, 0),
        [groups],
    );

    async function refetch() {
        const res = await fetch('/api/team');
        if (res.ok) {
            const data: TeamMember[] = await res.json();
            setGroups(splitGroups(data));
            setDirty(false);
        }
    }

    async function addMember() {
        if (!newName.trim()) return;
        setRunning('add');
        setError(null);
        try {
            const res = await fetch('/api/team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim(), role: newRole.trim(), section: newSection }),
            });
            if (!res.ok) throw new Error('Ajout impossible');
            setNewName('');
            setNewRole('');
            await refetch();
        } catch (e) {
            fail('top', e);
        } finally {
            setRunning(null);
        }
    }

    async function saveMember(id: number, patch: Partial<Pick<TeamMember, 'name' | 'role' | 'section'>>) {
        setRunning(id);
        setError(null);
        try {
            const res = await fetch(`/api/team/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            if (!res.ok) throw new Error('Modification impossible');
            await refetch();
        } catch (e) {
            fail(id, e);
        } finally {
            setRunning(null);
        }
    }

    async function deleteMember(member: TeamMember) {
        // Comme partout ailleurs dans l'administration : la suppression se
        // confirme, et dit qui. Ici elle retire aussi le nom du site public.
        if (!(await confirm({
            title: `Supprimer « ${member.name} » de l'équipe ?`,
            description: 'Son nom disparaît de la page Équipe du site. Cette action est irréversible.',
            confirmLabel: 'Supprimer',
            destructive: true,
        }))) return;
        const id = member.id;
        setRunning(id);
        setError(null);
        try {
            const res = await fetch(`/api/team/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Suppression impossible');
            await refetch();
        } catch (e) {
            fail(id, e);
        } finally {
            setRunning(null);
        }
    }

    async function saveOrder() {
        setRunning('order');
        setError(null);
        try {
            const items = SECTION_ORDER.flatMap((s) =>
                groups[s].map((m, index) => ({ id: m.id, sortOrder: index })),
            );
            const res = await fetch('/api/team', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            });
            if (!res.ok) throw new Error('Enregistrement de l\u2019ordre impossible');
            await refetch();
        } catch (e) {
            fail('top', e);
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
                            title={`Équipe (${total})`}
                            section="Équipe"
                            aide={<AideLink section="pages-publiques" />}
                            actions={dirty && (
                                <Button onClick={saveOrder} disabled={busy} variant="save">
                                    {running === 'order' && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Enregistrer l&apos;ordre
                                </Button>
                            )}
                        />
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            {/* Libellés pour les lecteurs d'écran : le texte indicatif
                                seul disparaît dès la première lettre tapée. */}
                            <label htmlFor="team-new-name" className="sr-only">Nom</label>
                            <Input id="team-new-name" placeholder="Nom" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-card border-border text-foreground" />
                            <label htmlFor="team-new-role" className="sr-only">Rôle (optionnel)</label>
                            <Input id="team-new-role" placeholder="Rôle (optionnel)" value={newRole} onChange={(e) => setNewRole(e.target.value)} className="bg-card border-border text-foreground" />
                            <Select value={newSection} onValueChange={(v) => setNewSection(v as TeamSection)}>
                                <SelectTrigger aria-label="Rubrique" className="bg-card border-border text-foreground sm:w-64">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    {SECTION_ORDER.map((s) => (
                                        <SelectItem key={s} value={s} className="text-foreground">{SECTION_LABELS[s]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button onClick={addMember} disabled={busy || !newName.trim()} className="bg-muted text-foreground border-border hover:bg-accent">
                                {running === 'add' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Ajouter
                            </Button>
                        </div>
                        {error?.at === 'top' && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}
                        <p className="sr-only" aria-live="polite">{announce}</p>
                    </CardContent>
                </Card>

                {SECTION_ORDER.map((section) => (
                    <Card key={section} className="bg-card border-border">
                        <CardHeader className="border-b border-border">
                            <CardTitle as="h2" className="text-foreground text-lg">{SECTION_LABELS[section]}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {groups[section].length === 0 ? (
                                <p className="text-sm text-muted-foreground">Aucun membre.</p>
                            ) : (
                                <Reorder.Group
                                    axis="y"
                                    values={groups[section]}
                                    onReorder={(next) => {
                                        setGroups((prev) => ({ ...prev, [section]: next }));
                                        setDirty(true);
                                    }}
                                    className="space-y-2"
                                >
                                    {groups[section].map((member, index) => (
                                        <MemberRow
                                            key={member.id}
                                            member={member}
                                            index={index}
                                            busy={busy}
                                            working={running === member.id}
                                            error={error?.at === member.id ? error.message : null}
                                            onSave={saveMember}
                                            onDelete={deleteMember}
                                            onMoveKey={(step) => moveByKey(section, member, step)}
                                        />
                                    ))}
                                </Reorder.Group>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function MemberRow({
    member,
    index,
    busy,
    working,
    error,
    onSave,
    onDelete,
    onMoveKey,
}: {
    member: TeamMember;
    index: number;
    busy: boolean;
    working: boolean;
    error: string | null;
    onSave: (id: number, patch: Partial<Pick<TeamMember, 'name' | 'role' | 'section'>>) => void;
    onDelete: (member: TeamMember) => void;
    onMoveKey: (step: -1 | 1) => void;
}) {
    const controls = useDragControls();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(member.name);
    const [role, setRole] = useState(member.role ?? '');

    return (
        <Reorder.Item
            value={member}
            dragListener={false}
            dragControls={controls}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
        >
            <button
                type="button"
                data-member-handle={member.id}
                onPointerDown={(e) => controls.start(e)}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        onMoveKey(e.key === 'ArrowUp' ? -1 : 1);
                    }
                }}
                className="cursor-grab touch-none rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                aria-label={`Déplacer « ${member.name} », ${index + 1}e (flèches haut et bas)`}
            >
                <GripVertical className="h-5 w-5" aria-hidden="true" />
            </button>

            {editing ? (
                <>
                    <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom" className="bg-card border-border text-foreground h-8" />
                    <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rôle" aria-label="Rôle" className="bg-card border-border text-foreground h-8" />
                    <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => { onSave(member.id, { name: name.trim(), role: role.trim() }); setEditing(false); }}
                        aria-label="Valider"
                    >
                        <Check className="h-4 w-4" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { setName(member.name); setRole(member.role ?? ''); setEditing(false); }}
                        aria-label="Annuler"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </>
            ) : (
                <>
                    <div className="flex-1 min-w-0">
                        <span className="text-foreground font-medium">{member.name}</span>
                        {member.role && <span className="text-muted-foreground ml-2">— {member.role}</span>}
                        {working && <Loader2 className="inline h-4 w-4 ml-2 animate-spin text-muted-foreground" aria-hidden="true" />}
                        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label={`Modifier « ${member.name} »`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={busy} onClick={() => onDelete(member)} aria-label={`Supprimer « ${member.name} »`}>
                        <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                    </Button>
                </>
            )}
        </Reorder.Item>
    );
}
