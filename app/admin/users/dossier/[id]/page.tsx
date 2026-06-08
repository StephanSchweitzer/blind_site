import { redirect } from 'next/navigation';

export default async function DossierIndex({
                                               params,
                                           }: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/admin/users/dossier/${id}/commandes`);
}