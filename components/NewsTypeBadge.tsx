// components/NewsTypeBadge.tsx
import React from 'react';
import { NewsType, newsTypeLabels, newsTypeColors } from '@/types/news';  // Adjust import path as needed

interface NewsTypeBadgeProps {
    type: NewsType;
}

const NewsTypeBadge: React.FC<NewsTypeBadgeProps> = ({ type }) => {
    const baseClasses = 'px-2 py-1 rounded-full text-sm font-medium';
    const colorClasses = newsTypeColors[type] || 'bg-gray-500';
    const textColor = type === 'ANNONCE' ? 'text-gray-900' : 'text-white';

    return (
        <span className={`${baseClasses} ${colorClasses} ${textColor}`}>
            {newsTypeLabels[type] || type}
        </span>
    );
};

export default NewsTypeBadge;