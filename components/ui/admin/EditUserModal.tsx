import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EditUserFormBackend } from '@/admin/UserFormBackendBase';
import { UserFormData, UserType } from '@/types';

interface EditUserModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    initialData: UserFormData;
    onUserEdited?: (userId: number) => void;
    onUserDeleted?: (userId: number) => void;
    currentUserRole?: string;
    userType: UserType;
}

export function EditUserModal({
                                  isOpen,
                                  onOpenChange,
                                  userId,
                                  initialData,
                                  onUserEdited,
                                  onUserDeleted,
                                  currentUserRole,
                                  userType,
                              }: EditUserModalProps) {
    const handleSuccess = (userId: number, isDeleted?: boolean) => {
        console.log('User operation completed successfully, closing modal');
        if (isDeleted) {
            if (onUserDeleted) {
                console.log('Calling onUserDeleted callback with userId:', userId);
                onUserDeleted(userId);
            }
        } else {
            if (onUserEdited) {
                console.log('Calling onUserEdited callback with userId:', userId);
                onUserEdited(userId);
            }
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700 [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-gray-100">Modifier l&apos;utilisateur</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto px-1">
                    <EditUserFormBackend
                        userId={userId}
                        initialData={initialData}
                        onSuccess={handleSuccess}
                        currentUserRole={currentUserRole}
                        userType={userType}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}