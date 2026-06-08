import { prisma } from '@/lib/prisma';
import { PaymentType, PaymentMethod, Prisma } from '@prisma/client';

// ⚠️ ADJUST this import to wherever your payments-table.tsx actually lives.
import PaymentsTable from '@/app/admin/payments/payments-table';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAYMENTS_PER_PAGE = 10;

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PaiementsTab({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;
    const clientId = parseInt(id);

    const page = Math.max(1, parseInt(Array.isArray(sp.page) ? sp.page[0] : sp.page || '1'));

    const rawType = Array.isArray(sp.type) ? sp.type[0] : sp.type;
    const type =
        rawType && Object.values(PaymentType).includes(rawType as PaymentType)
            ? (rawType as PaymentType)
            : undefined;

    const rawMethod = Array.isArray(sp.paymentMethod) ? sp.paymentMethod[0] : sp.paymentMethod;
    const paymentMethod =
        rawMethod && Object.values(PaymentMethod).includes(rawMethod as PaymentMethod)
            ? (rawMethod as PaymentMethod)
            : undefined;

    // Same filtering as the global payments page, locked to this client.
    const whereClause: Prisma.PaymentWhereInput = { isActive: true, clientId };
    if (type) whereClause.type = type;
    if (paymentMethod) whereClause.paymentMethod = paymentMethod;

    const [payments, totalPayments] = await Promise.all([
        prisma.payment.findMany({
            where: whereClause,
            orderBy: { creationDate: 'desc' },
            skip: Math.max(0, (page - 1) * PAYMENTS_PER_PAGE),
            take: PAYMENTS_PER_PAGE,
            include: { client: { select: { name: true, email: true } } },
        }),
        prisma.payment.count({ where: whereClause }),
    ]);

    const client = await prisma.user.findUnique({
        where: { id: clientId },
        select: { id: true, name: true, firstName: true, lastName: true, email: true },
    });

    const serializedPayments = payments.map((payment) => ({
        ...payment,
        amount: payment.amount.toString(),
        creationDate: payment.creationDate.toISOString(),
        issueDate: payment.issueDate?.toISOString() ?? null,
        paymentDate: payment.paymentDate?.toISOString() ?? null,
    }));

    return (
        <PaymentsTable
            initialPayments={serializedPayments}
            initialPage={page}
            initialSearch=""
            totalPages={Math.ceil(totalPayments / PAYMENTS_PER_PAGE)}
            availableTypes={Object.values(PaymentType)}
            availableMethods={Object.values(PaymentMethod)}
            initialTotalPayments={totalPayments}
            hideSearch
            presetClient={client}
        />
    );
}