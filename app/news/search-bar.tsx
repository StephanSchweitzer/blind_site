'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from "@/components/ui/input";
import { useDebounce } from 'use-debounce';

export default function SearchBar() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [debouncedValue] = useDebounce(searchTerm, 300);

    useEffect(() => {
        // Create new URLSearchParams object
        const params = new URLSearchParams(searchParams);

        // Reset to page 1 when search changes
        params.set('page', '1');

        if (debouncedValue) {
            params.set('search', debouncedValue);
        } else {
            params.delete('search');
        }

        // Update the URL with the new search params
        router.push(`/news?${params.toString()}`);
    }, [debouncedValue, router, searchParams]);

    return (
        <div className="mb-4">
            <Input
                type="search"
                placeholder="Search articles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
            />
        </div>
    );
}