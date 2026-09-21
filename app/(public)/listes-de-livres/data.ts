import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { toPublicBook } from '@/lib/books/publicBook';

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
        const [rows, total] = await Promise.all([
            prisma.coupsDeCoeur.findMany({
                where: { active: true },
                // `select`, not `include`: this feeds the public page directly, and
                // it only ever reads id/title/description/audioPath off a coup de
                // cœur — the staff name that added it, and the raw timestamps, have
                // no reason to ship to every visitor.
                select: {
                    id: true,
                    title: true,
                    description: true,
                    audioPath: true,
                    books: {
                        // Nested relation filter: the global soft-delete extension
                        // (lib/prisma.ts) only patches direct `book.*` calls, so
                        // deletedAt needs stating here too, same as hiddenFromCatalogue.
                        where: { book: { hiddenFromCatalogue: false, deletedAt: null } },
                        select: {
                            book: {
                                include: {
                                    genres: { include: { genre: true } },
                                },
                            },
                        },
                    },
                },
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.coupsDeCoeur.count({ where: { active: true } }),
        ]);

        const items = rows.map((coup) => ({
            ...coup,
            books: coup.books.map((b) => ({ ...b, book: toPublicBook(b.book) })),
        }));

        return { items, total };
    },
    ['coups-de-coeur-page-v1'],
    { tags: [CACHE_TAGS.coupsDeCoeur], revalidate: 3600 },
);
