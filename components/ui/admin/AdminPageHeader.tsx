import React from 'react';
import { CardTitle } from '@/components/ui/card';
import { SECTION_ICONS, sectionAccent } from '@/components/admin/section-icons';
import { cn } from '@/lib/utils';

/**
 * The title row of an admin page: the section's icon in its colour, the h1,
 * the « Aide » link, an optional sentence under them, and the page's buttons.
 *
 * Each page wrote its own, and the same h1 came out in five sizes (30 px bold
 * on Attributions, 24 px bold on Factures, 24 px semibold on Demandes, 20 px on
 * Statistiques…) — moving from one list to the next, the heading jumped. Only
 * Demandes carried its section icon, which the menu and the dashboard card show
 * for every section. Here the title is the plain CardTitle and every page has
 * its icon.
 *
 * Only the row: it goes inside the page's own <CardHeader>, which may hold
 * more below it (tabs, a search box).
 */
export function AdminPageHeader({
    title,
    section,
    aide,
    description,
    actions,
    inDossier = false,
    className,
}: {
    /** The h1's text, a count included where the page shows one: « Équipe (15) ». */
    title: React.ReactNode;
    /** The section's name in components/admin/section-icons.ts — its icon and colour. */
    section: string;
    /**
     * The page's AideLink element, written by the page itself: `pnpm aide:check`
     * reads the section from that tag, on its own line.
     */
    aide?: React.ReactNode;
    /** A sentence under the title. */
    description?: React.ReactNode;
    /** The page's buttons, at the right (under the title on a phone). */
    actions?: React.ReactNode;
    /**
     * Inside a member's dossier the tab above already names the list: the title
     * stays for screen readers only, as an h2, and the icon goes.
     */
    inDossier?: boolean;
    className?: string;
}) {
    const Icon = SECTION_ICONS[section];
    const accent = sectionAccent(section);

    return (
        <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
            <div className="flex min-w-0 items-center gap-3">
                {Icon && !inDossier && (
                    <span
                        aria-hidden="true"
                        className={cn('hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg border sm:flex', accent.bg, accent.border, accent.text)}
                    >
                        <Icon className="h-5 w-5" />
                    </span>
                )}
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <CardTitle as={inDossier ? 'h2' : 'h1'} className={inDossier ? 'sr-only' : 'text-foreground'}>
                            {title}
                        </CardTitle>
                        {aide}
                    </div>
                    {description && <div className="text-sm text-muted-foreground">{description}</div>}
                </div>
            </div>
            {actions && <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{actions}</div>}
        </div>
    );
}
