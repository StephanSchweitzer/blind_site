'use client';

import React, { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pageSlots, type PageInfo } from '@/lib/pagination';

/**
 * La pagination du site public (catalogue, dernières infos, listes de livres).
 *
 * Même logique que celle du back-office (components/ui/admin/AdminPagination.tsx),
 * habillée du verre du site public. Elle remplace l'ancienne custom-pagination.tsx, qui
 * doublait tout — « ⟪ » et « 1 », « ‹ Précédent » et « ← », « ⟫ » et le dernier
 * numéro —, ne donnait jamais le nombre de livres, et ne montrait sur téléphone
 * qu'un « 1 » isolé entre deux boutons, sans dire sur combien.
 *
 * - **Le compte, en haut de la liste** : « 10–18 sur 15 432 livres », et deux
 *   flèches pour tourner la page sans descendre. C'est la région `role="status"`
 *   de la page : chaque changement (page, recherche, filtre) y est annoncé.
 * - **Une barre en bas** : les numéros (sept cases, voir `pageSlots`) et
 *   « Aller à la page » au-delà de sept pages. Un clic en bas remonte au compte
 *   et y pose le focus : sinon on arrivait sur la page suivante… par sa fin.
 * - **Sur téléphone**, la barre du bas tient en une ligne : « ‹ Page [3] sur
 *   1 715 › ». Le numéro est un champ : on y tape une page, « OK » du clavier.
 * - **Des boutons, pas des liens** : ces pages gardent leur état hors de l'URL
 *   (le catalogue est servi en statique). Une flèche en bout de liste reste
 *   focalisable (`aria-disabled`, pas `disabled`) : un `disabled` ferait
 *   tomber le focus sur <body> au clic qui mène à la dernière page.
 */

const nf = new Intl.NumberFormat('fr-FR');

type Noun = { one: string; many: string; feminine?: boolean };

export type PublicPaginationProps = {
    info: PageInfo;
    /** « livre » / « livres » — le compte s'en sert. */
    noun: Noun;
    /** Nom du repère de navigation, p. ex. « Pages du catalogue » (RGAA 12.6). */
    label: string;
    onPageChange: (page: number) => void;
    pending?: boolean;
    /**
     * Ce que la région d'état annonce à la place du compte : « Recherche en
     * cours… », ou l'absence de résultat. Affiché pendant un chargement ; pour
     * une liste vide, lu seulement — la page montre déjà son propre message.
     */
    announce?: string;
};

// Le verre des cartes (.glass-card), en pilule. « Contraste renforcé » le rend
// uni, et « couleurs forcées » lui rend un contour (app/globals.css). Le « ! » :
// .glass-card est déclarée dans @layer utilities après celles de Tailwind, et
// son rounded-2xl l'emporterait.
const pill = 'glass-card !rounded-[1.75rem] p-1.5';

const control = cn(
    'inline-flex h-11 min-w-11 items-center justify-center rounded-full px-3 sm:h-10 sm:min-w-10',
    'text-base font-medium tabular-nums text-foreground transition-colors',
    'hover:bg-primary/10 dark:hover:bg-white/10',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent',
    '[&_svg]:size-5 [&_svg]:shrink-0',
);

const current = cn(
    control,
    'bg-primary font-bold text-primary-foreground hover:bg-primary dark:hover:bg-primary',
    // Sous « couleurs forcées », le fond bleu disparaît : la page courante
    // reprend les couleurs de sélection du système.
    'forced-colors:[forced-color-adjust:none] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]',
);

const field = cn(
    'h-10 rounded-full border-2 border-gray-300/60 bg-white/95 px-2 text-center text-base tabular-nums',
    'text-gray-900 placeholder-gray-600 dark:border-gray-600/60 dark:bg-gray-700/95 dark:text-gray-100 dark:placeholder-gray-300',
    'focus:border-blue-500/80 focus:outline-none focus:ring-4 focus:ring-blue-500/20',
);

