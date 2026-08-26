import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { getPostalName } from '@/lib/users/displayName';
import { mailingAddressLines, formatAddressOneLine } from '@/lib/users/formatAddress';

/**
 * Everything needed to print an étiquette d'adresse for a member.
 *
 * Read-only, and deliberately its own route: the list screens that offer the
 * button (demandes, attributions) don't carry postal addresses in their
 * queries, and loading addresses for every row to grey out one button would
 * cost far more than fetching once on click.
 *
 * Returns every address rather than picking one — with more than one on file
 * the button asks instead of guessing which envelope this is.
 */
export const GET = withAdmin(async (_request, { params }) => {
    const { id } = await params!;
    const userId = parseInt(id, 10);
    if (Number.isNaN(userId)) {
        return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                civility: { select: { name: true } },
                addresses: {
                    select: {
                        id: true,
                        addressLine1: true,
                        addressSupplement: true,
                        city: true,
                        postalCode: true,
                        stateProvince: true,
                        country: true,
                        isDefault: true,
                    },
                    orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
                },
            },
        });

        if (!user) {
            return NextResponse.json({ message: 'Membre introuvable' }, { status: 404 });
        }

        // An address row can exist with every field blank (legacy Access import).
        // It is not a place anything can be posted to, so it is not an option.
        const addresses = user.addresses
            .map((address) => ({
                id: address.id,
                isDefault: address.isDefault,
                lines: mailingAddressLines(address),
                oneLine: formatAddressOneLine(address),
            }))
            .filter((address) => address.lines.length > 0);

        return NextResponse.json({
            recipient: getPostalName(user),
            addresses,
        });
    } catch (error) {
        console.error('mailing label lookup error:', error);
        return NextResponse.json(
            { message: "Échec du chargement de l'adresse" },
            { status: 500 }
        );
    }
});
