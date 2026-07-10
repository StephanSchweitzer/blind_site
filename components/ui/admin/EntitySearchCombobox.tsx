'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Search } from 'lucide-react';
import { useEntitySearch } from '@/hooks/useEntitySearch';
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
    /** Ref for the trigger button (useInvalidField's registerField). */
    triggerRef?: React.Ref<HTMLButtonElement>;
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
    triggerRef,
    triggerClassName,
    contentClassName,
    listClassName,
}: EntitySearchComboboxProps<T>) {
    const [open, setOpen] = useState(false);
    const { query, setQuery, results, isSearching, reset } = useEntitySearch(fetcher, {
        minLength,
    });

    // Keyboard navigation over the results list. The index is reset on every
    // keystroke; out-of-range values (results shrank) simply highlight nothing.
    const [activeIndex, setActiveIndex] = useState(-1);
    const listRef = useRef<HTMLDivElement>(null);

    const handleQueryChange = (q: string) => {
        setQuery(q);
        setActiveIndex(-1);
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            reset();
            setActiveIndex(-1);
        }
    };

    const handleSelect = async (item: T) => {
        const outcome = await onSelect(item);
        if (outcome === false) return; // vetoed — keep the popover open
        handleOpenChange(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!results.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
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

    const showHint = query.trim().length < minLength;

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    ref={triggerRef}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(DEFAULT_TRIGGER, triggerClassName)}
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
                        className="bg-field border-border text-foreground pr-8"
                    />
                    {isSearching && (
                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                </div>
                <div
                    ref={listRef}
                    className={cn(
                        'max-h-[200px] overflow-y-auto transition-opacity',
                        isSearching && 'opacity-60',
                        listClassName
                    )}
                    onWheel={(e) => e.stopPropagation()}
                >
                    {showHint ? (
                        <div className="p-4 text-center text-muted-foreground">
                            Tapez au moins {minLength} caractères pour rechercher
                        </div>
                    ) : results.length === 0 && !isSearching ? (
                        <div className="p-4 text-center text-muted-foreground">{emptyMessage}</div>
                    ) : (
                        results.map((item, index) => (
                            <button
                                key={getItemKey(item)}
                                type="button"
                                data-index={index}
                                onClick={() => handleSelect(item)}
                                onMouseEnter={() => setActiveIndex(index)}
                                className={cn(
                                    'w-full text-left px-4 py-2 text-foreground transition-colors',
                                    index === activeIndex ? 'bg-muted' : 'hover:bg-muted'
                                )}
                            >
                                {renderItem(item)}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
