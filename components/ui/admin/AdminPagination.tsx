// components/ui/admin/AdminPagination.tsx
import Link from 'next/link';
import { Button } from "@/components/ui/button";

export function AdminPagination({
                                    currentPage,
                                    totalPages,
                                    baseUrl,
                                    searchTerm = ''
                                }: {
    currentPage: number;
    totalPages: number;
    baseUrl: string;
    searchTerm?: string;
}) {
    return (
        <>
            <div className="flex flex-wrap justify-center items-center gap-2 mt-4">
                {Array.from({ length: totalPages }, (_, index) => (
                    <Link
                        key={index + 1}
                        href={`${baseUrl}?page=${index + 1}&search=${searchTerm}`}
                    >
                        <Button
                            variant={currentPage === index + 1 ? "default" : "outline"}
                            size="sm"
                            className={`min-h-11 min-w-11 ${currentPage === index + 1
                                ? "bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:bg-muted/50"}`}
                        >
                            {index + 1}
                        </Button>
                    </Link>
                ))}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-2">
                Page {currentPage} of {totalPages}
            </p>
        </>
    );
}