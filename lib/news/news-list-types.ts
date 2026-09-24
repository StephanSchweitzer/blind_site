import type { RescueSuggestion } from '@/lib/search-suggestion-types';
import type { NewsType } from '@/types/news';
import { ADMIN_PAGE_SIZE } from '@/lib/pagination';

/**
 * Les formes échangées entre lib/news/newsList.ts (serveur) et la table de
 * /admin/news (client). À part parce que newsList est `server-only`.
 */

export const NEWS_SEARCH_FIELDS = ['all', 'title', 'content', 'author'] as const;
export type NewsSearchField = (typeof NEWS_SEARCH_FIELDS)[number];

export const NEWS_SEARCH_FIELD_LABELS: Record<NewsSearchField, string> = {
    all: 'Tous les champs',
    title: 'Titre',
    content: 'Contenu',
    author: 'Auteur',
};

export const ADMIN_NEWS_PAGE_SIZE = ADMIN_PAGE_SIZE;

export interface AdminNewsQuery {
    search: string;
    field: NewsSearchField;
    type: NewsType | null;
    page: number;
    limit: number;
    /** « Vouliez-vous dire … ? » quand la recherche ne trouve rien. */
    suggest: boolean;
}

export interface AdminNewsRow {
    id: number;
    title: string;
    /** ISO. */
    publishedAt: string;
    type: NewsType;
    author: { name: string | null } | null;
    /**
     * Le passage du contenu où la recherche a trouvé quelque chose, quand le
     * titre ne suffit pas à expliquer pourquoi la ligne est là. Null sinon.
     */
    excerpt: string | null;
}

export interface AdminNewsResult {
    items: AdminNewsRow[];
    total: number;
    page: number;
    totalPages: number;
    /** Par type, sous la recherche courante mais SANS le filtre de type — pour les pastilles. */
    typeCounts: Record<NewsType, number>;
    /** Toutes les infos de la recherche courante, tous types confondus. */
    allCount: number;
    searchSuggestions?: RescueSuggestion[];
}
