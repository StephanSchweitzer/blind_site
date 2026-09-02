'use client';

import React from 'react';
import { EntitySearchCombobox } from '@/admin/EntitySearchCombobox';
import { getUserDisplayName, type UserNameParts } from '@/lib/users/displayName';

export interface UserSearchResult extends UserNameParts {
    id: number;
}

interface UserSearchComboboxProps<T extends UserSearchResult> {
    value: T | null;
    /** Return `false` to veto the selection (activity guard) — the popover stays open. */
    onSelect: (user: T) => boolean | void | Promise<boolean | void>;
    /** Restrict results to assignable readers (/api/user/search?assignable=true). */
    assignable?: boolean;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    /** Grey out the trigger — the current auditeur stays readable, only changing it is refused. */
    disabled?: boolean;
    triggerRef?: React.Ref<HTMLButtonElement>;
    triggerClassName?: string;
    listClassName?: string;
}

export function UserSearchCombobox<T extends UserSearchResult>({
    value,
    onSelect,
    assignable = false,
    placeholder = 'Rechercher un auditeur ...',
    searchPlaceholder = 'Nom, email, ou numéro de personne...',
    emptyMessage = 'Aucune personne trouvée',
    disabled = false,
    triggerRef,
    triggerClassName,
    listClassName,
}: UserSearchComboboxProps<T>) {
    const fetcher = async (query: string, signal: AbortSignal): Promise<T[]> => {
        const params = new URLSearchParams({ q: query });
        if (assignable) params.set('assignable', 'true');
        const res = await fetch(`/api/user/search?${params.toString()}`, { signal });
        if (!res.ok) return [];
        return res.json();
    };

    return (
        <EntitySearchCombobox<T>
            value={value}
            onSelect={onSelect}
            fetcher={fetcher}
            getItemKey={(user) => user.id}
            renderValue={(user) => getUserDisplayName(user)}
            renderItem={(user) => (
                <span className="flex items-start justify-between gap-2 w-full">
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{getUserDisplayName(user)}</span>
                        {user.email && (
                            <span className="block text-sm text-muted-foreground">{user.email}</span>
                        )}
                    </span>
                    {/* The id staff paste back into this same box, and read off
                        « Modifier la personne #42 » — showing it here is what
                        closes that loop. */}
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        #{user.id}
                    </span>
                </span>
            )}
            // /api/user/search takes 20 before deduping legacy rows.
            resultLimit={20}
            resultNoun="personnes"
            placeholder={placeholder}
            searchPlaceholder={searchPlaceholder}
            emptyMessage={emptyMessage}
            disabled={disabled}
            triggerRef={triggerRef}
            triggerClassName={triggerClassName}
            listClassName={listClassName}
        />
    );
}
