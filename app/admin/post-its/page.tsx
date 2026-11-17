// app/admin/post-its/page.tsx
import { redirect } from 'next/navigation';
import { StickyNote } from 'lucide-react';
import { IntentLink } from '@/components/admin/IntentLink';
import { AdminCard } from '@/components/ui/admin';
import { AideLink } from '@/components/ui/admin/AideLink';
import { PostItBoard } from '@/admin/PostItBoard';
import { getCurrentUser } from '@/lib/auth/guards';
import { listDonePostIts, listOpenPostIts } from '@/lib/post-its/postIts';
import { parsePageParam } from '@/lib/pagination';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Post-its' };

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/** Les terminés se lisent par 24 : trois colonnes pleines, comme le tableau de bord. */
const DONE_PAGE_SIZE = 24;

/**
 * Tous les post-its : les ouverts, comme sur le tableau de bord, et les
 * terminés, page par page — on y retrouve ce qui a été fait, et on peut
 * rouvrir un post-it fermé trop tôt.
 */
export default async function PostItsPage({ searchParams }: PageProps) {
    const me = await getCurrentUser();
    if (!me) redirect('/auth/signin');
    const params = await searchParams;
    const etat = params.etat === 'termines' ? 'termines' : 'ouverts';
    const page = parsePageParam(typeof params.page === 'string' ? params.page : null);

    const list = etat === 'termines' ? await listDonePostIts(me, page, DONE_PAGE_SIZE) : await listOpenPostIts(me);
    const totalPages = Math.max(1, Math.ceil(list.total / DONE_PAGE_SIZE));
    if (etat === 'termines' && page > totalPages) redirect(`/admin/post-its?etat=termines&page=${totalPages}`);

    const tabs = [
        { key: 'ouverts', label: 'Ouverts', href: '/admin/post-its' },
        { key: 'termines', label: 'Terminés', href: '/admin/post-its?etat=termines' },
    ] as const;

    return (
        <AdminCard className="p-6 md:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="flex items-center gap-3 text-2xl font-semibold text-foreground">
                    <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-md bg-pink-100 dark:bg-pink-900/40">
                        <StickyNote className="h-5 w-5 text-pink-800 dark:text-pink-300" />
                    </span>
                    Post-its
                </h1>
                <AideLink section="page-principale" anchor="post-its" />
            </div>

            <nav aria-label="Post-its ouverts ou terminés" className="flex gap-1 border-b border-border">
                {tabs.map((tab) => (
                    <IntentLink
                        key={tab.key}
                        href={tab.href}
                        aria-current={etat === tab.key ? 'page' : undefined}
                        className={cn(
                            '-mb-px border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            etat === tab.key
                                ? 'border-pink-600 text-foreground dark:border-pink-500'
                                : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {tab.label}
                    </IntentLink>
                ))}
            </nav>

            <PostItBoard
                key={`${etat}-${page}`}
                initialItems={list.items}
                initialTotal={list.total}
                mode={etat}
                page={page}
                limit={DONE_PAGE_SIZE}
                headingLevel="h2"
            />

            {etat === 'termines' && totalPages > 1 && (
                <nav aria-label="Pages des post-its terminés" className="flex flex-wrap items-center justify-center gap-4 text-sm">
                    {page > 1 ? (
                        <IntentLink href={`/admin/post-its?etat=termines&page=${page - 1}`} className="underline underline-offset-2">
                            Page précédente
                        </IntentLink>
                    ) : <span aria-hidden="true" />}
                    <span className="text-muted-foreground">Page {page} sur {totalPages}</span>
                    {page < totalPages ? (
                        <IntentLink href={`/admin/post-its?etat=termines&page=${page + 1}`} className="underline underline-offset-2">
                            Page suivante
                        </IntentLink>
                    ) : <span aria-hidden="true" />}
                </nav>
            )}
        </AdminCard>
    );
}