function ArrowButton({
    direction,
    info,
    onPage,
}: {
    direction: 'prev' | 'next';
    info: PageInfo;
    onPage: (page: number) => void;
}) {
    const { page, totalPages } = info;
    const target = direction === 'prev' ? page - 1 : page + 1;
    const inactive = target < 1 || target > totalPages;
    return (
        <button
            type="button"
            className={control}
            aria-label={direction === 'prev' ? 'Page précédente' : 'Page suivante'}
            aria-disabled={inactive || undefined}
            onClick={() => {
                if (!inactive) onPage(target);
            }}
        >
            {direction === 'prev' ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        </button>
    );
}

/** Lit un numéro de page tapé, ramené entre 1 et la dernière ; `null` s'il n'y en a pas. */
function parseJump(raw: FormDataEntryValue | null, totalPages: number): number | null {
    const target = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(target)) return null;
    return Math.min(Math.max(target, 1), totalPages);
}

/**
 * Le haut de la liste : le compte, et deux flèches. Porte l'`id` vers lequel
 * la barre du bas ramène.
 */
export function PublicPaginationSummary({
    info,
    noun,
    label,
    onPageChange,
    pending = false,
    announce,
    anchorId,
}: PublicPaginationProps & { anchorId: string }) {
    const { from, to, total, page, pageSize, totalPages } = info;
    const empty = total === 0 && !pending;

    return (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {/* tabIndex -1 : la barre du bas y pose le focus après un changement de page. */}
            <p
                id={anchorId}
                tabIndex={-1}
                role="status"
                className={cn(
                    'scroll-mt-28 text-base text-gray-700 outline-none dark:text-gray-300',
                    empty && 'sr-only',
                )}
            >
                {announce !== undefined ? (
                    announce
                ) : total === 0 ? (
                    <>{noun.feminine ? 'Aucune' : 'Aucun'} {noun.one}</>
                ) : pageSize === 1 ? (
                    // Une liste par page (listes de livres) : « Liste 3 sur 12 ».
                    <>
                        <span className="capitalize">{noun.one}</span>{' '}
                        <span className="font-semibold text-foreground tabular-nums">{nf.format(page)}</span> sur{' '}
                        <span className="font-semibold text-foreground tabular-nums">{nf.format(total)}</span>
                    </>
                ) : (
                    <>
                        <span className="font-semibold text-foreground tabular-nums">
                            {nf.format(from)}–{nf.format(to)}
                        </span>{' '}
                        sur <span className="font-semibold text-foreground tabular-nums">{nf.format(total)}</span>{' '}
                        {total > 1 ? noun.many : noun.one}
                        {totalPages > 1 && (
                            <span className="sr-only">
                                , page {nf.format(page)} sur {nf.format(totalPages)}
                            </span>
                        )}
                    </>
                )}
            </p>

            {totalPages > 1 && (
                <nav aria-label={`${label} (haut de liste)`} className={cn(pill, 'ml-auto flex items-center gap-1 !rounded-full p-1')}>
                    <ArrowButton direction="prev" info={info} onPage={onPageChange} />
                    <ArrowButton direction="next" info={info} onPage={onPageChange} />
                </nav>
            )}
        </div>
    );
}

/**
 * Le bas de la liste. Sur écran large, les numéros et « Aller à la page » ;
 * sur téléphone, « ‹ Page [n] sur N › » sur une ligne.
 */
