// app/news/search-bar.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';

export default function SearchBar() {
    const [searchTerm, setSearchTerm] = useState('');
    const router = useRouter();

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) =>
        setSearchTerm(e.target.value);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        router.push(`/news?search=${encodeURIComponent(searchTerm)}`);
    };

    return (
        <form onSubmit={handleSubmit} className="mb-4">
            <Input
                placeholder="Search articles..."
                value={searchTerm}
                onChange={handleSearch}
            />
        </form>
    );
}
