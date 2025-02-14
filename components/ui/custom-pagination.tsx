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
}

export const CustomPagination: React.FC<CustomPaginationProps> = ({
                                                                      currentPage,
                                                                      totalPages,
                                                                      onPageChange,
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

    return (
        <Pagination className="mt-4 sm:mt-8">
            <PaginationContent className="gap-1 sm:gap-2">
                {/* First page button - desktop only */}
                {!isMobile && (
                    <PaginationItem className="hidden sm:block">
                        <PaginationLink
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                onPageChange(1);
                            }}
                            className="px-2 sm:px-3 py-1 sm:py-2 border border-gray-600 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm sm:text-base"
                        >
                            ⟪
                        </PaginationLink>
                    </PaginationItem>
                )}

                {/* Previous button */}
                <PaginationItem>
                    <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            if (currentPage > 1) onPageChange(currentPage - 1);
                        }}
                        className="px-2 sm:px-3 py-1 sm:py-2 border border-gray-600 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm sm:text-base"
                    >
                        ←
                    </PaginationPrevious>
                </PaginationItem>

                {/* Page numbers */}
                {getPageNumbers().map((page, index) => (
                    typeof page === 'number' ? (
                        <PaginationItem key={index}>
                            <PaginationLink
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    onPageChange(page);
                                }}
                                className={`px-2 sm:px-4 py-1 sm:py-2 border border-gray-600 rounded-lg text-sm sm:text-base ${
                                    currentPage === page
                                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                                        : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                }`}
                            >
                                {page}
                            </PaginationLink>
                        </PaginationItem>
                    ) : (
                        <span
                            key={index}
                            className="px-1 sm:px-2 py-1 sm:py-2 text-gray-400 text-sm sm:text-base hidden sm:inline"
                        >
                            {page}
                        </span>
                    )
                ))}

                {/* Next button */}
                <PaginationItem>
                    <PaginationNext
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            if (currentPage < totalPages) onPageChange(currentPage + 1);
                        }}
                        className="px-2 sm:px-3 py-1 sm:py-2 border border-gray-600 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm sm:text-base"
                    >
                        →
                    </PaginationNext>
                </PaginationItem>

                {/* Last page button - desktop only */}
                {!isMobile && (
                    <PaginationItem className="hidden sm:block">
                        <PaginationLink
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                onPageChange(totalPages);
                            }}
                            className="px-2 sm:px-3 py-1 sm:py-2 border border-gray-600 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm sm:text-base"
                        >
                            ⟫
                        </PaginationLink>
                    </PaginationItem>
                )}
            </PaginationContent>
        </Pagination>
    );
};

export default CustomPagination;