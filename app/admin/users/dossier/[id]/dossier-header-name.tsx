'use client';

import { useRouter } from 'next/navigation';
import { EditUserModal, loadUserForEdit } from '@/admin/EditUserModal';
import { useRecordLoader } from '@/hooks/useRecordLoader';

interface DossierHeaderNameProps {
    userId: number;
    fullName: string;
    currentUserAccessLevel?: string;
}

export default function DossierHeaderName({ userId, fullName, currentUserAccessLevel }: DossierHeaderNameProps) {
    const router = useRouter();
    // The modal opens at once on its skeleton; the person loads in one request.
    const userLoader = useRecordLoader(loadUserForEdit);

    return (
        <>
            <button
                type="button"
                onClick={() => userLoader.open(userId.toString())}
                className="flex items-center gap-2 text-left hover:underline decoration-dashed underline-offset-4"
                title="Modifier cette personne"
            >
                <h1 className="text-2xl font-bold text-foreground">{fullName}</h1>
            </button>

            {userLoader.openId && (
                <EditUserModal
                    key={userLoader.openId}
                    isOpen
                    onOpenChange={(open) => {
                        if (!open) {
                            userLoader.close();
                            router.refresh();
                        }
                    }}
                    userId={userLoader.openId}
                    user={userLoader.data}
                    error={userLoader.error}
                    onUserDeleted={() => router.push('/admin/users')}
                    currentUserAccessLevel={currentUserAccessLevel}
                />
            )}
        </>
    );
}
