// app/admin/page.tsx
import Image from 'next/image';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { AdminCard } from '@/components/ui/admin';
import { AdminDashboardCard } from '@/components/ui/admin/AdminDashboardCard';
import { DashboardTodoBand, type DashboardTodoGroup } from '@/components/ui/admin/DashboardTodoBand';
import { getFreeReaderCount } from '@/lib/users/availabilityData';
import type { DashboardStatusRow } from '@/components/ui/admin/AdminDashboardCard';
import {
    DELAI_ETAPES,
    getOpenAssignmentDelais,
    getOpenOrderDelais,
    SURVEILLER_LABEL,
    tallyDelais,
    type DelaiEtape,
    type DelaiTally,
} from '@/lib/orders/delais';
import { lateBillsWhere } from '@/lib/billing';
import { getOpenAssignmentsWithUploadedAudio } from '@/lib/assignments/audioDeposee';
import { parisDate } from '@/lib/paris-day';

/**
 * One line of the « À traiter » band for one stage of the délais (lib/orders/delais.ts):
 * amber past the second line (« à suivre », « à relancer »), blue past the
 * first (« à surveiller »), a green « À jour » otherwise — never red, never
 * « en retard »: the work is the volunteers', and the pill says what to look
 * at, not who is behind. It opens the list on what it counts — the ones past
 * the second line, else the first, else the whole stage.
 */
function delaiRow(label: string, baseHref: string, tally: DelaiTally, etape: DelaiEtape): DashboardStatusRow {
    if (tally.enRetard > 0) {
        return {
            label,
            href: `${baseHref}&retard=true`,
            tone: 'warning',
            value: `${tally.enRetard} ${DELAI_ETAPES[etape].suiviLabel.toLowerCase()}`,
            count: tally.enRetard,
        };
    }
    if (tally.aSurveiller > 0) {
        return {
            label,
            href: `${baseHref}&retard=surveiller`,
            tone: 'todo',
            value: `${tally.aSurveiller} ${SURVEILLER_LABEL.toLowerCase()}`,
            count: tally.aSurveiller,
        };
    }
    return { label, href: baseHref, tone: 'ok', value: 'À jour', count: 0 };
}

/**
 * The duplication lines differ from the other stages: a duplication is meant to
 * be done straight away, so every one that CAN be done is work, late or not —
 * « À jour » on a fresh one let it sit unseen for the week its clock takes to
 * turn amber. The line counts those (the blocked ones never go late, so the
 * late and amber counts are among them) and opens exactly them. The ones
 * nobody is recording at all get an amber line, only when there are some: they
 * need a demande d'enregistrement (or a corrected type), and no clock will ever
 * say so. The ones still waiting on a recording have no line: nobody can act on
 * them yet, and « À traiter » is for what someone can do. The Demandes « Type »
 * filter (« Duplication après enregistrement ») still lists them.
 */
function duplicationRows(tally: DelaiTally): DashboardStatusRow[] {
    const ready = tally.total - tally.bloquees - tally.sansEnregistrement;
    const label = 'Duplications à faire';
    const href = '/admin/orders?isDuplication=ready';
    // « 5 à suivre » rather than « 5, dont 5 à suivre » when it's all of them.
    const part = (n: number, word: string) => (n === ready ? `${n} ${word}` : `${ready}, dont ${n} ${word}`);
    const rows: DashboardStatusRow[] = [
        ready === 0
            ? { label, href, tone: 'ok', value: 'À jour', count: 0 }
            : tally.enRetard > 0
                ? { label, href, tone: 'warning', value: part(tally.enRetard, DELAI_ETAPES.duplication.suiviLabel.toLowerCase()), count: ready }
                : tally.aSurveiller > 0
                    ? { label, href, tone: 'todo', value: part(tally.aSurveiller, SURVEILLER_LABEL.toLowerCase()), count: ready }
                    : { label, href, tone: 'todo', value: String(ready), count: ready },
    ];
    if (tally.sansEnregistrement > 0) {
        rows.push({
            label: 'Duplications sans enregistrement prévu',
            href: '/admin/orders?isDuplication=unplanned',
            tone: 'warning',
            value: String(tally.sansEnregistrement),
            count: tally.sansEnregistrement,
        });
    }
    return rows;
}

export const dynamic = 'force-dynamic';

/**
 * Every section lays its cards on the same grid, so every card is the same
 * size. Three columns, not four: with four, each section (6, 5, 5, 6 cards)
 * ended on one or two stranded cards. A list, so a screen reader announces how
 * many cards a section holds.
 */
const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';

