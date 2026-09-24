'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ADMIN_PAGE_SIZE, ADMIN_PAGE_SIZES, pageSlots, type PageInfo } from '@/lib/pagination';

/**
 * La pagination des listes du back-office.
 *
 * Elle remplace une barre recopiée dans chaque tableau : des boutons « << < > >> »
 * sans nom pour un lecteur d'écran, qui ne donnaient jamais le nombre de lignes
 * et ne menaient à la page 400 d'une liste de 800 qu'en retouchant l'URL.
 *
 * - **Des liens, pas des boutons.** La page vit dans l'URL : chaque numéro a
 *   donc sa vraie adresse — clic du milieu, « ouvrir dans un nouvel onglet »,
 *   copier le lien. Un clic simple passe par `onNavigate`, pour que la liste
 *   se grise pendant le chargement comme avec les filtres.
 * - **Le compte, en clair** : « 26–50 sur 20 184 demandes », annoncé à chaque
 *   changement (role="status").
 * - **Deux barres.** En haut, le compte, les flèches et la taille de page ; en
 *   bas, les numéros et « Aller à la page ». Un clic en bas remonte au haut de
 *   la liste et y pose le focus : sinon on arrivait sur la page suivante… par
 *   sa dernière ligne.
 */

const nf = new Intl.NumberFormat('fr-FR');

type Noun = { one: string; many: string; feminine?: boolean };

export type AdminPaginationProps = {
    info: PageInfo;
    /** « demande » / « demandes » — le compte et les libellés s'en servent. */
    noun: Noun;
    /** Nom du repère de navigation, p. ex. « Pages des demandes » (RGAA 12.6). */
    label: string;
    /** Navigation client (router.push dans une transition) pour un clic simple. */
    onNavigate: (href: string) => void;
    pending?: boolean;
    /**
     * « Lignes par page » (25 / 50 / 100). À `false` sur les files de travail
     * dont chaque carte coûte des requêtes (doublons, audio orphelin) : leur
     * taille est fixée côté serveur.
     */
    resizable?: boolean;
    /**
     * La requête courante, pour les listes qui écrivent leur URL par
     * `history.replaceState` (catalogue, dernières infos) : `useSearchParams`
     * ne voit pas ces écritures, et les liens perdraient la recherche, les
     * filtres et la taille. Absente, on lit `useSearchParams`.
     */
    query?: string;
};

const DEEP_LINK_PARAMS = ['order', 'assignment', 'bill', 'payment', 'user', 'news'];

/** Construit l'URL d'une page, les autres paramètres gardés tels quels. */
function useHrefFor(query?: string) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    return (updates: { page?: number; perPage?: number }) => {
        const params = new URLSearchParams(query ?? searchParams.toString());
        // Un lien de pagination ne doit pas rouvrir la fiche d'un lien profond
        // (?order=, ?assignment=… ouvrent le modal de la ligne visée).
        for (const key of DEEP_LINK_PARAMS) params.delete(key);
        if (updates.page !== undefined) {
            if (updates.page > 1) params.set('page', String(updates.page));
            else params.delete('page');
        }
        if (updates.perPage !== undefined) {
            if (updates.perPage !== ADMIN_PAGE_SIZE) params.set('perPage', String(updates.perPage));
            else params.delete('perPage');
        }
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
    };
}

const control = cn(
    buttonVariants({ variant: 'outline', size: 'sm' }),
    'min-w-9 px-2.5 bg-card text-foreground border-border hover:bg-muted tabular-nums',
);
const disabledControl = cn(control, 'pointer-events-none opacity-40');
const currentControl = cn(
    buttonVariants({ size: 'sm' }),
    'min-w-9 px-2.5 tabular-nums bg-primary text-primary-foreground hover:bg-primary/90',
);

