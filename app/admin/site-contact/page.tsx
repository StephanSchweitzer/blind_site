import { prisma } from '@/lib/prisma';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { ContactForm } from './contact-form';

export const dynamic = 'force-dynamic';

export default async function AdminSiteContact() {
    const me = await getCurrentUser();
    if (!isSuperAdmin(me?.accessLevel)) redirect('/admin');

    const contact = await prisma.siteContact.findUnique({ where: { id: 1 } });
    return <ContactForm initial={contact} />;
}
