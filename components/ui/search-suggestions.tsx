'use client';

import { ArrowRight, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SearchSuggestion } from '@/lib/search-suggestion-types';

type WithItems<T> = SearchSuggestion & { items?: T[] };

interface SearchSuggestionsProps<T> {
    suggestions: WithItems<T>[] | null | undefined;
    /** Run the suggested query: put it in the box AND search, as if typed. */
    onPick: (query: string) => void;
    /**
     * Show the items each suggestion finds (useVerifiedSuggestions fetched
     * them to verify it) and pick one directly. All three or none.
     */
    renderItem?: (item: T) => React.ReactNode;
    getItemKey?: (item: T) => React.Key;
    onPickItem?: (item: T) => void;
    /** Items the picker would refuse (greyed out in its list) are not offered here. */
    isItemDisabled?: (item: T) => boolean;
    /** Tighter layout for the picker popovers. */
    compact?: boolean;
    className?: string;
}

const resultCount = (n: number, atLeast = false) =>
    `${atLeast ? 'au moins ' : ''}${n} résultat${n > 1 ? 's' : ''}`;

/**
 * The « Vouliez-vous dire … ? » block of the PICKERS — the search fields
 * inside forms (EntitySearchCombobox and its hand-built cousins). The lists
 * have a fuller block, SearchRescue (components/ui/search-rescue.tsx), which
 * also lifts filters; a picker's filters are not the user's to lift (« lecteurs
 * attribuables »), so here it is words, and the items they find.
 *
 * Every suggestion has already been checked to find rows (useVerifiedSuggestions),
 * and says how many: a proposal that led to another empty list would teach
 * people to ignore the block.
 *
 * Full-width buttons with the whole query spelled out, rather than links on a
 * single word: the people using this read slowly and click carefully, and
 * should see exactly what will be searched before they click. Under each one,
 * the items it finds, each pickable as it would be from the list itself.
 */
export function SearchSuggestions<T>({
    suggestions,
    onPick,
    renderItem,
    getItemKey,
    onPickItem,
    isItemDisabled,
    compact = false,
    className,
}: SearchSuggestionsProps<T>) {
    if (!suggestions || suggestions.length === 0) return null;
    const showItems = !!renderItem && !!getItemKey && !!onPickItem;

    return (
        <div
            role="status"
            className={cn(
                'mx-auto text-left',
                compact ? 'w-full space-y-1 px-2 pb-2' : 'max-w-xl space-y-2 pt-4',
                className,
            )}
        >
            <p className={cn('flex items-center gap-2 text-muted-foreground', compact ? 'text-xs px-2' : 'text-sm')}>
                <Lightbulb className="h-4 w-4 shrink-0" aria-hidden />
                Essayez plutôt :
            </p>
            {suggestions.map((suggestion) => {
                const items = showItems
                    ? (suggestion.items ?? []).filter((item) => !isItemDisabled?.(item))
                    : [];
                return (
                    <div key={`${suggestion.kind}:${suggestion.query}`} className="space-y-0.5">
                        <button
                            type="button"
                            onClick={() => onPick(suggestion.query)}
                            className={cn(
                                'w-full rounded-md border border-border bg-card text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                compact ? 'px-3 py-2 text-sm' : 'px-4 py-3',
                            )}
                        >
                            <span className="block">
                                {suggestion.kind === 'drop' ? (
                                    <>
                                        Chercher sans <strong>« {suggestion.dropped} »</strong> :{' '}
                                        <span className="font-medium">« {suggestion.query} »</span>
                                    </>
                                ) : (
                                    <>
                                        Vouliez-vous dire <strong>« {suggestion.query} »</strong> ?
                                    </>
                                )}
                            </span>
                            {suggestion.count !== undefined && (
                                <span className={cn('block text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
                                    {resultCount(suggestion.count, suggestion.atLeast)}
                                </span>
                            )}
                        </button>
                        {items.map((item) => (
                            <button
                                key={getItemKey!(item)}
                                type="button"
                                onClick={() => onPickItem!(item)}
                                className={cn(
                                    'flex w-full items-start gap-2 rounded-md text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2',
                                )}
                            >
                                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                <span className="min-w-0 flex-1">{renderItem!(item)}</span>
                            </button>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}
