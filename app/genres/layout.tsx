// app/genres/layout.tsx
import Navbar from '@/components/Navbar';

export default function GenresLayout({
                                         children,
                                     }: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            {children}
        </div>
    );
}