'use client';

import React, { createContext, useContext } from 'react';
import type { ReferenceData } from '@/lib/reference-data';

const ReferenceDataContext = createContext<ReferenceData | null>(null);

export function ReferenceDataProvider({ value, children }: { value: ReferenceData; children: React.ReactNode }) {
    return <ReferenceDataContext.Provider value={value}>{children}</ReferenceDataContext.Provider>;
}

/** Statuts, formats, civilités and genres, preloaded by the admin layout. */
export function useReferenceData(): ReferenceData {
    const data = useContext(ReferenceDataContext);
    if (!data) throw new Error('useReferenceData must be used under app/admin/layout.tsx');
    return data;
}
