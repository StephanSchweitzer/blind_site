import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/guards';
import { AdminCard } from '@/components/ui/admin';
import { getUserDisplayName } from '@/lib/users/displayName';
import {
    ACCESS_LEVEL_LABELS,
    MEMBER_TYPE_LABELS,
    getAccessLevelColor,
    getMemberTypeColor,
} from '@/lib/user-enums';
import { getUserActivityStatusColor, getUserActivityStatusLabel } from '@/lib/user-activity-enums';
import {
    describeUnavailability,
    resolveEffectiveActivityStatus,
    toDayString,
} from '@/lib/users/activityStatus';
import AccountSecurity from './account-security';
import MyActivity from './my-activity';
import MyUnavailability from './my-unavailability';

export const dynamic = 'force-dynamic';

/**
 * « Mon compte » — the signed-in person's own view of themselves.
 *
 * Deliberately NOT a second fiche. Everything a permanent may change about a
 * member lives on their dossier and in the user form; this page answers the
 * questions only the person themselves can answer — how do I sign in, when am I
 * away, and what have I been changing — and links out to the dossier for the
 * rest rather than duplicating fields that would then disagree.
 */
export default async function ProfilePage() {
    const me = await getCurrentUser();
    if (!me) redirect('/auth/signin');

    const user = await prisma.user.findUnique({
        where: { id: me.id },
        select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
            civility: { select: { name: true } },
            memberType: true,
            accessLevel: true,
            createdAt: true,
            activityStatus: true,
            unavailableFrom: true,
            unavailableUntil: true,
        },
    });
    if (!user) redirect('/auth/signin');

    const displayName = getUserDisplayName(user);
    const initial = (displayName || user.email || '?').trim().charAt(0).toUpperCase();
    const effectiveStatus = resolveEffectiveActivityStatus(user);
    const unavailabilityNote = describeUnavailability(user);

    return (
        <div className="space-y-4">
            {/* Identity strip — same shape as a member's dossier header, so the
                page reads as "your own file" rather than as another form. */}
            <AdminCard>
                <div className="p-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                        <div
                            aria-hidden="true"
                            className="shrink-0 h-16 w-16 rounded-full border border-border bg-muted flex items-center justify-center text-2xl font-bold text-foreground"
                        >
                            {initial}
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-2xl font-bold text-foreground truncate">
                                {displayName || 'Sans nom'}
                            </h1>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getMemberTypeColor(user.memberType)}`}>
                                    {MEMBER_TYPE_LABELS[user.memberType]}
                                </span>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getAccessLevelColor(user.accessLevel)}`}>
                                    {ACCESS_LEVEL_LABELS[user.accessLevel]}
                                </span>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getUserActivityStatusColor(effectiveStatus)}`}>
                                    {getUserActivityStatusLabel(effectiveStatus)}
                                    {unavailabilityNote ? ` · ${unavailabilityNote}` : ''}
                                </span>
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
                                {user.email && <div className="truncate">{user.email}</div>}
                                <div>
                                    Membre depuis le{' '}
                                    {user.createdAt.toLocaleDateString('fr-FR', {
                                        day: '2-digit',
                                        month: 'long',
                                        year: 'numeric',
                                    })}
                                    {' · '}n°{user.id}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* The fiche itself lives on the dossier — demandes, factures,
                        paiements, attributions — and is not re-implemented here. */}
                    <Link
                        href={`/admin/users/dossier/${user.id}`}
                        className="shrink-0 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-accent transition-colors"
                    >
                        <FolderOpen className="h-4 w-4" aria-hidden="true" />
                        Voir mon dossier
                    </Link>
                </div>
            </AdminCard>

            <div className="grid gap-4 lg:grid-cols-2 items-start">
                <AccountSecurity name={user.name ?? ''} email={user.email ?? ''} />
                <MyUnavailability
                    activityStatus={user.activityStatus}
                    unavailableFrom={toDayString(user.unavailableFrom)}
                    unavailableUntil={toDayString(user.unavailableUntil)}
                />
            </div>

            <MyActivity />
        </div>
    );
}
