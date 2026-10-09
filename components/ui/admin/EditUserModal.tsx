import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EditUserFormBackend } from '@/admin/EditUserFormBackend';
import { CopyableId } from '@/admin/CopyableId';
import { UserActivityHistory } from '@/components/ui/admin/UserActivityHistory';
import { UserFormData, UserType } from '@/types';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
import { FormLoadingGate } from '@/components/ui/form-skeleton';

/** What the edit form needs at mount, from one GET /api/user/[id]. */
export interface LoadedUser {
    data: UserFormData;
    /** The users tab this person's memberType sorts into (see getUsers() in app/admin/users/[type]/page.tsx). */
    userType: UserType;
}

function userTypeForMemberType(memberType: string): UserType {
    if (memberType === 'auditeur' || memberType === 'ecouteur') return 'auditeurs';
    if (memberType === 'lecteur') return 'lecteurs';
    if (memberType === 'bienfaiteur') return 'bienfaiteurs';
    return 'permanents';
}

export async function loadUserForEdit(userId: string, signal: AbortSignal): Promise<LoadedUser> {
    const response = await fetch(`/api/user/${userId}?mode=full&include=addresses`, { signal });
    if (!response.ok) throw new Error(`GET /api/user/${userId}: ${response.status}`);
    const userData = await response.json();

    return {
        userType: userTypeForMemberType(userData.memberType || 'lecteur'),
        data: {
            email: userData.email || '',
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
        },
    };
}

interface EditUserModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    /** Null while the person loads: the modal shows its skeleton, the form isn't mounted. */
    user: LoadedUser | null;
    error?: string | null;
    onUserDeleted?: (userId: number) => void;
    currentUserAccessLevel?: string;
    /** The tab the modal was opened from; defaults to the one the person's memberType sorts into. */
    userType?: UserType;
}

export function EditUserModal({
                                  isOpen,
                                  onOpenChange,
                                  userId,
                                  user,
                                  error,
                                  onUserDeleted,
                                  currentUserAccessLevel,
                                  userType,
                              }: EditUserModalProps) {
    const handleSuccess = (userId: number, isDeleted?: boolean) => {
        if (isDeleted) onUserDeleted?.(userId);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-4 pr-8">
                        <DialogTitle className="text-foreground flex flex-wrap items-center gap-2">
                            Modifier la personne
                            {userId && <CopyableId id={userId} label="de la personne" />}
                        </DialogTitle>
                        {userId && (
                            <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="border-border bg-card text-foreground hover:bg-muted hover:text-white"
                            >
                                <Link href={`/admin/users/dossier/${userId}`} target="_blank" rel="noopener noreferrer">
                                    <FolderOpen className="h-4 w-4 mr-2" />
                                    Voir le dossier
                                </Link>
                            </Button>
                        )}
                    </div>
                </DialogHeader>
                <div className="overflow-y-auto px-1">
                    <FormLoadingGate loading={!user} error={error} fields={8}>
                        {user && (
                            <>
                                <EditUserFormBackend
                                    userId={userId}
                                    initialData={user.data}
                                    onSuccess={handleSuccess}
                                    currentUserAccessLevel={currentUserAccessLevel}
                                    userType={userType ?? user.userType}
                                />
                                <UserActivityHistory userId={userId} />
                            </>
                        )}
                    </FormLoadingGate>
                </div>
            </DialogContent>
        </Dialog>
    );
}
