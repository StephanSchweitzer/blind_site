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
    triggerRef?: React.Ref<HTMLButtonElement>;
    triggerClassName?: string;
    listClassName?: string;
}

export function UserSearchCombobox<T extends UserSearchResult>({
    value,
    onSelect,
    assignable = false,
    placeholder = 'Rechercher un auditeur ...',
    searchPlaceholder = 'Rechercher par nom ou email...',
    emptyMessage = 'Aucune personne trouvée',
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
                <>
                    <div className="font-medium">{getUserDisplayName(user)}</div>
                    {user.email && <div className="text-sm text-muted-foreground">{user.email}</div>}
                </>
            )}
            placeholder={placeholder}
            searchPlaceholder={searchPlaceholder}
            emptyMessage={emptyMessage}
            triggerRef={triggerRef}
            triggerClassName={triggerClassName}
            listClassName={listClassName}
        />
    );
}