function PageLink({
    href,
    onNavigate,
    className,
    children,
    ...rest
}: {
    href: string;
    onNavigate: (href: string) => void;
    className: string;
    children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>) {
    return (
        <Link
            href={href}
            scroll={false}
            // Appelé seulement pour une navigation dans l'onglet : Ctrl+clic,
            // clic du milieu et « ouvrir dans un nouvel onglet » restent au navigateur.
            onNavigate={(e) => {
                e.preventDefault();
                onNavigate(href);
            }}
            className={className}
            {...rest}
        >
            {children}
        </Link>
    );
}

function prevNextLinks({
    info,
    hrefFor,
    go,
}: {
    info: PageInfo;
    hrefFor: ReturnType<typeof useHrefFor>;
    go: (href: string) => void;
}) {
    const { page, totalPages } = info;
    return {
        prev:
            page > 1 ? (
                <PageLink href={hrefFor({ page: page - 1 })} onNavigate={go} className={control} aria-label="Page précédente" rel="prev">
                    <ChevronLeft aria-hidden="true" />
                </PageLink>
            ) : (
                <span className={disabledControl} aria-disabled="true" role="link" aria-label="Page précédente">
                    <ChevronLeft aria-hidden="true" />
                </span>
            ),
        next:
            page < totalPages ? (
                <PageLink href={hrefFor({ page: page + 1 })} onNavigate={go} className={control} aria-label="Page suivante" rel="next">
                    <ChevronRight aria-hidden="true" />
                </PageLink>
            ) : (
                <span className={disabledControl} aria-disabled="true" role="link" aria-label="Page suivante">
                    <ChevronRight aria-hidden="true" />
                </span>
            ),
    };
}

/**
 * Barre du haut : le compte, « Page 2 sur 808 » entre deux flèches, et
 * « Lignes par page ». Porte l'`id` vers lequel la barre du bas ramène.
 */
export function AdminPaginationTop({
    info,
    noun,
    label,
    onNavigate,
    pending = false,
    resizable = true,
    query,
    anchorId,
}: AdminPaginationProps & { anchorId: string }) {
    const hrefFor = useHrefFor(query);
    const sizeId = useId();
    const { prev, next } = prevNextLinks({ info, hrefFor, go: onNavigate });
    const { from, to, total, page, totalPages, pageSize } = info;

    return (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {/* tabIndex -1 : la barre du bas y pose le focus après un changement de page. */}
            <p
                id={anchorId}
                tabIndex={-1}
                role="status"
                className="scroll-mt-20 text-sm text-muted-foreground outline-none"
            >
                {total === 0 ? (
                    <>{noun.feminine ? "Aucune" : "Aucun"} {noun.one}</>
                ) : (
                    <>
                        <span className="font-semibold text-foreground tabular-nums">
                            {nf.format(from)}–{nf.format(to)}
                        </span>{' '}
                        sur <span className="font-semibold text-foreground tabular-nums">{nf.format(total)}</span>{' '}
                        {total > 1 ? noun.many : noun.one}
                    </>
                )}
                {pending && <span className="sr-only"> — chargement…</span>}
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {totalPages > 1 && (
                    <nav aria-label={`${label} (haut)`} className="flex items-center gap-1.5">
                        {prev}
                        <span className="px-1 text-sm text-muted-foreground tabular-nums">
                            Page <span className="font-medium text-foreground">{nf.format(page)}</span> sur {nf.format(totalPages)}
                        </span>
                        {next}
                    </nav>
                )}
                {/* Pas sur téléphone : 100 lignes en cartes, c'est un long défilement. */}
                {resizable && total > ADMIN_PAGE_SIZES[0] && (
                    <div className="hidden items-center gap-2 sm:flex">
                        <label htmlFor={sizeId} className="text-sm text-muted-foreground whitespace-nowrap">
                            Lignes par page
                        </label>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(value) => {
                                const perPage = Number(value);
                                // Garde la première ligne affichée à l'écran : passer à 100
                                // depuis la page 7 mène à la page qui la contient, pas à la 1.
                                onNavigate(hrefFor({ perPage, page: Math.floor((from - 1) / perPage) + 1 }));
                            }}
                        >
                            <SelectTrigger id={sizeId} className="h-9 w-[4.5rem] bg-field border-border text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                {ADMIN_PAGE_SIZES.map((size) => (
                                    <SelectItem key={size} value={String(size)} className="text-foreground">
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Barre du bas : les numéros (sept cases, voir `pageSlots`) et « Aller à la
 * page ». Sur téléphone, seules la page courante et les flèches restent.
 */
export function AdminPaginationBottom({
    info,
    noun,
    label,
    onNavigate,
    pending = false,
    query,
    anchorId,
}: AdminPaginationProps & { anchorId: string }) {
    const hrefFor = useHrefFor(query);
    const jumpId = useId();
    const [jump, setJump] = useState('');
    const { page, totalPages, from, to, total } = info;

    if (totalPages <= 1) return null;

    // Retour en haut de la liste, focus compris — voir l'en-tête du fichier.
    const go = (href: string) => {
        onNavigate(href);
        const anchor = document.getElementById(anchorId);
        anchor?.focus({ preventScroll: true });
        anchor?.scrollIntoView({ block: 'start' });
    };
    const { prev, next } = prevNextLinks({ info, hrefFor, go });

    const submitJump = (e: React.FormEvent) => {
        e.preventDefault();
        const target = Number.parseInt(jump, 10);
        if (!Number.isFinite(target)) return;
        const clamped = Math.min(Math.max(target, 1), totalPages);
        setJump('');
        if (clamped !== page) go(hrefFor({ page: clamped }));
    };

    return (
        <div className={cn('flex flex-col items-center gap-3 sm:flex-row sm:justify-between', pending && 'opacity-60')}>
            <p className="hidden text-sm text-muted-foreground lg:block tabular-nums">
                {nf.format(from)}–{nf.format(to)} sur {nf.format(total)} {total > 1 ? noun.many : noun.one}
            </p>

            <nav aria-label={label}>
                <ul className="flex items-center gap-1.5">
                    <li>{prev}</li>
                    {pageSlots(page, totalPages).map((slot) =>
                        typeof slot === 'number' ? (
                            <li key={slot} className={slot === page ? undefined : 'hidden sm:block'}>
                                <PageLink
                                    href={hrefFor({ page: slot })}
                                    onNavigate={go}
                                    className={slot === page ? currentControl : control}
                                    aria-current={slot === page ? 'page' : undefined}
                                    aria-label={slot === page ? `Page ${slot}, page actuelle` : `Page ${slot}`}
                                >
                                    {nf.format(slot)}
                                </PageLink>
                            </li>
                        ) : (
                            <li key={slot} aria-hidden="true" className="hidden w-9 text-center text-muted-foreground sm:block">
                                …
                            </li>
                        ),
                    )}
                    <li>{next}</li>
                </ul>
            </nav>

            {totalPages > 7 ? (
                <form onSubmit={submitJump} className="flex items-center gap-2">
                    <label htmlFor={jumpId} className="text-sm text-muted-foreground whitespace-nowrap">
                        Aller à la page
                    </label>
                    <Input
                        id={jumpId}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={totalPages}
                        value={jump}
                        onChange={(e) => setJump(e.target.value)}
                        placeholder={String(page)}
                        className="h-9 w-20 bg-field border-border text-foreground tabular-nums"
                    />
                    <button type="submit" className={control}>
                        Aller
                    </button>
                </form>
            ) : (
                // Garde la barre centrée quand il n'y a pas de champ à droite.
                <span className="hidden lg:block lg:w-40" aria-hidden="true" />
            )}
        </div>
    );
}

/**
 * Une liste paginée complète : la barre du haut, la liste (`children`), la
 * barre du bas. `aside` se place au bout de la barre du haut — un bouton
 * « Effacer les filtres », par exemple.
 */
export function AdminPaginatedList({
    children,
    aside,
    ...props
}: AdminPaginationProps & { children: React.ReactNode; aside?: React.ReactNode }) {
    const anchorId = useId();
    return (
        <div aria-busy={props.pending} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <AdminPaginationTop {...props} anchorId={anchorId} />
                </div>
                {aside}
            </div>
            <div className={cn('transition-opacity', props.pending && 'opacity-60')}>{children}</div>
            <AdminPaginationBottom {...props} anchorId={anchorId} />
        </div>
    );
}
