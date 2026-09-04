'use client';

import React, { useMemo, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, Trash2, Pencil, Plus, Check, X } from 'lucide-react';
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
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
        setBusy(true);
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
            setError(e instanceof Error ? e.message : 'Erreur');
        } finally {
            setBusy(false);
        }
    }

    async function saveMember(id: number, patch: Partial<Pick<TeamMember, 'name' | 'role' | 'section'>>) {
        setBusy(true);
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
            setError(e instanceof Error ? e.message : 'Erreur');
        } finally {
            setBusy(false);
        }
    }

    async function deleteMember(id: number) {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/team/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Suppression impossible');
            await refetch();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur');
        } finally {
            setBusy(false);
        }
    }

    async function saveOrder() {
        setBusy(true);
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
            setError(e instanceof Error ? e.message : 'Erreur');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto py-8 space-y-6">
                <Card className="bg-card border-border">
                    <CardHeader className="border-b border-border flex flex-row items-center justify-between">
                        <CardTitle className="text-foreground">Équipe ({total})</CardTitle>
                        {dirty && (
                            <Button onClick={saveOrder} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
                                Enregistrer l&apos;ordre
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input placeholder="Nom" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-card border-border text-foreground" />
                            <Input placeholder="Rôle (optionnel)" value={newRole} onChange={(e) => setNewRole(e.target.value)} className="bg-card border-border text-foreground" />
                            <Select value={newSection} onValueChange={(v) => setNewSection(v as TeamSection)}>
                                <SelectTrigger className="bg-card border-border text-foreground sm:w-64">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    {SECTION_ORDER.map((s) => (
                                        <SelectItem key={s} value={s} className="text-foreground">{SECTION_LABELS[s]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button onClick={addMember} disabled={busy || !newName.trim()} className="bg-muted text-foreground border-border hover:bg-muted">
                                <Plus className="h-4 w-4 mr-1" /> Ajouter
                            </Button>
                        </div>
                        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    </CardContent>
                </Card>

                {SECTION_ORDER.map((section) => (
                    <Card key={section} className="bg-card border-border">
                        <CardHeader className="border-b border-border">
                            <CardTitle className="text-foreground text-lg">{SECTION_LABELS[section]}</CardTitle>
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
                                    {groups[section].map((member) => (
                                        <MemberRow
                                            key={member.id}
                                            member={member}
                                            busy={busy}
                                            onSave={saveMember}
                                            onDelete={deleteMember}
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
    busy,
    onSave,
    onDelete,
}: {
    member: TeamMember;
    busy: boolean;
    onSave: (id: number, patch: Partial<Pick<TeamMember, 'name' | 'role' | 'section'>>) => void;
    onDelete: (id: number) => void;
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
                onPointerDown={(e) => controls.start(e)}
                className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
                aria-label="Déplacer"
            >
                <GripVertical className="h-5 w-5" />
            </button>

            {editing ? (
                <>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-card border-border text-foreground h-8" />
                    <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rôle" className="bg-card border-border text-foreground h-8" />
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
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label="Modifier">
                        <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={busy} onClick={() => onDelete(member.id)} aria-label="Supprimer">
                        <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                </>
            )}
        </Reorder.Item>
    );
}