export default async function Dashboard() {
    const me = await getCurrentUser();
    const isSuper = isSuperAdmin(me?.accessLevel);
    const [
        [
            bookCount,
            genreCount,
            coupsDeCoeurCount,
            reviewCount,
            orphanAudioCount,
            audioTrashCount,
            lecteursCount,
            auditeursCount,
            bienfaiteursCount,
            permanentsCount,
        ],
        // Active lecteurs with no attribution in progress — the count the
        // Disponibilités card leads with.
        freeReaderCount,
        // What is late, shown as the lines of the « À traiter » band
        // (lib/orders/delais.ts, lib/billing.ts).
        orderDelais,
        assignmentDelais,
        lateBillCount,
        // Attributions encore ouvertes dont l'audio est déjà déposé — à terminer
        // (lib/assignments/audioDeposee.ts).
        audioDeposeeIds,
        // Le prénom du bonjour en tête du tableau de bord.
        myName,
    ] = await Promise.all([
        Promise.all([
            prisma.book.count(),
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
        ]),
        getFreeReaderCount(),
        getOpenOrderDelais(),
        getOpenAssignmentDelais(),
        prisma.bill.count({ where: { isActive: true, ...lateBillsWhere() } }),
        getOpenAssignmentsWithUploadedAudio(),
        me ? prisma.user.findUnique({ where: { id: me.id }, select: { firstName: true } }) : null,
    ]);
    const firstName = myName?.firstName?.trim();
    // La date du jour sous le bonjour, en heure française. Pas d'heure : la
    // barre des tâches l'affiche déjà, et une horloge qui bouge distrait —
    // surtout un permanent malvoyant qui travaille à la loupe.
    const today = parisDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);
    // Each card counts what its own list shows: the demandes stages from the
    // demandes, the lecteurs from the attributions — so a line's number is the
    // number of rows it opens.
    const orderTally = tallyDelais(orderDelais);
    const assignmentTally = tallyDelais(assignmentDelais);
    const todoGroups: DashboardTodoGroup[] = [
        {
            title: 'Demandes',
            one: 'demande',
            many: 'demandes',
            rows: [
                delaiRow("En attente d'un lecteur", '/admin/orders?isDuplication=false&statusId=1', orderTally.attente_lecteur, 'attente_lecteur'),
                delaiRow('À expédier aux auditeurs', '/admin/orders?isDuplication=false&statusId=6', orderTally.a_expedier, 'a_expedier'),
                ...duplicationRows(orderTally.duplication),
            ],
        },
        {
            title: 'Attributions',
            one: 'attribution',
            many: 'attributions',
            rows: [
                delaiRow('Chez les lecteurs', '/admin/assignments?statusId=2', assignmentTally.chez_lecteur, 'chez_lecteur'),
                // Pas de délai ici : l'enregistrement est déjà aux ECA, il
                // ne reste qu'à saisir la date de retour — du travail à
                // faire tout de suite, en bleu comme les duplications.
                {
                    label: 'Audio déposé',
                    href: '/admin/assignments?audio=deposee',
                    tone: audioDeposeeIds.length > 0 ? 'todo' : 'ok',
                    value: audioDeposeeIds.length > 0 ? `${audioDeposeeIds.length} à terminer` : 'À jour',
                    count: audioDeposeeIds.length,
                },
            ],
        },
        {
            title: 'Factures',
            one: 'facture',
            many: 'factures',
            rows: [
                {
                    label: 'Impayées après 30 jours',
                    href: '/admin/bills?late=true',
                    tone: lateBillCount > 0 ? 'warning' : 'ok',
                    value: lateBillCount > 0 ? `${lateBillCount} à relancer` : 'À jour',
                    count: lateBillCount,
                },
            ],
        },
    ];

    return (
        <AdminCard className="p-6 md:p-8">
            {/* The section titles are h2 and the cards h3; without an h1 a screen
                reader's heading list started mid-outline. */}
            <h1 className="sr-only">Tableau de bord</h1>
            {/* Le bonjour d'Arbre Rose, avec l'arbre choisi par l'équipe. Sans
                prénom sur la fiche, un simple « Bonjour ». Sous lui la date, qui
                change chaque jour, plutôt qu'une phrase d'accueil qu'on finit
                par ne plus lire. */}
            <div className="mb-8 flex items-center gap-4 px-1">
                <Image src="/arbre_rose.png" alt="" aria-hidden="true" width={226} height={237} className="h-16 w-auto md:h-20" priority />
                <div>
                    <p className="text-2xl font-semibold text-foreground">
                        Bonjour{firstName ? ` ${firstName}` : ''}
                    </p>
                    <p className="text-muted-foreground">{todayLabel}</p>
                </div>
            </div>
            {/* « En ce moment » : ce que le tableau de bord est seul à dire —
                ce qui attend dans les demandes, attributions et factures, et les
                trois files d'attente du catalogue. Le reste de la page reprend le
                menu, en raccourcis. Le bandeau reste replié par défaut, et les
                trois files quittent la section Livres : la page ne s'allonge pas,
                les raccourcis restent à leur place. */}
            <section className="mb-10" aria-labelledby="dashboard-maintenant">
                <h2 id="dashboard-maintenant" className="text-lg font-semibold text-foreground mb-4 px-1">En ce moment</h2>
                <div className="space-y-3">
                    <DashboardTodoBand groups={todoGroups} />
                    <ul className={GRID}>
                        <li><AdminDashboardCard emphasis title="Doublons" count={reviewCount} countLabel="à réviser" href="/admin/review" /></li>
                        <li><AdminDashboardCard emphasis title="Audio orphelin" count={orphanAudioCount} countLabel={orphanAudioCount > 1 ? 'dossiers sans livre' : 'dossier sans livre'} href="/admin/audio-orphelins" /></li>
                        <li><AdminDashboardCard emphasis title="Corbeille audio" count={audioTrashCount} countLabel="restaurables" href="/admin/audio-corbeille" /></li>
                    </ul>
                </div>
            </section>

            <section className="mb-10" aria-labelledby="dashboard-livres">
                <h2 id="dashboard-livres" className="text-lg font-semibold text-foreground mb-4 px-1">Livres</h2>
                <ul className={GRID}>
                    <li><AdminDashboardCard title="Catalogue" count={bookCount} countLabel="livres" href="/admin/books" /></li>
                    <li><AdminDashboardCard title="Genres" count={genreCount} href="/admin/genres" /></li>
                    <li><AdminDashboardCard title="Listes de livres" count={coupsDeCoeurCount} href="/admin/listes-de-livres" /></li>
                </ul>
            </section>

            <section className="mb-10" aria-labelledby="dashboard-gestion">
                <h2 id="dashboard-gestion" className="text-lg font-semibold text-foreground mb-4 px-1">Gestion</h2>
                <ul className={GRID}>
                    {/* No lifetime totals here: a count of every demande ever
                        made says nothing about the day's work, which the
                        « À traiter » band above already counts. */}
                    <li><AdminDashboardCard title="Demandes" href="/admin/orders" /></li>
                    <li><AdminDashboardCard title="Attributions" href="/admin/assignments" /></li>
                    <li><AdminDashboardCard title="Factures" href="/admin/bills" /></li>
                    <li><AdminDashboardCard title="Paiements" href="/admin/payments" /></li>
                    {isSuper && (
                        <li><AdminDashboardCard title="Statistiques" href="/admin/stats" /></li>
                    )}
                </ul>
            </section>

            <section className="mb-10" aria-labelledby="dashboard-membres">
                <h2 id="dashboard-membres" className="text-lg font-semibold text-foreground mb-4 px-1">Membres</h2>
                <ul className={GRID}>
                    <li><AdminDashboardCard title="Auditeurs" count={auditeursCount} href="/admin/users/auditeurs" /></li>
                    <li><AdminDashboardCard title="Lecteurs" count={lecteursCount} href="/admin/users/lecteurs" /></li>
                    <li><AdminDashboardCard title="Donateurs" count={bienfaiteursCount} href="/admin/users/bienfaiteurs" /></li>
                    <li><AdminDashboardCard title="Permanents" count={permanentsCount} href="/admin/users/permanents" /></li>
                    <li>
                        <AdminDashboardCard
                            title="Disponibilités"
                            count={freeReaderCount}
                            countLabel={freeReaderCount > 1 ? 'lecteurs libres' : 'lecteur libre'}
                            href="/admin/disponibilites"
                        />
                    </li>
                </ul>
            </section>

            {/* Des cartes comme les autres : ce sont des pages qu'on ouvre pour
                les modifier. Une version en pastilles les faisait passer pour
                des étiquettes ou des filtres. */}
            <section aria-labelledby="dashboard-pages">
                <h2 id="dashboard-pages" className="text-lg font-semibold text-foreground mb-4 px-1">Pages du site</h2>
                <ul className={GRID}>
                    <li><AdminDashboardCard title="Dernières infos" href="/admin/news" /></li>
                    {isSuper && (
                        <>
                            <li><AdminDashboardCard title="Contact" href="/admin/site-contact" /></li>
                            <li><AdminDashboardCard title="Équipe" href="/admin/team" /></li>
                            <li><AdminDashboardCard title="Historique" href="/admin/historique" /></li>
                            <li><AdminDashboardCard title="Infos pratiques" href="/admin/informations-pratiques" /></li>
                            <li><AdminDashboardCard title="Nous rejoindre" href="/admin/nous-rejoindre" /></li>
                        </>
                    )}
                </ul>
            </section>
        </AdminCard>
    );
}