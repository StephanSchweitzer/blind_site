'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Search } from 'lucide-react';
import { useEntitySearch } from '@/hooks/useEntitySearch';
import { meetsSearchMinLength, normalizeSearchQuery } from '@/lib/search-query';
import { cn } from '@/lib/utils';

export interface EntitySearchComboboxProps<T> {
    /** Currently selected item, shown on the trigger button. */
    value: T | null;
    /**
     * Called when the user picks a result. Return `false` (sync or async) to
     * veto the selection: the popover stays open and the query is kept —
     * used by the activity-guard flows.
     */
    onSelect: (item: T) => boolean | void | Promise<boolean | void>;
    fetcher: (query: string, signal: AbortSignal) => Promise<T[]>;
    getItemKey: (item: T) => React.Key;
    /** Row content inside the results list. */
    renderItem: (item: T) => React.ReactNode;
    /** Trigger label for the selected item. */
    renderValue: (item: T) => React.ReactNode;
    placeholder: string;
    searchPlaceholder: string;
    emptyMessage: string;
    minLength?: number;
    /**
     * How many rows the fetcher asks the API for. Used only to tell the user
     * when the list is capped rather than complete — see the footer below.
     * Omit when the fetcher has no ceiling.
     */
    resultLimit?: number;
    /** Plural noun for the footer count: « 12 lecteurs ». */
    resultNoun?: string;
    /**
     * Open on a default list (fetcher called with `''`) instead of the
     * "type N characters" hint. The attribution form's demande picker uses
     * this for its recent-attributable list.
     */
    searchOnEmpty?: boolean;
    /**
     * Rows the list must show but must not let the user pick — a demande that
     * already has an attribution, say. They render greyed and are skipped by
     * the arrow keys. `renderItem` is still responsible for saying WHY.
     */
    isItemDisabled?: (item: T) => boolean;
    /**
     * Adjective for the count of pickable rows when some are disabled:
     * « 3 attribuables sur 12 ». Only used alongside `isItemDisabled`.
     */
    selectableNoun?: string;
    /** Message under the list when the default (empty-query) list is empty. */
    emptyDefaultMessage?: string;
    /** Extra classes on each result row — for taller rows or separators. */
    itemClassName?: string;
    /** Ref for the trigger button (useInvalidField's registerField). */
    triggerRef?: React.Ref<HTMLButtonElement>;
    /**
     * Grey out the trigger. For rules the caller can state BEFORE the user types —
     * the selected value stays readable, only picking another one is refused.
     */
    disabled?: boolean;
    triggerClassName?: string;
    contentClassName?: string;
    listClassName?: string;
}

const DEFAULT_TRIGGER =
    'w-full justify-between bg-field border-border text-foreground hover:bg-muted transition-colors';

