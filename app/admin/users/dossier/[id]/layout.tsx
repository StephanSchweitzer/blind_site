import { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import DossierTabs from './dossier-tabs';
import DossierHeaderName from './dossier-header-name';
import { MEMBER_TYPE_LABELS, getMemberTypeColor } from '@/lib/user-enums';
import { formatPhone } from '@/lib/utils';
import { computeCotisationStatus, formatCotisationDate, isCotisationExempt } from '@/lib/cotisation';
import { getCurrentUser } from '@/lib/auth/guards';
import { MailingLabelButton } from '@/admin/MailingLabelButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const formatCurrency = (amount: string | number | null | undefined) =>
    amount === null || amount === undefined
        ? '-'
        : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
            typeof amount === 'string' ? parseFloat(amount) : amount,
        );

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ id: string }>;
}

export default async function DossierLayout({ children, params }: LayoutProps) {
    const { id } = await params;
    const userId = parseInt(id);
    if (isNaN(userId)) notFound();

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            homePhone: true,
            cellPhone: true,
            memberType: true,
            isActive: true,
            currentBalance: true,
            paymentThreshold: true,
            // Only to know whether an étiquette d'adresse can be printed — the
            // address itself is fetched on click, not rendered here.
            addresses: { select: { id: true }, take: 1 },
        },
    });
    if (!user) notFound();

    const me = await getCurrentUser();

    const cotisationPayments = await prisma.payment.findMany({
        where: { clientId: userId, type: 'COTISATION', isActive: true },
        select: { cotisationYear: true, paymentDate: true, creationDate: true },
    });
    const cotisation = computeCotisationStatus(cotisationPayments);

    const fullName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || 'Sans nom';

    return (
        <div className="space-y-4">
            <Card className="bg-card border-border">
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <DossierHeaderName userId={user.id} fullName={fullName} currentUserAccessLevel={me?.accessLevel} />
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getMemberTypeColor(user.memberType)}`}>
                                    {MEMBER_TYPE_LABELS[user.memberType]}
                                </span>
                                {user.isActive === false && (
                                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-2.5 py-1 text-xs font-medium">
                                        Inactif
                                    </span>
                                )}
                                {cotisation.isPaid && (
                                    <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2.5 py-1 text-xs font-medium">
                                        Cotisation à jour · expire le {formatCotisationDate(cotisation.expiresAt)}
                                    </span>
                                )}
                                {/* A Donateur owes no cotisation — never badge them as unpaid or expired. */}
                                {!cotisation.isPaid && !isCotisationExempt(user.memberType) && (
                                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-2.5 py-1 text-xs font-medium">
                                        {cotisation.expiresAt
                                            ? `Cotisation expirée le ${formatCotisationDate(cotisation.expiresAt)}`
                                            : 'Cotisation non payée'}
                                    </span>
                                )}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
                                {user.email && <div>{user.email}</div>}
                                {(user.cellPhone || user.homePhone) && (
                                    <div>{[user.cellPhone, user.homePhone].map((p) => formatPhone(p)).filter(Boolean).join(' · ')}</div>
                                )}
                            </div>
                            {/* Étiquette d'adresse, printable at any time — the point
                                being that it is never only available in the moment
                                some other action happens to offer it. */}
                            <div className="mt-3">
                                <MailingLabelButton
                                    userId={user.id}
                                    hasAddress={user.addresses.length > 0}
                                />
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                Solde courant
                            </div>
                            <div className="text-xl font-semibold text-foreground">
                                {formatCurrency(user.currentBalance?.toString() ?? null)}
                            </div>
                            {user.paymentThreshold && (
                                <div className="text-xs text-muted-foreground mt-1">
                                    Seuil: {formatCurrency(user.paymentThreshold.toString())}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <DossierTabs userId={user.id} />

            {children}
        </div>
    );
}