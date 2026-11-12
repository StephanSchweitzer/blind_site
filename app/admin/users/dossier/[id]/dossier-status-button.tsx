'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserActivityHistory } from '@/components/ui/admin/UserActivityHistory';
import { getUserActivityStatusColor, getUserActivityStatusLabel } from '@/lib/user-activity-enums';

interface DossierStatusButtonProps {
    userId: number;
    /** The effective status (resolveEffectiveActivityStatus), as the header reads it. */
    activityStatus: string;
}

// The status pill of the dossier header is where the status changes: it opens
// the change form and the history in place. The edit window opened from the
// dossier no longer carries a status section of its own, so the pill shows
// for « Actif » too — it is the only way in.
export default function DossierStatusButton({ userId, activityStatus }: DossierStatusButtonProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium hover:ring-2 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${getUserActivityStatusColor(activityStatus)}`}
                    title="Changer le statut ou voir son historique"
                    aria-label={`Statut : ${getUserActivityStatusLabel(activityStatus)}. Changer le statut ou voir son historique`}
                >
                    {getUserActivityStatusLabel(activityStatus)}
                    <ChevronDown className="h-3 w-3" aria-hidden />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                collisionPadding={16}
                className="w-[min(28rem,calc(100vw-2rem))] max-h-[70dvh] overflow-y-auto bg-card border-border"
            >
                {/* Mounted only while open: every opening reads the history afresh. */}
                <UserActivityHistory
                    userId={userId}
                    framed={false}
                    defaultHistoryOpen
                    onChanged={() => router.refresh()}
                />
            </PopoverContent>
        </Popover>
    );
}
