'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { EditUserModal } from '@/admin/EditUserModal';
import { UserFormData, UserType } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface DossierHeaderNameProps {
    userId: number;
    fullName: string;
    currentUserAccessLevel?: string;
}

// Mirrors the tab a user's memberType would sort into on /admin/users — see
// getUsers() in app/admin/users/[type]/page.tsx. Only affects create-flow
// defaults inside the form, which don't apply here since we always pass
// initialData, but it keeps the prop meaningful if that ever changes.
function userTypeForMemberType(memberType: string): UserType {
    if (memberType === 'auditeur' || memberType === 'ecouteur') return 'auditeurs';
    if (memberType === 'lecteur') return 'lecteurs';
    if (memberType === 'bienfaiteur') return 'bienfaiteurs';
    return 'permanents';
}

export default function DossierHeaderName({ userId, fullName, currentUserAccessLevel }: DossierHeaderNameProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editData, setEditData] = useState<UserFormData | null>(null);
    const [userType, setUserType] = useState<UserType>('lecteurs');

    const handleOpen = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/user/${userId}?mode=full&include=addresses`);
            if (!response.ok) throw new Error('Échec du chargement des données');

            const userData = await response.json();
            if (!userData) throw new Error('Données incomplètes reçues');

            const formData: UserFormData = {
                email: userData.email || '',
                name: userData.name || '',
                memberType: userData.memberType || 'auditeur',
                accessLevel: userData.accessLevel || 'member',
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                civilityId: userData.civilityId ?? null,
                civilityOther: userData.civilityOther || '',
                homePhone: userData.homePhone || '',
                cellPhone: userData.cellPhone || '',
                gestconteNotes: userData.gestconteNotes || '',
                gestconteId: userData.gestconteId,
                nonProfitAffiliation: userData.nonProfitAffiliation || '',
                isActive: userData.isActive ?? true,
                terminationReason: userData.terminationReason || '',
                preferredDeliveryMethod: userData.preferredDeliveryMethod || '',
                paymentThreshold: userData.paymentThreshold?.toString() || '21.00',
                currentBalance: userData.currentBalance?.toString() || '0.00',
                preferredMediaFormatId: userData.preferredMediaFormatId ?? null,
                isAvailable: userData.isAvailable ?? true,
                availabilityNotes: userData.availabilityNotes || '',
                languages: (userData.languages ?? []).map((l: { language: string }) => l.language),
                saveType: userData.saveType || '',
                maxConcurrentAssignments: userData.maxConcurrentAssignments,
                notes: userData.notes || '',
                addresses: userData.addresses || [],
            };

            setUserType(userTypeForMemberType(userData.memberType || 'lecteur'));
            setEditData(formData);
            setIsEditModalOpen(true);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Erreur',
                description: error instanceof Error ? error.message : 'Échec du chargement des données de la personne',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={handleOpen}
                disabled={isLoading}
                className="flex items-center gap-2 text-left hover:underline decoration-dashed underline-offset-4 disabled:opacity-70"
                title="Modifier cette personne"
            >
                <h1 className="text-2xl font-bold text-foreground">{fullName}</h1>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </button>

            {editData && (
                <EditUserModal
                    isOpen={isEditModalOpen}
                    onOpenChange={(open) => {
                        setIsEditModalOpen(open);
                        if (!open) {
                            setEditData(null);
                            router.refresh();
                        }
                    }}
                    userId={userId.toString()}
                    initialData={editData}
                    onUserEdited={() => {
                        setIsEditModalOpen(false);
                        setEditData(null);
                        router.refresh();
                    }}
                    onUserDeleted={() => {
                        setIsEditModalOpen(false);
                        setEditData(null);
                        router.push('/admin/users');
                    }}
                    currentUserAccessLevel={currentUserAccessLevel}
                    userType={userType}
                />
            )}
        </>
    );
}
