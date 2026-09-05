import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';

/**
 * Une liste par page — chaque coup de cœur occupe la page entière.
 *
 * Exporté parce que /api/listes-de-livres/position traduit un résultat de
 * recherche en numéro de page et a besoin de la MÊME valeur : elle y était
 * recopiée sous la forme d'un « assuming 1 item per page », que rien ne
 * rattachait à celle-ci.
 */
export const COUPS_DE_COEUR_PAGE_SIZE = 1;

/**
 * Cached, paginated active "Coups de cœur" (one cache entry per page, all under
 * the `coups-de-coeur` tag). Invalidated on demand when an admin creates/edits/
 * deletes a coup or changes its books; `revalidate` is only a long fallback.
 */
export const getCoupsDeCoeurPage = unstable_cache(
    async (page: number, pageSize: number) => {
        const [items, total] = await Promise.all([
            prisma.coupsDeCoeur.findMany({
                where: { active: true },
                include: {
                    books: {
                        where: { book: { hiddenFromCatalogue: false } },
                        include: {
                            book: {
                                include: {
                                    genres: { include: { genre: true } },
                                },
                            },
                        },
                    },
                    addedBy: { select: { name: true } },
                },
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.coupsDeCoeur.count({ where: { active: true } }),
        ]);

        return { items, total };
    },
    ['coups-de-coeur-page-v1'],
    { tags: [CACHE_TAGS.coupsDeCoeur], revalidate: 3600 },
);
