import { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import DossierTabs from './dossier-tabs';
import { MEMBER_TYPE_LABELS } from '@/lib/user-enums';

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
        },
    });
    if (!user) notFound();

    const fullName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || 'Sans nom';

    return (
        <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-gray-100">{fullName}</h1>
                                <span className="inline-flex items-center rounded-full bg-blue-950 px-2.5 py-1 text-xs font-medium text-blue-300">
                                    {MEMBER_TYPE_LABELS[user.memberType]}
                                </span>
                                {user.isActive === false && (
                                    <span className="inline-flex items-center rounded-full bg-red-950 px-2.5 py-1 text-xs font-medium text-red-300">
                                        Inactif
                                    </span>
                                )}
                            </div>
                            <div className="mt-2 text-sm text-gray-400 space-y-0.5">
                                {user.email && <div>{user.email}</div>}
                                {(user.cellPhone || user.homePhone) && (
                                    <div>{[user.cellPhone, user.homePhone].filter(Boolean).join(' · ')}</div>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                                Solde courant
                            </div>
                            <div className="text-xl font-semibold text-gray-100">
                                {formatCurrency(user.currentBalance?.toString() ?? null)}
                            </div>
                            {user.paymentThreshold && (
                                <div className="text-xs text-gray-500 mt-1">
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