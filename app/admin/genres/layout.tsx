// app/genres/layout.tsx
import BackendNavbar from '@/components/Backend-Navbar';

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