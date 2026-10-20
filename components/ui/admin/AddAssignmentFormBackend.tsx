import React from 'react';
import { useToast } from "@/hooks/use-toast";
import { ReaderSummary, UserSummary, AssignmentFormData } from '@/types';
import { AssignmentFormBackendBase, type AssignmentSubmitOptions } from '@/admin/AssignmentFormBackendBase';
import { getFieldErrorLines, ErrorToastBody, AudioConfirmationRequiredError } from '@/admin/AssignmentFormErrors';

// Add Assignment Form using the base
export function AddAssignmentFormBackend({
                                             onSuccess,
                                             presetClientId,
                                             initialReader,
                                             presetClient,
                                         }: {
    onSuccess?: (assignmentId: number) => void;
    presetClientId?: number | null;
    initialReader?: ReaderSummary | null;
    presetClient?: UserSummary | null;
}) {
    const { toast } = useToast();

    const handleSubmit = async (
        formData: AssignmentFormData,
        readerId?: number | null,
        options?: AssignmentSubmitOptions
    ): Promise<number> => {
        try {
            const payload = {
                ...formData,
                readerId, // Include readerId for create
                ...options,
            };

            console.log('Submitting assignment with data:', payload);

            const response = await fetch('/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Assignment creation failed:', data);
                const errorMessage = data?.message || data?.error || 'Échec de la création de l\'attribution';
                if (data?.requiresAudioConfirmation) {
                    return Promise.reject(new AudioConfirmationRequiredError(errorMessage));
                }
                const fieldLines = getFieldErrorLines(data);
                const blockingAssignmentId = data?.blockingAssignmentId ?? null;

                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: (
                        <ErrorToastBody
                            message={errorMessage}
                            lines={fieldLines}
                            blockingAssignmentId={blockingAssignmentId}
                        />
                    )
                });

                return Promise.reject();
            }

            toast({
                title: "Succès",
                description: "L'attribution a été créée avec succès",
                className: "bg-green-100 border-green-500 text-green-900"
            });

            return data.assignment.id;
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <AssignmentFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Créer l'attribution"
            loadingText="Création en cours..."
            onSuccess={onSuccess}
            presetClientId={presetClientId}
            initialSelectedReader={initialReader}
            presetClient={presetClient}
        />
    );
}
