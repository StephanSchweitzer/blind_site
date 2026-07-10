import React from 'react';
import { useToast } from "@/hooks/use-toast";
import { UserFormData, UserType } from '@/types';
import { UserFormBackendBase } from '@/admin/UserFormBackendBase';

export function AddUserFormBackend({
                                       onSuccess,
                                       userType,
                                       currentUserAccessLevel,
                                   }: {
    onSuccess?: (userId: number) => void;
    userType: UserType;
    currentUserAccessLevel?: string;
}) {
    const { toast } = useToast();

    const handleSubmit = async (formData: UserFormData): Promise<number> => {
        try {
            const response = await fetch('/api/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: data?.message || 'Échec de la création de la personne',
                });
                return Promise.reject();
            }

            // 207 = the account was created but the credentials email could not be
            // sent. The account exists, so let the flow complete (return the id) —
            // but warn the admin instead of reporting plain success.
            if (response.status === 207 || data?.emailSent === false) {
                toast({
                    title: "Compte créé — email non envoyé",
                    description: data?.message ||
                        "Le compte a été créé mais l'email d'identifiants n'a pas pu être envoyé. Utilisez « réinitialiser le mot de passe » pour le renvoyer.",
                    className: "bg-amber-100 border-amber-500 text-amber-900",
                });
                return data.user.id;
            }

            toast({
                title: "Succès",
                description: 'La personne a été créée avec succès',
                className: "bg-green-100 border-green-500 text-green-900"
            });

            return data.user.id;
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <UserFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Créer la personne"
            loadingText="Création en cours..."
            title="Créer un nouvel membre"
            onSuccess={onSuccess}
            userType={userType}
            currentUserAccessLevel={currentUserAccessLevel}
            warnOnDuplicateName
        />
    );
}
