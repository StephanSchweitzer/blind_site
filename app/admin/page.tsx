// app/admin/page.tsx
import { prisma } from '@/lib/prisma';
import { AdminCard } from '@/components/ui/admin';
import { AdminDashboardCard } from '@/components/ui/admin/AdminDashboardCard';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
    const [bookCount, newsCount, genreCount, coupsDeCoeurCount] = await Promise.all([
        prisma.book.count(),
        prisma.news.count(),
        prisma.genre.count(),
        prisma.coupsDeCoeur.count(),
    ]);

    return (
        <AdminCard className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AdminDashboardCard
                    title="Catalogue"
                    count={bookCount}
                    href="/admin/books"
                    buttonText="Gestion du catalogue"
                    accentColor="blue"
                />

                <AdminDashboardCard
                    title="Genres"
                    count={genreCount}
                    href="/admin/genres"
                    buttonText="Gestion des genres"
                    accentColor="purple"
                />

                <AdminDashboardCard
                    title="Dernières infos"
                    count={newsCount}
                    href="/admin/news"
                    buttonText="Gestion des dernières infos"
                    accentColor="green"
                />

                <AdminDashboardCard
                    title="Listes de livres"
                    count={coupsDeCoeurCount}
                    href="/admin/manage_coups_de_coeur"
                    buttonText="Gestion des listes de livres"
                    accentColor="pink"
                />
            </div>
        </AdminCard>

    );
}