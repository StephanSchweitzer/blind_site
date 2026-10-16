'use client';

import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { SECTION_ICONS, sectionAccent } from '@/components/admin/section-icons';
import { DashboardStatusList, type DashboardStatusRow } from './AdminDashboardCard';

/** One list in the band. `one` / `many` name what it counts, for the folded line. */
export type DashboardTodoGroup = { title: string; one: string; many: string; rows: DashboardStatusRow[] };

const OPEN_KEY = 'eca.dashboard.aTraiter.open';
const countFormat = new Intl.NumberFormat('fr-FR');

/**
 * « À traiter » — what is waiting on the demandes, attributions and factures,
 * each line opening its list already filtered.
 *
 * Folded by default, at the team's request: the cards below are how
 * permanents find their way around, and the band must not push them down.
 * Folded, it still says how much is waiting, list by list (« 177 demandes ·
 * 146 attributions · 169 factures »). A first version named only the lists,
 * which read the same every day — something is always waiting somewhere — and
 * gave nobody a reason to open it.
 *
 * Only lines someone can act on come here: not « À jour » (nothing waiting),
 * not the neutral « Duplications après enregistrement » (waiting on a
 * recording; the Demandes « Type » filter still lists them).
 *
 * Whoever leaves it open finds it open again (per browser — a convenience,
 * nothing depends on it, so a blocked storage just means « folded »). A native
 * <details>: keyboard and screen readers get a disclosure for free. The
 * remembered state is applied to the element after mount, not through React
 * state — the server renders it folded either way, and setState in an effect
 * is what react-hooks/set-state-in-effect forbids.
 *
 * The list names inside are plain text, not headings: they sat in the page's
 * heading outline before its first section, and inside a folded band. They
 * are drawn as a bar in the list's own colour, with its icon — the same as its
 * card below — so they read as « Demandes », « Factures »… and not as one
 * more line: grey small capitals on a grey wash blended into the rows.
 */
export function DashboardTodoBand({ groups }: { groups: DashboardTodoGroup[] }) {
    const ref = useRef<HTMLDetailsElement>(null);
    const waiting = groups
        .map((group) => {
            const rows = group.rows.filter((row) => row.tone === 'warning' || row.tone === 'todo');
            return { ...group, rows, total: rows.reduce((sum, row) => sum + row.count, 0) };
        })
        .filter((group) => group.total > 0);

    useEffect(() => {
        try {
            if (ref.current && window.localStorage.getItem(OPEN_KEY) === '1') ref.current.open = true;
        } catch {
            /* storage unavailable: stays folded */
        }
    }, []);

    const remember = () => {
        try {
            window.localStorage.setItem(OPEN_KEY, ref.current?.open ? '1' : '0');
        } catch {
            /* storage unavailable: nothing to remember */
        }
    };

    if (waiting.length === 0) {
        return (
            <p className="rounded-lg border border-border bg-card px-5 py-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">À traiter</span> · Tout est à jour
            </p>
        );
    }

    return (
        <details ref={ref} onToggle={remember} className="group overflow-hidden rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>
                    <span className="font-semibold text-foreground">À traiter</span>
                    {waiting.map((group) => (
                        <span key={group.title} className="text-muted-foreground">
                            {' · '}
                            <span className="font-semibold tabular-nums text-foreground">{countFormat.format(group.total)}</span>
                            {' '}{group.total > 1 ? group.many : group.one}
                        </span>
                    ))}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="-mb-px">
                {waiting.map((group) => {
                    const colors = sectionAccent(group.title);
                    const Icon = SECTION_ICONS[group.title];
                    return (
                        <div key={group.title} role="group" aria-label={group.title}>
                            <p
                                aria-hidden="true"
                                className={`flex items-center gap-2 border-y px-5 py-2 text-sm font-bold ${colors.bg} ${colors.border} ${colors.text}`}
                            >
                                {Icon && <Icon className="h-4 w-4" />}
                                {group.title}
                            </p>
                            <DashboardStatusList rows={group.rows} />
                        </div>
                    );
                })}
            </div>
        </details>
    );
}
