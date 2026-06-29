// components/ui/admin/AdminSearch.tsx
export function AdminSearch({
                                placeholder = "Search..."
                            }: {
    placeholder?: string
}) {
    return (
        <div className="mb-4">
            <input
                type="text"
                placeholder={placeholder}
                className="w-full h-11 px-3 rounded-md border border-input
                         bg-background text-foreground text-base placeholder:text-muted-foreground
                         focus:border-ring focus:ring-1 focus:ring-ring"
            />
        </div>
    );
}
