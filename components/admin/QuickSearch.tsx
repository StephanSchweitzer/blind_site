'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command as CommandPrimitive } from 'cmdk';
import { Search, Loader2, FileText, BookOpen, User, LayoutGrid } from 'lucide-react';
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
                <DialogContent className="top-[15%] translate-y-0 overflow-hidden p-0 sm:max-w-xl [&>[data-dialog-close]]:hidden">
                    <DialogTitle className="sr-only">Recherche rapide</DialogTitle>
                    <DialogDescription className="sr-only">
                        Tapez le nom d&apos;une page, d&apos;une personne, le titre d&apos;un livre ou un numéro, puis Entrée pour l&apos;ouvrir.
                    </DialogDescription>
                    {/* shouldFilter off: the server has already matched, with
                        the lists' own accent- and apostrophe-tolerant search. */}
                    <CommandPrimitive shouldFilter={false} loop className="flex flex-col bg-popover text-popover-foreground">
                        <div className="flex items-center gap-2 border-b border-border px-4">
                            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <CommandPrimitive.Input
                                value={query}
                                onValueChange={onQueryChange}
                                placeholder="Une page, un nom, un livre, un numéro…"
                                className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                            />
                            {loading && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-label="Recherche en cours" />}
                        </div>
                        <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-2">
                            {!query.trim() && (
                                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                                    Tapez par exemple « factures », « Morvan », « L&apos;étranger » ou « 412 ».
                                </p>
                            )}
                            {query.trim() && nothing && !loading && (
                                <p className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>
                            )}
                            {groups.map(({ name, items }) => {
                                if (items.length === 0) return null;
                                const Icon = GROUP_ICONS[name];
                                return (
                                    <CommandPrimitive.Group
                                        key={name}
                                        heading={name}
                                        className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                                    >
                                        {items.map((item) => (
                                            <CommandPrimitive.Item
                                                key={item.href}
                                                value={item.href}
                                                onSelect={() => go(item.href)}
                                                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-foreground data-[selected=true]:bg-accent"
                                            >
                                                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                <span className="min-w-0">
                                                    <span className="block truncate font-medium">{item.label}</span>
                                                    {item.detail && (
                                                        <span className="block truncate text-sm text-muted-foreground">{item.detail}</span>
                                                    )}
                                                </span>
                                            </CommandPrimitive.Item>
                                        ))}
                                    </CommandPrimitive.Group>
                                );
                            })}
                        </CommandPrimitive.List>
                        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                            ↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer · Ctrl + K l&apos;ouvre de partout
                        </div>
                    </CommandPrimitive>
                </DialogContent>
            </Dialog>
        </>
    );
}
