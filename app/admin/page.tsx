// app/admin/page.tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { AdminCard } from '@/components/ui/admin';
import { AdminDashboardCard } from '@/components/ui/admin/AdminDashboardCard';
import { getFreeReaderCount } from '@/lib/users/availabilityData';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
    const me = await getCurrentUser();
    const isSuper = isSuperAdmin(me?.accessLevel);
    const [
        [
            bookCount,
            newsCount,
            genreCount,
            coupsDeCoeurCount,
            reviewCount,
            orphanAudioCount,
            lecteursCount,
            auditeursCount,
            bienfaiteursCount,
            permanentsCount,
            assignmentCount,
            orderCount,
            billCount,
            paymentCount,
            siteContactCount,
            teamMemberCount,
            historyEventCount,
            practicalInfoCount,
            membershipCount,
        ],
        // Active lecteurs with no attribution in progress — the count the
        // Disponibilités card leads with.
        freeReaderCount,
    ] = await Promise.all([
        Promise.all([
            prisma.book.count(),
            prisma.news.count(),
            prisma.genre.count(),
            prisma.coupsDeCoeur.count(),
            prisma.book.count({ where: { needsReview: true } }),
            // Folders in the bucket no book claims, minus those already handled.
            prisma.orphanAudioFolder.count({ where: { resolvedAt: null, dismissedAt: null } }),
            prisma.user.count({ where: { memberType: 'lecteur' } }),
            prisma.user.count({ where: { memberType: 'auditeur' } }),
            prisma.user.count({ where: { memberType: 'bienfaiteur' } }),
            prisma.user.count({ where: { accessLevel: { in: ['admin', 'super_admin'] } } }),
            prisma.assignment.count(),
            prisma.orders.count(),
            prisma.bill.count(),
            prisma.payment.count(),
            prisma.siteContact.count(),
            prisma.teamMember.count(),
            prisma.historyEvent.count(),
            prisma.practicalInfo.count(),
            prisma.membershipOption.count(),
        ]),
        getFreeReaderCount(),
    ]);

    return (
        <AdminCard className="p-6 md:p-8">
            {/* Content Management Section */}
            <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground mb-4 px-1">Livres</h2>
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
                        href="/admin/listes-de-livres"
                        buttonText="Gestion des listes de livres (anciennement appelés « coups de cœur »)"
                        accentColor="pink"
                    />
                    <AdminDashboardCard
                        title="Doublons"
                        count={reviewCount}
                        href="/admin/review"
                        buttonText="Révision et fusion des doublons potentiels du catalogue"
                        accentColor="orange"
                    />
                    <AdminDashboardCard
                        title="Audio orphelin"
                        count={orphanAudioCount}
                        href="/admin/audio-orphelins"
                        buttonText="Dossiers audio du stockage qu’aucun livre ne revendique"
                        accentColor="teal"
                    />
                </div>
            </div>

            {/* Operations Section */}
            <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground mb-4 px-1">Gestion</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    <AdminDashboardCard
                        title="Demandes"
                        count={orderCount}
                        href="/admin/orders"
                        buttonText="Gestion des demandes d'enregistrements audio"
                        accentColor="yellow"
                    />
                    <AdminDashboardCard
                        title="Attributions"
                        count={assignmentCount}
                        href="/admin/assignments"
                        buttonText="Gestion des attributions confiées aux lecteurs"
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
                        title="Paiements"
                        count={paymentCount}
                        href="/admin/payments"
                        buttonText="Gestion des paiements (cotisations, dons, enregistrements)"
                        accentColor="green"
                    />
                </div>
            </div>

            {/* Members Section */}
            <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground mb-4 px-1">Membres</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    <AdminDashboardCard
                        title="Auditeurs"
                        count={auditeursCount}
                        href="/admin/users/auditeurs"
                        buttonText="Gestion des auditeurs"
                        accentColor="teal"
                    />
                    <AdminDashboardCard
                        title="Lecteurs"
                        count={lecteursCount}
                        href="/admin/users/lecteurs"
                        buttonText="Gestion des lecteurs"
                        accentColor="indigo"
                    />
                    <AdminDashboardCard
                        title="Donateurs"
                        count={bienfaiteursCount}
                        href="/admin/users/bienfaiteurs"
                        buttonText="Gestion des donateurs"
                        accentColor="pink"
                    />
                    <AdminDashboardCard
                        title="Permanents"
                        count={permanentsCount}
                        href="/admin/users/permanents"
                        buttonText="Gestion des membres permanents"
                        accentColor="red"
                    />
                    <AdminDashboardCard
                        title="Disponibilités"
                        count={freeReaderCount}
                        href="/admin/disponibilites"
                        buttonText="Calendrier des indisponibilités et lecteurs libres"
                        accentColor="blue"
                    />
                </div>
            </div>

            {/* Site Pages Section */}
            <div>
                <h2 className="text-lg font-semibold text-foreground mb-4 px-1">Pages du site</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    <AdminDashboardCard
                        title="Dernières infos"
                        count={newsCount}
                        href="/admin/news"
                        buttonText="Gestion des informations importantes et actuelles"
                        accentColor="green"
                    />
                    {isSuper && (
                        <>
                            <AdminDashboardCard
                                title="Contact"
                                count={siteContactCount}
                                href="/admin/site-contact"
                                buttonText="Coordonnées affichées sur la page Contact"
                                accentColor="teal"
                            />
                            <AdminDashboardCard
                                title="Équipe"
                                count={teamMemberCount}
                                href="/admin/team"
                                buttonText="Membres affichés sur la page Équipe (glisser-déposer pour réordonner)"
                                accentColor="indigo"
                            />
                            <AdminDashboardCard
                                title="Historique"
                                count={historyEventCount}
                                href="/admin/historique"
                                buttonText="Frise chronologique de la page Historique"
                                accentColor="orange"
                            />
                            <AdminDashboardCard
                                title="Infos pratiques"
                                count={practicalInfoCount}
                                href="/admin/informations-pratiques"
                                buttonText="Cartes de la page Informations pratiques (glisser-déposer)"
                                accentColor="cyan"
                            />
                            <AdminDashboardCard
                                title="Nous rejoindre"
                                count={membershipCount}
                                href="/admin/nous-rejoindre"
                                buttonText="Cartes d’adhésion de la page Nous rejoindre (glisser-déposer)"
                                accentColor="red"
                            />
                        </>
                    )}
                </div>
            </div>
        </AdminCard>
    );
}