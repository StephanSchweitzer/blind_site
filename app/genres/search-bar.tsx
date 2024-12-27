// app/genres/search-bar.tsx
'use client';

import { Input } from '@/components/ui/input';

export default function SearchBar() {
    return (
        <div className="w-full max-w-md">
            <Input
                type="search"
                placeholder="Search genres..."
                className="w-full"
                onChange={(e) => {
                    // TODO: Implement search functionality
                    console.log(e.target.value);
                }}
            />
        </div>
    );
}