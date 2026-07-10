import React from 'react';
import { useToast } from "@/hooks/use-toast";
import { UserFormData, UserType } from '@/types';
import { UserFormBackendBase } from '@/admin/UserFormBackendBase';

export function EditUserFormBackend({
                                        userId,
                                        initialData,
                                        onSuccess,
                                        currentUserAccessLevel,
                                        userType,
                                    }: {
    userId: string;
    initialData: UserFormData;
    onSuccess?: (userId: number, isDeleted?: boolean) => void;
    currentUserAccessLevel?: string;
    userType: UserType;
}) {
    const { toast } = useToast();

    const handleDelete = async (): Promise<void> => {
        try {
            const response = await fetch(`/api/user/${userId}`, {
                method: 'DELETE',
            });

            let data: { message?: string } = {};
            try { data = await response.json(); } catch { /* no body */ }

            if (!response.ok) {
                // Surface the API's specific reason (e.g. active attributions /
                // bills) as a clear toast rather than a generic message.
                const msg = data.message || 'Échec de la suppression de la personne';
                toast({
                    title: "Suppression impossible",
                    description: msg,
                    className: "bg-red-100 border-red-500 text-red-900",
                });
                throw new Error(msg);
            }

            toast({
                title: "Succès",
                description: data.message || 'La personne a été supprimée avec succès',
                className: "bg-green-100 border-green-500 text-green-900"
            });

            if (onSuccess) {
                onSuccess(parseInt(userId), true);
            }
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    };

    const handleSubmit = async (formData: UserFormData): Promise<number> => {
        try {
            const response = await fetch(`/api/user/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: data?.message || 'Échec de la mise à jour de la personne',
                });
                return Promise.reject();
            }

            // 207 = updated (e.g. promoted to a login account) but the credentials
            // email could not be sent. The update succeeded — warn, don't celebrate.
            if (response.status === 207 || data?.emailSent === false) {
                toast({
                    title: "Personne mise à jour — email non envoyé",
                    description: data?.message ||
                        "Les modifications ont été enregistrées mais l'email d'identifiants n'a pas pu être envoyé. Utilisez « réinitialiser le mot de passe » pour le renvoyer.",
                    className: "bg-amber-100 border-amber-500 text-amber-900",
                });
                return parseInt(userId);
            }

            toast({
                title: "Succès",
                description: 'La personne a été mise à jour avec succès',
                className: "bg-green-100 border-green-500 text-green-900"
            });

            return parseInt(userId);
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <UserFormBackendBase
            initialData={initialData}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            showDelete={true}
            submitButtonText="Mettre à jour la personne"
            loadingText="Mise à jour en cours..."
            title="Modifier la personne"
            onSuccess={onSuccess}
            currentUserAccessLevel={currentUserAccessLevel}
            userType={userType}
            userId={userId}
        />
    );
}
