'use client';

import { ArrowRight, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RescueRow, RescueSuggestion } from '@/lib/search-suggestion-types';

/** What the list holds, for the sentences: « cette demande », « 3 demandes ». */
export interface RescueUnit {
    one: string;
    many: string;
    feminine?: boolean;
}

interface SearchRescueProps<K extends string, R extends RescueRow> {
    suggestions: RescueSuggestion<R, K>[] | null | undefined;
    unit: RescueUnit;
    /** Run the proposal: lift its filters or change scope, put its query in the box, search. */
    onApply: (suggestion: RescueSuggestion<R, K>) => void;
    /**
     * Open one object directly (its edit dialogue). Without it the rows are
     * shown, not clickable. `R` can carry what the page needs to open it.
     */
    onOpenRow?: (row: R, suggestion: RescueSuggestion<R, K>) => void;
    /** Names the lifted filters when the page, not the server, knows their words. */
    filterLabel?: (key: K) => string;
    /** Names a scope (a tab) when the page, not the server, knows its words. */
    scopeLabel?: (scope: string) => string;
    /**
     * Whether a correction's `total` is what its search will list. False on
     * the catalogue, which counts corrections on titles and authors but whose
     * list also searches descriptions — it then offers no number.
     */
    exactCorrectionCounts?: boolean;
    /** Tighter layout for the picker popovers. */
    compact?: boolean;
    className?: string;
}

const quoted = (labels: string[]) => labels.map((l) => `« ${l} »`).join(' et ');

function counted(n: number, unit: RescueUnit) {
    return `${n} ${n > 1 ? unit.many : unit.one}`;
}

function demonstrative(unit: RescueUnit) {
    if (unit.feminine) return 'cette';
    return /^[aeiouyhéèêà]/i.test(unit.one) ? 'cet' : 'ce';
}

/**
 * The « Essayez plutôt » block under an empty result — the same in every list,
 * so it reads the same wherever it shows up. lib/search-rescue.ts builds what
 * it shows; lib/search-suggestion-types.ts (RescueSuggestion) says what each
 * kind of proposal means.
 *
 * Each proposal is a card: what changes (a filter lifted, another tab, a word
 * respelt or removed), the objects it finds — each one opens directly — and a
 * button that runs it. Separate buttons rather than one clickable card: the
 * object and the search are two different destinations, and the people using
 * this read slowly and click carefully; they should never have to guess which
 * one a click leads to.
 */
export function SearchRescue<K extends string = string, R extends RescueRow = RescueRow>({
    suggestions,
    unit,
    onApply,
    onOpenRow,
    filterLabel,
    scopeLabel,
    exactCorrectionCounts = true,
    compact = false,
    className,
}: SearchRescueProps<K, R>) {
    if (!suggestions || suggestions.length === 0) return null;

    return (
        <div className={cn('mx-auto text-left', compact ? 'w-full space-y-2 px-2 pb-2' : 'max-w-xl space-y-3 pt-4', className)}>
            <p className={cn('flex items-center gap-2 text-muted-foreground', compact ? 'px-2 text-xs' : 'text-sm')}>
                <Lightbulb className="h-4 w-4 shrink-0" aria-hidden />
                Essayez plutôt :
            </p>
            {suggestions.map((suggestion) => {
                const labels = filterLabel ? suggestion.lifted.map(filterLabel) : suggestion.liftedLabels;
                const plural = labels.length > 1;
                const withoutFilters = labels.length > 0
                    ? ` sans ${plural ? 'les filtres' : 'le filtre'} ${quoted(labels)}`
                    : '';
                const n = suggestion.total;
                const where = suggestion.scope && scopeLabel ? scopeLabel(suggestion.scope) : suggestion.scopeLabel;

                const heading =
                    suggestion.kind === 'filter' ? (
                        <>
                            {plural ? 'Les filtres' : 'Le filtre'} <strong>{quoted(labels)}</strong>{' '}
                            {plural ? 'cachent' : 'cache'} {n > 1 ? `ces ${unit.many}` : `${demonstrative(unit)} ${unit.one}`} :
                        </>
                    ) : suggestion.kind === 'scope' ? (
                        <>
                            Trouvé dans <strong>« {where} »</strong> :
                        </>
                    ) : suggestion.dropped !== undefined ? (
                        <>
                            Chercher sans <strong>« {suggestion.dropped} »</strong> :{' '}
                            <span className="font-medium">« {suggestion.query} »</span>
                            {withoutFilters}
                        </>
                    ) : (
                        <>
                            Vouliez-vous dire <strong>« {suggestion.query} »</strong> ?{withoutFilters}
                        </>
                    );

                const action =
                    suggestion.kind === 'filter'
                        ? `Retirer ${plural ? 'ces filtres' : 'ce filtre'} (${counted(n, unit)})`
                        : suggestion.kind === 'scope'
                            ? `Chercher dans « ${where} » (${counted(n, unit)})`
                            : (exactCorrectionCounts
                                ? `Chercher « ${suggestion.query} » (${counted(n, unit)})`
                                : n > suggestion.rows.length
                                    ? `Voir tous les ${unit.many} pour « ${suggestion.query} »`
                                    : `Chercher « ${suggestion.query} »`)
                              + (labels.length > 0 ? ` sans ${plural ? 'ces filtres' : 'ce filtre'}` : '');

                const rowBody = (row: R) => (
                    <span className="min-w-0">
                        <span className="font-medium">{row.title}</span>
                        {row.detail && <span className="text-muted-foreground"> — {row.detail}</span>}
                        {row.note && (
                            <span className="ml-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                {row.note}
                            </span>
                        )}
                    </span>
                );

                return (
                    <section
                        key={`${suggestion.kind}:${suggestion.scope ?? ''}:${suggestion.query}:${suggestion.lifted.join(',')}`}
                        className={cn(
                            'rounded-md border border-border bg-card text-foreground',
                            compact ? 'px-3 py-2 text-sm' : 'px-4 py-3',
                        )}
                    >
                        <p className="text-sm">{heading}</p>
                        <ul className="mt-2 list-none space-y-1 p-0">
                            {suggestion.rows.map((row) => (
                                <li key={row.id}>
                                    {onOpenRow ? (
                                        <button
                                            type="button"
                                            onClick={() => onOpenRow(row, suggestion)}
                                            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                            {rowBody(row)}
                                        </button>
                                    ) : (
                                        <div className="flex items-start gap-2 px-2 py-1.5">
                                            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                                            {rowBody(row)}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <button
                            type="button"
                            onClick={() => onApply(suggestion)}
                            className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {action}
                        </button>
                    </section>
                );
            })}
        </div>
    );
}
