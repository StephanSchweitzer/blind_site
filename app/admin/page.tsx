// app/admin/page.tsx
import { prisma } from '@/lib/prisma';
import { AdminCard } from '@/components/ui/admin';
import { AdminDashboardCard } from '@/components/ui/admin/AdminDashboardCard';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
    const [
        bookCount,
        newsCount,
        genreCount,
        coupsDeCoeurCount,
        userCount,
        assignmentCount,
        orderCount,
        billCount,

    ] = await Promise.all([
        prisma.book.count(),
        prisma.news.count(),
        prisma.genre.count(),
        prisma.coupsDeCoeur.count(),
        prisma.user.count(),
        prisma.assignment.count(),
        prisma.orders.count(),
        prisma.bill.count()
    ]);

    return (
        <AdminCard className="p-6 md:p-8">
            {/* Content Management Section */}
            <div className="mb-10">
                <h2 className="text-lg font-semibold text-gray-300 mb-4 px-1">Contenu</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
                        buttonText="Gestion des genres possibles associés aux livres"
                        accentColor="purple"
                    />

                    <AdminDashboardCard
                        title="Listes de livres"
                        count={coupsDeCoeurCount}
                        href="/admin/manage_coups_de_coeur"
                        buttonText="Gestion des listes de livres (anciennement appelés « coups de cœur »)"
                        accentColor="pink"
                    />

                    <AdminDashboardCard
                        title="Dernières infos"
                        count={newsCount}
                        href="/admin/news"
                        buttonText="Gestion des informations importantes et actuelles"
                        accentColor="green"
                    />
                </div>
            </div>

            {/* Operations & Admin Section */}
            <div>
                <h2 className="text-lg font-semibold text-gray-300 mb-4 px-1">Gestion</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    <AdminDashboardCard
                        title="Demandes"
                        count={orderCount}
                        href="/admin/orders"
                        buttonText="Gestion des demandes d'enregistrements audio"
                        accentColor="yellow"
                    />

                    <AdminDashboardCard
                        title="Affectations"
                        count={assignmentCount}
                        href="/admin/assignments"
                        buttonText="Gestion des affectations confiées aux lecteurs"
                        accentColor="cyan"
                    />

                    <AdminDashboardCard
                        title="Factures"
                        count={billCount}
                        href="/admin/bills"
                        buttonText="Gestion des factures"
                        accentColor="orange"
                    />

                    <AdminDashboardCard
                        title="Lecteurs"
                        count={userCount}
                        href="/admin/users/lecteurs"
                        buttonText="Gestion des lecteurs"
                        accentColor="orange"
                    />

                    <AdminDashboardCard
                        title="Auditeurs"
                        count={userCount}
                        href="/admin/users/auditeurs"
                        buttonText="Gestion des auditeurs"
                        accentColor="orange"
                    />
                </div>
            </div>
        </AdminCard>
    );
}