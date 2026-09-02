'use client';

import React, { useEffect, useState } from 'react';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"

interface CustomPaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    /** Distinguishes the landmark when a page shows pagination more than once —
     *  two navigation regions both called "Pagination" are indistinguishable in
     *  a screen reader's landmark list (RGAA 12.6). */
    label?: string;
}

// Shared look for every control. The former hardcoded `bg-gray-700 text-gray-200`
// painted dark chips onto the light theme and left the ellipsis at gray-400 on a
// near-white page (~2.5:1, below the 4.5:1 floor) — theme tokens keep both themes
// above the ratio (RGAA 3.2).
const controlClasses =
    'px-2 sm:px-3 py-1 sm:py-2 border border-input rounded-lg bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground text-sm sm:text-base disabled:opacity-50 disabled:pointer-events-none';

export const CustomPagination: React.FC<CustomPaginationProps> = ({
                                                                      currentPage,
                                                                      totalPages,
                                                                      onPageChange,
                                                                      label = 'Pagination',
                                                                  }) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const getPageNumbers = () => {
        const pageNumbers = [];

        if (isMobile) {
            // Mobile: Only show current page
            return [currentPage];
        }

        // Desktop layout
        pageNumbers.push(1);
        let start = Math.max(2, currentPage - 1);
        let end = Math.min(totalPages - 1, currentPage + 1);

        if (currentPage <= 3) {
            end = Math.min(4, totalPages - 1);
        }
        if (currentPage >= totalPages - 2) {
            start = Math.max(totalPages - 3, 2);
        }

        if (start > 2) {
            pageNumbers.push('...');
        }

        for (let i = start; i <= end; i++) {
            pageNumbers.push(i);
        }

        if (end < totalPages - 1) {
            pageNumbers.push('...');
        }

        if (totalPages > 1) {
            pageNumbers.push(totalPages);
        }

        return pageNumbers;
    };

    const isFirst = currentPage <= 1;
    const isLast = currentPage >= totalPages;

    return (
        <Pagination aria-label={label} className="mt-4 sm:mt-8">
            {/* On mobile only the current page is rendered, so without this the
                position in the set is never announced at all. */}
            <p className="sr-only">Page {currentPage} sur {totalPages}</p>
            <PaginationContent className="gap-1 sm:gap-2">
                {/* First page button - desktop only */}
                {!isMobile && (
                    <PaginationItem className="hidden sm:block">
                        <PaginationLink
                            onClick={() => onPageChange(1)}
                            disabled={isFirst}
                            aria-label="Aller à la première page"
                            className={controlClasses}
                        >
                            <span aria-hidden="true">⟪</span>
                        </PaginationLink>
                    </PaginationItem>
                )}

                {/* Previous button */}
                <PaginationItem>
                    <PaginationPrevious
                        onClick={() => {
                            if (currentPage > 1) onPageChange(currentPage - 1);
                        }}
                        disabled={isFirst}
                        aria-label="Aller à la page précédente"
                        className={controlClasses}
                    >
                        <span aria-hidden="true">←</span>
                    </PaginationPrevious>
                </PaginationItem>

                {/* Page numbers */}
                {getPageNumbers().map((page, index) => (
                    typeof page === 'number' ? (
                        <PaginationItem key={index}>
                            <PaginationLink
                                onClick={() => onPageChange(page)}
                                isActive={currentPage === page}
                                // Bare "3" tells a screen-reader user nothing about what
                                // activating it does (RGAA 6.1); aria-current marks where
                                // they already are.
                                aria-label={currentPage === page ? `Page ${page}, page actuelle` : `Aller à la page ${page}`}
                                className={`px-2 sm:px-4 py-1 sm:py-2 border rounded-lg text-sm sm:text-base ${
                                    currentPage === page
                                        ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                                        : 'border-input bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
                                }`}
                            >
                                {page}
                            </PaginationLink>
                        </PaginationItem>
                    ) : (
                        <span
                            key={index}
                            aria-hidden="true"
                            className="px-1 sm:px-2 py-1 sm:py-2 text-muted-foreground text-sm sm:text-base hidden sm:inline"
                        >
                            {page}
                        </span>
                    )
                ))}

                {/* Next button */}
                <PaginationItem>
                    <PaginationNext
                        onClick={() => {
                            if (currentPage < totalPages) onPageChange(currentPage + 1);
                        }}
                        disabled={isLast}
                        aria-label="Aller à la page suivante"
                        className={controlClasses}
                    >
                        <span aria-hidden="true">→</span>
                    </PaginationNext>
                </PaginationItem>

                {/* Last page button - desktop only */}
                {!isMobile && (
                    <PaginationItem className="hidden sm:block">
                        <PaginationLink
                            onClick={() => onPageChange(totalPages)}
                            disabled={isLast}
                            aria-label="Aller à la dernière page"
                            className={controlClasses}
                        >
                            <span aria-hidden="true">⟫</span>
                        </PaginationLink>
                    </PaginationItem>
                )}
            </PaginationContent>
        </Pagination>
    );
};

export default CustomPagination;
