// Shown in the content area while a tab's table loads. The header + tab nav
// come from layout.tsx and stay mounted, so this skeleton is content-only.
export default function DossierTabLoading() {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 animate-pulse">
            <div className="flex items-center justify-between mb-6 gap-4">
                <div className="h-7 w-40 bg-gray-800 rounded" />
                <div className="flex gap-3">
                    <div className="h-9 w-40 bg-gray-800 rounded" />
                    <div className="h-9 w-32 bg-gray-800 rounded" />
                </div>
            </div>

            <div className="border border-gray-800 rounded-lg overflow-hidden">
                <div className="bg-gray-800 h-11 flex items-center gap-4 px-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-3 bg-gray-700 rounded flex-1" />
                    ))}
                </div>
                {Array.from({ length: 8 }).map((_, r) => (
                    <div
                        key={r}
                        className="h-14 flex items-center gap-4 px-4 border-t border-gray-800"
                    >
                        {Array.from({ length: 5 }).map((_, c) => (
                            <div key={c} className="h-3 bg-gray-800 rounded flex-1" />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}