// app/books/search-bar.tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Input } from "@/components/ui/input";

export default function SearchBar() {
    const [searchTerm, setSearchTerm] = React.useState('');
    const router = useRouter();

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) =>
        setSearchTerm(e.target.value);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        router.push(`/books?search=${encodeURIComponent(searchTerm)}`);
    };

    return (
        <form onSubmit={handleSubmit} className="mb-4">
            <Input
                placeholder="Search books..."
                value={searchTerm}
                onChange={handleSearch}
            />
        </form>
    );
}