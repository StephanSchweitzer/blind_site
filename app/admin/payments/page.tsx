import { prisma } from '@/lib/prisma';
import { PaymentType, PaymentMethod, Prisma } from '@prisma/client';
import PaymentsTable from './payments-table';
import { notFound } from 'next/navigation';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getPayments(
    page: number,
    searchTerm: string,
    type?: PaymentType,
    paymentMethod?: PaymentMethod,
) {
    const paymentsPerPage = 10;

    // Hide soft-deleted payments from the listing.
    const whereClause: Prisma.PaymentWhereInput = { isActive: true };

    if (searchTerm) {
        whereClause.client = {
            OR: [
                { name: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                { email: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
            ],
        };
    }

    if (type) whereClause.type = type;
    if (paymentMethod) whereClause.paymentMethod = paymentMethod;

    try {
        const [payments, totalPayments] = await Promise.all([
            prisma.payment.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
                skip: Math.max(0, (page - 1) * paymentsPerPage),
                take: paymentsPerPage,
                include: {
                    client: { select: { name: true, email: true } },
                },
            }),
            prisma.payment.count({ where: whereClause }),
        ]);

        return {
            payments,
            totalPayments,
            totalPages: Math.ceil(totalPayments / paymentsPerPage),
            availableTypes: Object.values(PaymentType),
            availableMethods: Object.values(PaymentMethod),
        };
    } catch (error) {
        console.error('Error fetching payments:', error);
        throw new Error('Failed to fetch payments');
    }
}

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
    const params = await searchParams;

    const page = Math.max(
        1,
        parseInt(Array.isArray(params.page) ? params.page[0] : params.page || '1')
    );
    const searchTerm = Array.isArray(params.search)
        ? params.search[0]
        : params.search || '';

    const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
    const type = rawType && Object.values(PaymentType).includes(rawType as PaymentType)
        ? (rawType as PaymentType)
        : undefined;

    const rawMethod = Array.isArray(params.paymentMethod) ? params.paymentMethod[0] : params.paymentMethod;
    const paymentMethod = rawMethod && Object.values(PaymentMethod).includes(rawMethod as PaymentMethod)
        ? (rawMethod as PaymentMethod)
        : undefined;

    // Only the data fetch is guarded; notFound() throws (returns `never`),
    // so `data` is definitely assigned past this point.
    let data: Awaited<ReturnType<typeof getPayments>>;
    try {
        data = await getPayments(page, searchTerm, type, paymentMethod);
    } catch (error) {
        console.error('Error in Admin Payments page:', error);
        notFound();
    }

    const { payments, totalPayments, totalPages, availableTypes, availableMethods } = data;

    const serializedPayments = payments.map(payment => ({
        ...payment,
        amount: payment.amount.toString(),
        creationDate: payment.creationDate.toISOString(),
        issueDate: payment.issueDate?.toISOString() ?? null,
        paymentDate: payment.paymentDate?.toISOString() ?? null,
    }));

    return (
        <div className="space-y-4">
            <PaymentsTable
                initialPayments={serializedPayments}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
                availableTypes={availableTypes}
                availableMethods={availableMethods}
                initialTotalPayments={totalPayments}
            />
        </div>
    );
}