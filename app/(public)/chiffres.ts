import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { effectivelyActiveWhere } from '@/lib/users/activityStatus';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { getCatalogueData } from './catalogue/data';

export interface HomeFigures {
    /** Lecteurs whose effective status is Actif today. */
    lecteurs: number;
    /** Auditeurs whose effective status is Actif today. */
    auditeurs: number;
    /** Attributions returned to the ECA over the last twelve months. */
    enregistrements: number;
    /** Titles on the public catalogue — the same count the catalogue page shows. */
    titres: number;
}

/**
 * The figures behind the « Aujourd'hui aux ECA » sentences on the home page.
 *
 * Counts only, never a name or a title: the auditeurs are the people this
 * association serves, and nothing on a public page should let anyone work out
 * who asked for what.
 *
 * - « Actifs » is the effective status (lib/users/activityStatus.ts), the same
 *   rule the member lists and the statistics use — an unavailability window
 *   that has ended counts as Actif.
 * - An enregistrement is an attribution the lecteur has returned
 *   (`returnedToECADate`), over a rolling twelve months rather than « depuis le
 *   1er janvier », which would read « 3 livres » every January.
 * - The title count is read through getCatalogueData, so it is the catalogue
 *   page's own number; the entry carries the `catalogue` tag too, so a book
 *   write refreshes both together.
 *
 * No tag of its own: none of the other writes that move these numbers (a
 * status change, a returned attribution) is worth a purge for a sentence that
 * is fine an hour late — `revalidate` keeps it current enough.
 *
 * May throw; the page renders nothing rather than zeros.
 */
export const getHomeFigures = unstable_cache(
    async (): Promise<HomeFigures> => {
        const now = new Date();
        const yearAgo = new Date(now);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);

        const [lecteurs, auditeurs, enregistrements, catalogue] = await Promise.all([
            prisma.user.count({ where: { memberType: 'lecteur', ...effectivelyActiveWhere(now) } }),
            prisma.user.count({ where: { memberType: 'auditeur', ...effectivelyActiveWhere(now) } }),
            prisma.assignment.count({ where: { returnedToECADate: { gte: yearAgo, lte: now } } }),
            getCatalogueData(),
        ]);

        return { lecteurs, auditeurs, enregistrements, titres: catalogue.totalBooks };
    },
    ['home-figures'],
    { tags: [CACHE_TAGS.catalogue], revalidate: 3600 },
);
