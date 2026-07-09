import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ContactForm } from './contact-form';

export const dynamic = 'force-dynamic';

export default async function AdminSiteContact() {
    const session = await getServerSession(authOptions);
    if (session?.user.accessLevel !== 'super_admin') redirect('/admin');

    const contact = await prisma.siteContact.findUnique({ where: { id: 1 } });
    return <ContactForm initial={contact} />;
}
