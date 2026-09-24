import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import React from 'react';

export const metadata: Metadata = {
    title: 'Connexion dev',
    robots: { index: false, follow: false },
};

// The provider behind this page never exists outside development
// (lib/auth.ts); the page should not either.
export default function Layout({ children }: { children: React.ReactNode }) {
    if (process.env.NODE_ENV !== 'development') notFound();
    return children;
}