export function EntitySearchCombobox<T>({
    value,
    onSelect,
    fetcher,
    getItemKey,
    renderItem,
    renderValue,
    placeholder,
    searchPlaceholder,
    emptyMessage,
    minLength = 2,
    resultLimit,
    resultNoun = 'résultats',
    searchOnEmpty = false,
    isItemDisabled,
    selectableNoun = 'sélectionnables',
    emptyDefaultMessage,
    itemClassName,
    disabled = false,
    triggerRef,
    triggerClassName,
    contentClassName,
    listClassName,
}: EntitySearchComboboxProps<T>) {
    const [open, setOpen] = useState(false);
    const { query, setQuery, results, isSearching, reset } = useEntitySearch(fetcher, {
        minLength,
        searchOnEmpty,
    });

    // Keyboard navigation over the results list. The index is reset on every
    // keystroke; out-of-range values (results shrank) simply highlight nothing.
    const [activeIndex, setActiveIndex] = useState(-1);
    const listRef = useRef<HTMLDivElement>(null);

    // While `onSelect` is in flight (activity-guard lookup, fetching the full
    // book record, etc.) the popover would otherwise just sit there with no
    // feedback until it closes. Track which row was picked so we can spin its
    // icon and lock the list, instead of a silent freeze.
    const [selectingKey, setSelectingKey] = useState<React.Key | null>(null);
    const isSelecting = selectingKey !== null;

    const handleQueryChange = (q: string) => {
        setQuery(q);
        setActiveIndex(-1);
    };

    const handleOpenChange = (next: boolean) => {
        // Ignore outside-click/escape while a selection is resolving —
        // closing mid-flight would abandon the pending onSelect promise.
        if (!next && isSelecting) return;
        setOpen(next);
        // Reset on OPEN, not on close: Radix keeps the popover mounted and
        // playing its exit animation for a moment after close, so clearing
        // query/results here used to wipe the list out from under it —
        // collapsing to the "type N characters" hint mid-animation instead of
        // fading out the results (and the just-picked row's spinner) the user
        // actually saw. Resetting on open instead means the exit animation
        // plays on whatever was really last shown, and every open still
        // starts from a blank slate.
        if (next) {
            reset();
            setActiveIndex(-1);
        }
    };

    const handleSelect = async (item: T) => {
        if (isSelecting) return;
        // Belt and braces: the row is already unclickable and skipped by the
        // arrow keys, but a disabled item must never reach onSelect.
        if (isItemDisabled?.(item)) return;
        setSelectingKey(getItemKey(item));
        try {
            const outcome = await onSelect(item);
            if (outcome === false) return; // vetoed — keep the popover open
            handleOpenChange(false);
        } finally {
            setSelectingKey(null);
        }
    };

    // Walk to the next selectable row in `step` direction, wrapping once. Rows
    // the caller marked disabled (an already-attributed demande) are shown but
    // never land under the highlight — otherwise Enter would appear to do
    // nothing and read as a broken picker.
    const nextEnabledIndex = (from: number, step: 1 | -1): number => {
        if (!results.length) return -1;
        const n = results.length;
        for (let i = 1; i <= n; i++) {
            const candidate = (((from + step * i) % n) + n) % n;
            if (!isItemDisabled?.(results[candidate])) return candidate;
        }
        return -1; // every row is disabled
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!results.length || isSelecting) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => nextEnabledIndex(prev, 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => nextEnabledIndex(prev < 0 ? 0 : prev, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < results.length) void handleSelect(results[activeIndex]);
        }
    };

    // Keep the active row visible while navigating with the arrow keys.
    useEffect(() => {
        if (activeIndex < 0) return;
        listRef.current
            ?.querySelector(`[data-index="${activeIndex}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    // An id query short-circuits the character floor, so the hint has to ask
    // the same question the hook does rather than measuring the string itself —
    // otherwise typing « 7 » shows "type 2 characters" over a live result list.
    // In default-list mode an empty box is a valid state showing real results,
    // so the hint only ever applies to a too-short non-empty query.
    const isDefaultList = searchOnEmpty && normalizeSearchQuery(query).length === 0;
    const showHint = !isDefaultList && !meetsSearchMinLength(query, minLength);

    // The list is ~4 rows tall on a laptop while the fetchers return 20–50.
    // Without a count, a full result set reads as "three results and a
    // scrollbar I didn't notice" — which is what staff reported as the list
    // being too short. Saying how many there are, and whether the API capped
    // them, is what actually makes the list feel complete.
    const showFooter = !showHint && !isSearching && results.length > 0;
    const isCapped = resultLimit !== undefined && results.length >= resultLimit;

    // When some rows can't be picked, the raw total is misleading in the other
    // direction: "12 résultats" over a list where 9 are greyed out is exactly
    // the frustration this footer exists to remove. Count what's usable.
    const selectableCount = isItemDisabled
        ? results.filter((item) => !isItemDisabled(item)).length
        : results.length;
    const hasDisabledRows = selectableCount < results.length;

    // French takes the singular for 0 as well as 1 — « 0 attribuable sur 12 ».
    const agree = (count: number, plural: string) =>
        count > 1 ? plural : plural.replace(/s$/, '');

    // « Affichage limité à N livres » rather than « les N premiers livres »:
    // the noun varies in gender (un livre, une personne, une demande) and an
    // adjective in front of it would have to agree. This phrasing carries no
    // adjective, so one string works for every caller.
    const footerText = hasDisabledRows
        ? `${selectableCount} ${agree(selectableCount, selectableNoun)} sur ${results.length}`
        : isCapped
            ? `Affichage limité à ${results.length} ${resultNoun} — affinez la recherche`
            : `${results.length} ${agree(results.length, resultNoun)}`;

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    ref={triggerRef}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        DEFAULT_TRIGGER,
                        disabled && 'opacity-50 cursor-not-allowed',
                        triggerClassName
                    )}
                >
                    {value ? (
                        <span className="truncate">{renderValue(value)}</span>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className={cn(
                    'w-[min(400px,calc(100vw-2rem))] p-0 bg-card border-border',
                    contentClassName
                )}
                align="start"
                collisionPadding={16}
            >
                <div className="p-2 relative">
                    <Input
                        placeholder={searchPlaceholder}
                        value={query}
                        onChange={(e) => handleQueryChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        disabled={isSelecting}
                        className="bg-field border-border text-foreground pr-8"
                    />
                    {isSearching && (
                        // Positioning (translate-y, for centering) and the spin animation
                        // can't share one element: Tailwind's animate-spin keyframe sets
                        // `transform: rotate(...)` outright, which clobbers a sibling
                        // -translate-y-1/2 on the same element for as long as it's
                        // animating — the icon snaps out of its centered position instead
                        // of rotating in place. Splitting them across a wrapper (position)
                        // and the icon (rotation) keeps both transforms intact.
                        <span className="absolute right-4 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </span>
                    )}
                </div>
                <div
                    ref={listRef}
                    className={cn(
                        // 200px fitted barely three two-line rows, so a 20-result
                        // search looked like three. `min(…, 50vh)` keeps the taller
                        // list from running off a short laptop screen — the popover
                        // also has a search box and a footer above/below it.
                        'max-h-[min(400px,50vh)] overflow-y-auto transition-opacity',
                        isSearching && 'opacity-60',
                        listClassName
                    )}
                    onWheel={(e) => e.stopPropagation()}
                >
                    {showHint ? (
                        <div className="p-4 text-center text-muted-foreground">
                            Tapez au moins {minLength} caractères, ou un numéro d&apos;identifiant
                        </div>
                    ) : results.length === 0 && !isSearching ? (
                        <div className="p-4 text-center text-muted-foreground">
                            {isDefaultList ? (emptyDefaultMessage ?? emptyMessage) : emptyMessage}
                        </div>
                    ) : (
                        results.map((item, index) => {
                            const key = getItemKey(item);
                            const isThisSelecting = selectingKey === key;
                            const itemDisabled = isItemDisabled?.(item) ?? false;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    data-index={index}
                                    onClick={() => handleSelect(item)}
                                    // Disabled rows must not take the highlight
                                    // on hover either, or the highlight becomes
                                    // a promise the row can't keep.
                                    onMouseEnter={() => !itemDisabled && setActiveIndex(index)}
                                    disabled={isSelecting || itemDisabled}
                                    aria-disabled={itemDisabled}
                                    className={cn(
                                        'w-full flex items-center gap-2 text-left px-4 py-2 text-foreground transition-colors',
                                        itemDisabled
                                            ? 'opacity-50 cursor-not-allowed'
                                            : index === activeIndex && !isSelecting
                                                ? 'bg-muted'
                                                : 'hover:bg-muted',
                                        isSelecting && !isThisSelecting && 'opacity-50',
                                        isSelecting && 'cursor-not-allowed',
                                        itemClassName
                                    )}
                                >
                                    <span className="min-w-0 flex-1">{renderItem(item)}</span>
                                    {isThisSelecting && (
                                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
                {showFooter && (
                    <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                        {footerText}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
