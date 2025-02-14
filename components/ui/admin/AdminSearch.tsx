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
                className="w-full p-2 rounded-md border border-gray-800
                         bg-gray-900/50 text-gray-300 placeholder-gray-500
                         focus:border-gray-700 focus:ring-1 focus:ring-gray-700"
            />
        </div>
    );
}
