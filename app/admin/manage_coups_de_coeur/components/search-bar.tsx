// app/admin/manage_coups_de_coeur/components/search-bar.tsx
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
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', '1');

        if (debouncedValue) {
            params.set('search', debouncedValue);
        } else {
            params.delete('search');
        }

        router.push(`/admin/manage_coups_de_coeur?${params.toString()}`);
        router.refresh();
    }, [debouncedValue, router, searchParams]);

    return (
        <div className="mb-4">
            <Input
                type="search"
                placeholder="Search by title, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
            />
        </div>
    );
}