export function PublicPaginationBar({
    info,
    noun,
    label,
    onPageChange,
    pending = false,
    anchorId,
}: PublicPaginationProps & { anchorId: string }) {
    const jumpId = useId();
    const compactId = useId();
    const { page, pageSize, totalPages } = info;
    // « Liste 2 sur 5 » quand une page est une liste, comme le compte en haut.
    const unit = pageSize === 1 ? noun.one.charAt(0).toUpperCase() + noun.one.slice(1) : 'Page';

    if (totalPages <= 1) return null;

    // Retour au compte, focus compris — voir l'en-tête du fichier.
    const go = (target: number) => {
        onPageChange(target);
        const anchor = document.getElementById(anchorId);
        anchor?.focus({ preventScroll: true });
        anchor?.scrollIntoView({ block: 'start' });
    };

    const submitJump = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem('page') as HTMLInputElement | null;
        const target = parseJump(input?.value ?? null, totalPages);
        if (input) input.value = '';
        if (target !== null && target !== page) go(target);
    };

    const submitCompact = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem('page') as HTMLInputElement | null;
        const target = parseJump(input?.value ?? null, totalPages);
        if (target !== null && target !== page) go(target);
        else if (input) input.value = String(page);
    };

    const many = totalPages > 7;

    return (
        <div className={cn('flex flex-wrap items-center justify-center gap-3 transition-opacity', pending && 'opacity-60')}>
            {/* Écran large : les numéros. */}
            <nav aria-label={label} className="hidden sm:block">
                <ul className={cn(pill, 'flex flex-wrap items-center justify-center gap-1')}>
                    <li>
                        <ArrowButton direction="prev" info={info} onPage={go} />
                    </li>
                    {pageSlots(page, totalPages).map((slot) =>
                        typeof slot === 'number' ? (
                            <li key={slot}>
                                <button
                                    type="button"
                                    className={slot === page ? current : control}
                                    aria-current={slot === page ? 'page' : undefined}
                                    aria-label={slot === page ? `Page ${slot}, page actuelle` : `Page ${slot}`}
                                    onClick={() => {
                                        if (slot !== page) go(slot);
                                    }}
                                >
                                    {nf.format(slot)}
                                </button>
                            </li>
                        ) : (
                            <li key={slot} aria-hidden="true" className="w-6 text-center text-gray-600 dark:text-gray-300">
                                …
                            </li>
                        ),
                    )}
                    <li>
                        <ArrowButton direction="next" info={info} onPage={go} />
                    </li>
                </ul>
            </nav>

            {many && (
                <form onSubmit={submitJump} className={cn(pill, 'hidden items-center gap-2 pl-4 sm:flex')}>
                    <label htmlFor={jumpId} className="whitespace-nowrap text-base text-gray-700 dark:text-gray-300">
                        Aller à la page
                    </label>
                    <input
                        id={jumpId}
                        name="page"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        enterKeyHint="go"
                        placeholder={String(page)}
                        className={cn(field, 'w-20')}
                    />
                    <button type="submit" className={cn(control, 'px-4')}>
                        Aller
                    </button>
                </form>
            )}

            {/* Téléphone : une seule ligne, flèches aux bords. */}
            <nav aria-label={label} className="w-full sm:hidden">
                <div className={cn(pill, 'grid grid-cols-[auto_1fr_auto] items-center gap-1')}>
                    <ArrowButton direction="prev" info={info} onPage={go} />
                    {many ? (
                        <form onSubmit={submitCompact} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                            <label htmlFor={compactId} className="text-base text-gray-700 dark:text-gray-300">
                                {unit}
                            </label>
                            {/* Non contrôlé, remonté à chaque page (key) : ce qu'on
                                tape et n'envoie pas revient au numéro courant en
                                quittant le champ, sans changer de page au passage
                                du focus (RGAA 7.5 — pas de changement de contexte). */}
                            <input
                                key={page}
                                id={compactId}
                                name="page"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoComplete="off"
                                enterKeyHint="go"
                                defaultValue={page}
                                aria-describedby={`${compactId}-sur`}
                                onFocus={(e) => e.currentTarget.select()}
                                onBlur={(e) => {
                                    e.currentTarget.value = String(page);
                                }}
                                className={cn(field, 'w-16')}
                            />
                            <span id={`${compactId}-sur`} className="whitespace-nowrap text-base text-gray-700 dark:text-gray-300">
                                sur {nf.format(totalPages)}
                            </span>
                        </form>
                    ) : (
                        <p className="text-center text-base text-gray-700 dark:text-gray-300">
                            {unit} <span className="font-semibold text-foreground tabular-nums">{page}</span> sur{' '}
                            <span className="tabular-nums">{totalPages}</span>
                        </p>
                    )}
                    <ArrowButton direction="next" info={info} onPage={go} />
                </div>
            </nav>
        </div>
    );
}

/**
 * Une liste paginée complète : le compte et ses flèches, la liste (`children`),
 * la barre du bas.
 */
export function PublicPaginatedList({
    children,
    ...props
}: PublicPaginationProps & { children: React.ReactNode }) {
    const anchorId = useId();
    return (
        // Pas d'aria-busy ici : il ferait taire « Recherche en cours… », que
        // la région d'état annonce justement pendant le chargement.
        <div className="space-y-5">
            <PublicPaginationSummary {...props} anchorId={anchorId} />
            {children}
            <PublicPaginationBar {...props} anchorId={anchorId} />
        </div>
    );
}
