'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    prepareAideEntries,
    searchAide,
    type AideSearchEntry,
    type AideSearchHit,
} from '@/lib/aide-search';

function hitHref({ entry }: AideSearchHit): string {
    return `/admin/aide/${entry.slug}${entry.anchor ? `#${entry.anchor}` : ''}`;
}

/**
 * La barre de recherche du mode d'emploi, en tête du sommaire.
 *
 * Pour qui sait ce qu'il cherche sans savoir dans quelle section c'est rangé :
 * « reçu », « commande », « mot de passe » mènent au paragraphe qui en parle,
 * ancre comprise. Tout le guide arrive avec la page (voir `lib/aide-search.ts`),
 * la recherche se fait donc à chaque frappe, sans aller-retour au serveur.
 */
export function AideSearch({ entries }: { entries: AideSearchEntry[] }) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const prepared = useMemo(() => prepareAideEntries(entries), [entries]);
    const hits = useMemo(() => searchAide(prepared, query), [prepared, query]);
    const searching = query.trim().length > 0;

    return (
        <div role="search" className="space-y-3">
            <label htmlFor="aide-search" className="sr-only">
                Rechercher dans le mode d&apos;emploi
            </label>
            <div className="relative">
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    id="aide-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        // Entrée ouvre le premier résultat : celui qu'on vise
                        // presque toujours, sans reprendre la souris.
                        if (e.key === 'Enter' && hits.length > 0) {
                            e.preventDefault();
                            router.push(hitHref(hits[0]));
                        }
                    }}
                    placeholder="Rechercher : facture, reçu, commande, mot de passe…"
                    autoComplete="off"
                    className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
                    aria-describedby="aide-search-status"
                />
                {searching && (
                    <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Effacer la recherche"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
            </div>

            <p id="aide-search-status" aria-live="polite" className="text-sm text-muted-foreground">
                {!searching
                    ? ''
                    : hits.length === 0
                      ? 'Aucun passage ne correspond. Essayez un autre mot, ou parcourez les sections ci-dessous.'
                      : hits.length === 1
                        ? '1 passage trouvé — Entrée pour l’ouvrir.'
                        : `${hits.length} passages trouvés — Entrée ouvre le premier.`}
            </p>

            {hits.length > 0 && (
                <ul className="space-y-2">
                    {hits.map((hit) => (
                        <li key={`${hit.entry.slug}#${hit.entry.anchor ?? ''}`}>
                            <Link
                                href={hitHref(hit)}
                                className="group flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="min-w-0 space-y-1">
                                    <span className="block text-sm font-medium text-foreground">
                                        {hit.entry.sectionTitle}
                                        {hit.entry.heading && (
                                            <>
                                                <span className="mx-1.5 text-muted-foreground" aria-hidden="true">›</span>
                                                <span className="sr-only">, </span>
                                                {hit.entry.heading}
                                            </>
                                        )}
                                    </span>
                                    <span className="block text-sm text-muted-foreground">
                                        {hit.snippet.map((part, i) =>
                                            part.match ? (
                                                <mark
                                                    key={i}
                                                    className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/30"
                                                >
                                                    {part.text}
                                                </mark>
                                            ) : (
                                                <span key={i}>{part.text}</span>
                                            ),
                                        )}
                                    </span>
                                </span>
                                <ChevronRight
                                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                                    aria-hidden="true"
                                />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
