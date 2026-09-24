// app/admin/news/page.tsx
import { ArticlesTable } from './articles-table';
import { listAdminNews, parseAdminNewsQuery, type AdminNewsResult } from '@/lib/news/newsList';
import { pageInfo, parsePageSizeParam, redirectPastLastPage } from '@/lib/pagination';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

/**
 * Premier rendu seulement : ensuite la table interroge /api/news/search
 * elle-même, pendant la frappe, sans refaire cette page — le même partage que
 * /admin/books. Les deux passent par listAdminNews (lib/news/newsList.ts).
 */
export default async function Articles({ searchParams }: PageProps) {
    const params = await searchParams;
    // La taille de page vient de `?perPage=`, comme sur les autres listes ;
    // `limit` reste le nom du paramètre de /api/news/search.
    const query = { ...parseAdminNewsQuery((key) => params[key]), limit: parsePageSizeParam(params.perPage) };

    let initial: AdminNewsResult;
    try {
        initial = await listAdminNews({ ...query, suggest: true });
    } catch (error) {
        console.error('Error fetching articles:', error);
        initial = {
            items: [],
            total: 0,
            page: query.page,
            totalPages: 0,
            typeCounts: { GENERAL: 0, EVENEMENT: 0, ANNONCE: 0, ACTUALITE: 0, PROGRAMMATION: 0 },
            allCount: 0,
        };
    }

    redirectPastLastPage('/admin/news', params, pageInfo(query.page, query.limit, initial.total), initial.items.length);

    return (
        <div className="space-y-4">
            <ArticlesTable initial={initial} initialQuery={query} />
        </div>
    );
}
