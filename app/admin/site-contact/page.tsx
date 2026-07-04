import { prisma } from '@/lib/prisma';
import { ContactForm } from './contact-form';

export const dynamic = 'force-dynamic';

export default async function AdminSiteContact() {
    const contact = await prisma.siteContact.findUnique({ where: { id: 1 } });
    return <ContactForm initial={contact} />;
}
