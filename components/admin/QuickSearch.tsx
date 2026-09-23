'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Command as CommandPrimitive } from 'cmdk';
import { Search, Loader2, FileText, BookOpen, User, LayoutGrid, X, CornerDownLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { foldForLabelMatch } from '@/lib/search-normalize';
import type { QuickSearchHit } from '@/app/api/search/quick/route';

export type QuickSearchPage = { href: string; label: string; group: string };

const GROUP_ICONS = {
    Pages: LayoutGrid,
    Numéros: FileText,
    Membres: User,
    Livres: BookOpen,
} as const;

function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[0.7rem] font-medium leading-none text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
            {children}
        </kbd>
    );
}

/**
 * « Recherche rapide » — one box, from any page of the back office, that
 * finds a page, a person, a book or a numbered record and opens it
 * (app/api/search/quick/route.ts).
 *
 * Opened by Ctrl+K (⌘K on a Mac) AND by a visible « Rechercher » button: a
 * shortcut nobody has been told about is a feature nobody has, and most of
 * the people using this portal will never guess one.
 *
 * The pages are filtered here, instantly, from the same list the navigation
 * shows (so a permanent is never offered a super-admin page); everything else
 * comes from the server, debounced, once two characters are typed.
 */
export function QuickSearch({ pages }: { pages: QuickSearchPage[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<QuickSearchHit[]>([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inFlight = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const reset = () => {
        if (timer.current) clearTimeout(timer.current);
        inFlight.current?.abort();
        setQuery('');
        setHits([]);
        setLoading(false);
    };

    // Fetched from the change handler rather than an effect: each keystroke
    // cancels the previous timer and request, so a slow answer to « mor » can
    // never land on top of the one for « morvan ».
    const onQueryChange = (value: string) => {
        setQuery(value);
        if (timer.current) clearTimeout(timer.current);
        inFlight.current?.abort();
        if (value.trim().length < 2 && !/^\s*#?\d+\s*$/.test(value)) {
            setHits([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        timer.current = setTimeout(async () => {
            const controller = new AbortController();
            inFlight.current = controller;
            try {
                const res = await fetch(`/api/search/quick?q=${encodeURIComponent(value)}`, { signal: controller.signal });
                if (!res.ok) throw new Error(String(res.status));
                const data: { hits: QuickSearchHit[] } = await res.json();
                setHits(data.hits);
            } catch (error) {
                if ((error as Error).name === 'AbortError') return;
                setHits([]);
            }
            setLoading(false);
        }, 250);
    };

    const go = (href: string) => {
        setOpen(false);
        reset();
        router.push(href);
    };

    const needle = foldForLabelMatch(query.trim());
    const pageHits = needle
        ? pages.filter((p) => foldForLabelMatch(`${p.label} ${p.group}`).includes(needle)).slice(0, 6)
        : [];

    const groups: { name: keyof typeof GROUP_ICONS; items: { href: string; label: string; detail: string }[] }[] = [
        { name: 'Pages', items: pageHits.map((p) => ({ href: p.href, label: p.label, detail: p.group })) },
        { name: 'Numéros', items: hits.filter((h) => h.group === 'Numéros') },
        { name: 'Membres', items: hits.filter((h) => h.group === 'Membres') },
        { name: 'Livres', items: hits.filter((h) => h.group === 'Livres') },
    ];
    const nothing = groups.every((g) => g.items.length === 0);

    return (
        <>
            {/* No « Ctrl K » badge on the button: the bar is already full at
                1440 px and the badge pushed « Mon Compte » onto two lines. The
                shortcut is in the tooltip and in the box's own footer. */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="Recherche rapide (Ctrl + K)"
                aria-label="Rechercher"
                className="flex items-center gap-2 whitespace-nowrap rounded-md border border-border bg-field px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Search className="h-4 w-4" aria-hidden="true" />
                {/* Icon only on a phone: the bar there already holds the
                    title, the theme switch and the menu button. */}
                <span className="hidden sm:inline">Rechercher</span>
            </button>

            <Dialog
                open={open}
                onOpenChange={(o) => {
                    setOpen(o);
                    if (!o) reset();
                }}
            >
                {/* gap-0: DialogContent is a gap-4 grid, and the two sr-only
                    elements below would otherwise each open a 16 px gap above
                    the box. */}
                <DialogContent className="top-[12vh] translate-y-0 gap-0 overflow-hidden rounded-xl border-border p-0 shadow-2xl sm:max-w-2xl sm:rounded-xl [&>[data-dialog-close]]:hidden">
                    <DialogTitle className="sr-only">Recherche rapide</DialogTitle>
                    <DialogDescription className="sr-only">
                        Tapez le nom d&apos;une page, d&apos;une personne, le titre d&apos;un livre ou un numéro, puis Entrée pour l&apos;ouvrir.
                    </DialogDescription>
                    {/* shouldFilter off: the server has already matched, with
                        the lists' own accent- and apostrophe-tolerant search. */}
                    <CommandPrimitive shouldFilter={false} loop className="flex min-h-0 flex-col bg-popover text-popover-foreground">
                        <div className="flex items-center gap-3 border-b border-border px-5">
                            <Search className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                            {/* Height comes from padding and a generous
                                line-height, not a fixed h-*: a fixed box with
                                the default leading clipped the descenders
                                (g, p, y) under Segoe UI at some zoom levels. */}
                            <CommandPrimitive.Input
                                ref={inputRef}
                                value={query}
                                onValueChange={onQueryChange}
                                placeholder="Une page, un nom, un livre, un numéro…"
                                className="min-w-0 flex-1 bg-transparent py-4 text-lg leading-8 outline-none placeholder:text-muted-foreground"
                            />
                            {loading && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-label="Recherche en cours" />}
                            {query && !loading && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onQueryChange('');
                                        inputRef.current?.focus();
                                    }}
                                    aria-label="Effacer la recherche"
                                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                            <span className="hidden shrink-0 sm:inline-flex">
                                <Kbd>Échap</Kbd>
                            </span>
                        </div>
                        <CommandPrimitive.List className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain p-2">
                            {!query.trim() && (
                                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                                    Tapez par exemple « factures », « Schweitzer », « L&apos;étranger » ou « 412 ».
                                </p>
                            )}
                            {query.trim() && nothing && !loading && (
                                <div className="px-3 py-10 text-center">
                                    <p className="font-medium text-foreground">Aucun résultat pour « {query.trim()} »</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Vérifiez l&apos;orthographe, ou essayez un autre mot, un nom seul, un numéro.
                                    </p>
                                </div>
                            )}
                            {groups.map(({ name, items }) => {
                                if (items.length === 0) return null;
                                const Icon = GROUP_ICONS[name];
                                return (
                                    <CommandPrimitive.Group
                                        key={name}
                                        heading={name}
                                        className="[&:not(:first-child)]:mt-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
                                    >
                                        {items.map((item) => (
                                            <CommandPrimitive.Item
                                                key={item.href}
                                                value={item.href}
                                                onSelect={() => go(item.href)}
                                                className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-foreground data-[selected=true]:bg-accent"
                                            >
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground group-data-[selected=true]:border-primary/30 group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-primary">
                                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                                </span>
                                                <span className="min-w-0 flex-1 leading-snug">
                                                    <span className="block truncate font-medium">{item.label}</span>
                                                    {item.detail && (
                                                        <span className="block truncate text-sm text-muted-foreground">{item.detail}</span>
                                                    )}
                                                </span>
                                                <CornerDownLeft
                                                    className="hidden h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100 sm:block"
                                                    aria-hidden="true"
                                                />
                                            </CommandPrimitive.Item>
                                        ))}
                                    </CommandPrimitive.Group>
                                );
                            })}
                        </CommandPrimitive.List>
                        <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground sm:flex">
                            <span className="flex items-center gap-1.5">
                                <Kbd>↑</Kbd>
                                <Kbd>↓</Kbd>
                                pour choisir
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Kbd>Entrée</Kbd>
                                pour ouvrir
                            </span>
                            <span className="ml-auto flex items-center gap-1.5">
                                <Kbd>Ctrl</Kbd>
                                <Kbd>K</Kbd>
                                depuis n&apos;importe quelle page
                            </span>
                        </div>
                    </CommandPrimitive>
                </DialogContent>
            </Dialog>
        </>
    );
}
