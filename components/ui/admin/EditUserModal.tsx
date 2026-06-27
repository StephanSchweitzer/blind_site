import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EditUserFormBackend } from '@/admin/UserFormBackendBase';
import { UserActivityHistory } from '@/components/ui/admin/UserActivityHistory';
import { UserFormData, UserType } from '@/types';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';

interface EditUserModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    initialData: UserFormData;
    onUserEdited?: (userId: number) => void;
    onUserDeleted?: (userId: number) => void;
    currentUserAccessLevel?: string;
    userType: UserType;
}

export function EditUserModal({
                                  isOpen,
                                  onOpenChange,
                                  userId,
                                  initialData,
                                  onUserEdited,
                                  onUserDeleted,
                                  currentUserAccessLevel,
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
                    <div className="flex items-center justify-between gap-4 pr-8">
                        <DialogTitle className="text-gray-100">Modifier la personne</DialogTitle>
                        {userId && (
                            <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white"
                            >
                                <Link href={`/admin/users/dossier/${userId}`}>
                                    <FolderOpen className="h-4 w-4 mr-2" />
                                    Voir le dossier
                                </Link>
                            </Button>
                        )}
                    </div>
                </DialogHeader>
                <div className="overflow-y-auto px-1">
                    <EditUserFormBackend
                        userId={userId}
                        initialData={initialData}
                        onSuccess={handleSuccess}
                        currentUserAccessLevel={currentUserAccessLevel}
                        userType={userType}
                    />
                    {userId && <UserActivityHistory userId={userId} />}
                </div>
            </DialogContent>
        </Dialog>
    );
}