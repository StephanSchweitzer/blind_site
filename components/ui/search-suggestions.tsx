'use client';

import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SearchSuggestion } from '@/lib/search-suggestion-types';

interface SearchSuggestionsProps {
    suggestions: SearchSuggestion[] | null | undefined;
    /** Run the suggested query: put it in the box AND search, as if typed. */
    onPick: (query: string) => void;
    /** Tighter layout for the picker popovers. */
    compact?: boolean;
    className?: string;
}

const resultCount = (n: number, atLeast = false) =>
    `${atLeast ? 'au moins ' : ''}${n} résultat${n > 1 ? 's' : ''}`;

/**
 * The « Vouliez-vous dire … ? » block under an empty result — the same one in
 * every search bar, lists and pickers alike, so it reads the same wherever it
 * shows up. Renders nothing when there is nothing to propose.
 *
 * Every suggestion has already been checked to find rows (lib/search-suggest.ts),
 * and says how many: a proposal that led to another empty page would teach
 * people to ignore the block.
 *
 * Full-width buttons with the whole query spelled out, rather than links on a
 * single word: the people using this read slowly and click carefully, and
 * should see exactly what will be searched before they click.
 */
export function SearchSuggestions({ suggestions, onPick, compact = false, className }: SearchSuggestionsProps) {
    if (!suggestions || suggestions.length === 0) return null;

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
            {suggestions.map((suggestion) => (
                <button
                    key={`${suggestion.kind}:${suggestion.query}`}
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
            ))}
        </div>
    );
}
