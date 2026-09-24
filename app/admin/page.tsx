// app/admin/page.tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { AdminCard } from '@/components/ui/admin';
import { AdminDashboardCard } from '@/components/ui/admin/AdminDashboardCard';
import { getFreeReaderCount } from '@/lib/users/availabilityData';
import type { DashboardStatusRow } from '@/components/ui/admin/AdminDashboardCard';
import {
    getOpenAssignmentDelais,
    getOpenOrderDelais,
    tallyDelais,
    type DelaiTally,
} from '@/lib/orders/delais';
import { lateBillsWhere } from '@/lib/billing';

/**
 * One line under a card for one stage of the délais (lib/orders/delais.ts):
 * red when something is late, amber when something only needs watching, a
 * green « À jour » otherwise. It opens the list on what it counts — the late
 * ones, else the amber ones, else the whole stage.
 */
function delaiRow(label: string, baseHref: string, tally: DelaiTally, surveillerLabel: string): DashboardStatusRow {
    if (tally.enRetard > 0) {
        return { label, href: `${baseHref}&retard=true`, tone: 'danger', value: `${tally.enRetard} en retard` };
    }
    if (tally.aSurveiller > 0) {
        return { label, href: `${baseHref}&retard=surveiller`, tone: 'warning', value: `${tally.aSurveiller} ${surveillerLabel}` };
    }
    return { label, href: baseHref, tone: 'ok', value: 'À jour' };
}

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
            audioTrashCount,
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
            auditEventCount,
        ],
        // Active lecteurs with no attribution in progress — the count the
        // Disponibilités card leads with.
        freeReaderCount,
        // What is late, shown as lines under the Demandes, Attributions and
        // Factures cards (lib/orders/delais.ts, lib/billing.ts).
        orderDelais,
        assignmentDelais,
        lateBillCount,
    ] = await Promise.all([
        Promise.all([
            prisma.book.count(),
            prisma.news.count(),
            prisma.genre.count(),
            prisma.coupsDeCoeur.count(),
            prisma.book.count({ where: { needsReview: true } }),
            // Folders in the bucket no book claims, minus those already handled.
            prisma.orphanAudioFolder.count({ where: { resolvedAt: null, dismissedAt: null } }),
            // Fichiers encore récupérables : ni restaurés, ni purgés. Le même
            // décompte que l'onglet « Dans la corbeille », et le seul qui porte
            // une échéance — passé 14 jours, la purge les supprime du stockage.
            prisma.deletedAudioTrack.count({ where: { restoredAt: null, purgedAt: null } }),
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
            prisma.auditEvent.count(),
        ]),
        getFreeReaderCount(),
        getOpenOrderDelais(),
        getOpenAssignmentDelais(),
        prisma.bill.count({ where: { isActive: true, ...lateBillsWhere() } }),
    ]);
    // Each card counts what its own list shows: the demandes stages from the
    // demandes, the lecteurs from the attributions — so a line's number is the
    // number of rows it opens.
    const orderTally = tallyDelais(orderDelais);
    const assignmentTally = tallyDelais(assignmentDelais);

    return (
        <AdminCard className="p-6 md:p-8">
            {/* The section titles are h2 and the cards h3; without an h1 a screen
                reader's heading list started mid-outline. */}
            <h1 className="sr-only">Tableau de bord</h1>
            {/* Content Management Section */}
            <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground mb-4 px-1">Livres</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    <AdminDashboardCard
                        title="Catalogue"
                        count={bookCount}
                        href="/admin/books"
                        buttonText="Gestion du catalogue"
                    />
                    <AdminDashboardCard
                        title="Genres"
                        count={genreCount}
                        href="/admin/genres"
                        buttonText="Gestion des genres possibles associés aux livres"
                    />
                    <AdminDashboardCard
                        title="Listes de livres"
                        count={coupsDeCoeurCount}
                        href="/admin/listes-de-livres"
                        buttonText="Gestion des listes de livres (anciennement appelés « coups de cœur »)"
                    />
                    <AdminDashboardCard
                        title="Doublons"
                        count={reviewCount}
                        href="/admin/review"
                        buttonText="Révision et fusion des doublons potentiels du catalogue"
                    />
                    <AdminDashboardCard
                        title="Audio orphelin"
                        count={orphanAudioCount}
                        href="/admin/audio-orphelins"
                        buttonText="Dossiers audio du stockage qu’aucun livre ne revendique"
                    />
                    <AdminDashboardCard
                        title="Corbeille audio"
                        count={audioTrashCount}
                        href="/admin/audio-corbeille"
                        buttonText="Fichiers audio supprimés, restaurables 14 jours"
                    />
                </div>
            </div>

            {/* Operations Section */}
            <section className="mb-10" aria-labelledby="dashboard-gestion">
                <h2 id="dashboard-gestion" className="text-lg font-semibold text-foreground mb-4 px-1">Gestion</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    <AdminDashboardCard
                        title="Demandes"
                        count={orderCount}
                        href="/admin/orders"
                        buttonText="Gestion des demandes d'enregistrements audio"
                        rows={[
                            delaiRow("En attente d'un lecteur", '/admin/orders?isDuplication=false&statusId=1', orderTally.attente_lecteur, 'à surveiller'),
                            delaiRow('À expédier aux auditeurs', '/admin/orders?isDuplication=false&statusId=6', orderTally.a_expedier, 'à surveiller'),
                            delaiRow('Duplications à faire', '/admin/orders?isDuplication=true', orderTally.duplication, 'à surveiller'),
                        ]}
                    />
                    <AdminDashboardCard
                        title="Attributions"
                        count={assignmentCount}
                        href="/admin/assignments"
                        buttonText="Gestion des attributions confiées aux lecteurs"
                        rows={[
                            delaiRow('Chez les lecteurs', '/admin/assignments?statusId=2', assignmentTally.chez_lecteur, 'à relancer'),
                        ]}
                    />
                    <AdminDashboardCard
                        title="Factures"
                        count={billCount}
                        href="/admin/bills"
                        buttonText="Gestion des factures"
                        rows={[
                            {
                                label: 'Impayées après 30 jours',
                                href: '/admin/bills?late=true',
                                tone: lateBillCount > 0 ? 'danger' : 'ok',
                                value: lateBillCount > 0 ? `${lateBillCount} en retard` : 'À jour',
                            },
                        ]}
                    />
                    <AdminDashboardCard
                        title="Paiements"
                        count={paymentCount}
                        href="/admin/payments"
                        buttonText="Gestion des paiements (cotisations, dons, enregistrements)"
                    />
                    {isSuper && (
                        <AdminDashboardCard
                            title="Statistiques"
                            count={auditEventCount}
                            countLabel="modifications au journal"
                            href="/admin/stats"
                            buttonText="Tableau de bord et journal des modifications"
                        />
                    )}
                </div>
            </section>

            {/* Members Section */}
            <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground mb-4 px-1">Membres</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    <AdminDashboardCard
                        title="Auditeurs"
                        count={auditeursCount}
                        href="/admin/users/auditeurs"
                        buttonText="Gestion des auditeurs"
                    />
                    <AdminDashboardCard
                        title="Lecteurs"
                        count={lecteursCount}
                        href="/admin/users/lecteurs"
                        buttonText="Gestion des lecteurs"
                    />
                    <AdminDashboardCard
                        title="Donateurs"
                        count={bienfaiteursCount}
                        href="/admin/users/bienfaiteurs"
                        buttonText="Gestion des donateurs"
                    />
                    <AdminDashboardCard
                        title="Permanents"
                        count={permanentsCount}
                        href="/admin/users/permanents"
                        buttonText="Gestion des membres permanents"
                    />
                    <AdminDashboardCard
                        title="Disponibilités"
                        count={freeReaderCount}
                        countLabel={freeReaderCount > 1 ? 'lecteurs libres' : 'lecteur libre'}
                        href="/admin/disponibilites"
                        buttonText="Calendrier des indisponibilités et lecteurs libres"
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
                    />
                    {isSuper && (
                        <>
                            <AdminDashboardCard
                                title="Contact"
                                count={siteContactCount}
                                href="/admin/site-contact"
                                buttonText="Coordonnées affichées sur la page Contact"
                            />
                            <AdminDashboardCard
                                title="Équipe"
                                count={teamMemberCount}
                                href="/admin/team"
                                buttonText="Membres affichés sur la page Équipe (glisser-déposer pour réordonner)"
                            />
                            <AdminDashboardCard
                                title="Historique"
                                count={historyEventCount}
                                href="/admin/historique"
                                buttonText="Frise chronologique de la page Historique"
                            />
                            <AdminDashboardCard
                                title="Infos pratiques"
                                count={practicalInfoCount}
                                href="/admin/informations-pratiques"
                                buttonText="Cartes de la page Informations pratiques (glisser-déposer)"
                            />
                            <AdminDashboardCard
                                title="Nous rejoindre"
                                count={membershipCount}
                                href="/admin/nous-rejoindre"
                                buttonText="Cartes d’adhésion de la page Nous rejoindre (glisser-déposer)"
                            />
                        </>
                    )}
                </div>
            </div>
        </AdminCard>
    );
}