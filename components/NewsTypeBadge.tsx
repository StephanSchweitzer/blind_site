// components/NewsTypeBadge.tsx
import React from 'react';
import {
    NewsType,
    newsTypeLabels,
    getNewsTypeColor,
    getNewsTypeTextColor,
} from '@/types/news';

interface NewsTypeBadgeProps {
    type: NewsType;
    /** Extra layout classes. Colours always come from the shared palette. */
    className?: string;
}

/**
 * The type badge, front office and back office alike. Both used to style their
 * own — the back office ended up with white text on a light background — so the
 * colour now lives in one place: `newsTypeColors` in types/news.ts.
 */
const NewsTypeBadge: React.FC<NewsTypeBadgeProps> = ({ type, className }) => (
    <span
        className={`inline-flex items-center rounded-full px-2 py-1 text-sm font-medium ${getNewsTypeColor(type)} ${getNewsTypeTextColor(type)} ${className ?? ''}`}
    >
        {newsTypeLabels[type] || type}
    </span>
);

export default NewsTypeBadge;
