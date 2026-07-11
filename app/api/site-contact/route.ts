import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { withSuperAdmin } from '@/lib/auth/guards';

export async function GET() {
    try {
        const contact = await prisma.siteContact.findUnique({ where: { id: 1 } });
        return NextResponse.json(contact);
    } catch (error) {
        console.error('Error fetching site contact:', error);
        return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
    }
}

export const PUT = withSuperAdmin(async (req) => {
    try {
        const body = await req.json();
        const {
            orgName,
            orgSubtitle,
            addressLines,
            phones,
            email,
            hoursText,
            metroText,
            busText,
            visitText,
        } = body;

        if (!orgName || !addressLines || !phones || !email || !hoursText) {
            return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 });
        }

        const data = {
            orgName,
            orgSubtitle: orgSubtitle || null,
            addressLines,
            phones,
            email,
            hoursText,
            metroText: metroText || null,
            busText: busText || null,
            visitText: visitText || null,
        };

        const contact = await prisma.siteContact.upsert({
            where: { id: 1 },
            update: data,
            create: { id: 1, ...data },
        });

        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.siteContact, '/contact');

        return NextResponse.json(contact);
    } catch (error) {
        console.error('Error saving site contact:', error);
        return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 });
    }
});
