import React from 'react';
import { useToast } from "@/hooks/use-toast";
import { ReaderSummary, AssignmentFormData } from '@/types';
import { AssignmentFormBackendBase } from '@/admin/AssignmentFormBackendBase';
import { getFieldErrorLines, ErrorToastBody } from '@/admin/AssignmentFormErrors';

// Add Assignment Form using the base
export function AddAssignmentFormBackend({
                                             onSuccess,
                                             onOrdersLoaded,
                                             presetClientId,
                                             initialReader,
                                         }: {
    onSuccess?: (assignmentId: number) => void;
    onOrdersLoaded?: () => void;
    presetClientId?: number | null;
    initialReader?: ReaderSummary | null;
}) {
    const { toast } = useToast();

    const handleSubmit = async (formData: AssignmentFormData, readerId?: number | null): Promise<number> => {
        try {
            const payload = {
                ...formData,
                readerId, // Include readerId for create
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
                const fieldLines = getFieldErrorLines(data);

                toast({
                    variant: "destructive",
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <ErrorToastBody message={errorMessage} lines={fieldLines} />,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });

                return Promise.reject();
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">L&apos;attribution a été créée avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
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
            title="Créer une nouvelle attribution"
            onSuccess={onSuccess}
            onOrdersLoaded={onOrdersLoaded}
            presetClientId={presetClientId}
            initialSelectedReader={initialReader}
        />
    );
}
