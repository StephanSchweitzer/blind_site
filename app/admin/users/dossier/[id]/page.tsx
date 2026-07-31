import { redirect } from 'next/navigation';

export default async function DossierIndex({
                                               params,
                                           }: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    // Attributions first: opening someone's file is almost always about what they
    // are currently reading, not about their demandes.
    redirect(`/admin/users/dossier/${id}/affectations`);
}