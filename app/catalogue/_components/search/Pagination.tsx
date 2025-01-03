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
    return (
        <div className="flex justify-center gap-2 mt-8">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 border rounded-lg bg-white text-gray-800 hover:bg-gray-100 disabled:opacity-70 disabled:bg-gray-200"
            >
                Previous
            </button>
            <div className="flex gap-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                        key={page}
                        onClick={() => onPageChange(page)}
                        className={`px-4 py-2 border rounded-lg ${
                            currentPage === page
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-white text-gray-800 hover:bg-gray-100'
                        }`}
                    >
                        {page}
                    </button>
                ))}
            </div>
            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border rounded-lg bg-white text-gray-800 hover:bg-gray-100 disabled:opacity-70 disabled:bg-gray-200"
            >
                Next
            </button>
        </div>
    );
};