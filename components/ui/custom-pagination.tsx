import React from 'react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
                                                          currentPage,
                                                          totalPages,
                                                          onPageChange,
                                                      }) => {
    const getPageNumbers = () => {
        const pageNumbers = [];
        const showPages = 5; // Total number of page buttons to show (including ellipsis)

        if (totalPages <= showPages) {
            // If total pages is less than or equal to showPages, show all pages
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }

        // Always add first page
        pageNumbers.push(1);

        // Calculate start and end of page numbers around current page
        let start = Math.max(2, currentPage - 1);
        let end = Math.min(totalPages - 1, currentPage + 1);

        // Adjust start and end to show more numbers if we're at the beginning or end
        if (currentPage <= 3) {
            end = 4;
        }
        if (currentPage >= totalPages - 2) {
            start = totalPages - 3;
        }

        // Add ellipsis before middle numbers if needed
        if (start > 2) {
            pageNumbers.push('...');
        }

        // Add middle numbers
        for (let i = start; i <= end; i++) {
            pageNumbers.push(i);
        }

        // Add ellipsis after middle numbers if needed
        if (end < totalPages - 1) {
            pageNumbers.push('...');
        }

        // Always add last page
        if (totalPages > 1) {
            pageNumbers.push(totalPages);
        }

        return pageNumbers;
    };

    return (
        <div className="flex justify-center items-center gap-2 mt-8">
            <button
                onClick={() => onPageChange(1)}
                disabled={currentPage === 1}
                className="px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:bg-gray-800"
            >
                ⟪
            </button>
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:bg-gray-800"
            >
                ←
            </button>
            <div className="flex gap-2">
                {getPageNumbers().map((page, index) => (
                    typeof page === 'number' ? (
                        <button
                            key={index}
                            onClick={() => onPageChange(page)}
                            className={`px-4 py-2 border border-gray-600 rounded-lg ${
                                currentPage === page
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                            }`}
                        >
                            {page}
                        </button>
                    ) : (
                        <span
                            key={index}
                            className="px-4 py-2 text-gray-400"
                        >
                            {page}
                        </span>
                    )
                ))}
            </div>
            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:bg-gray-800"
            >
                →
            </button>
            <button
                onClick={() => onPageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:bg-gray-800"
            >
                ⟫
            </button>
        </div>
    );
};

export default Pagination;