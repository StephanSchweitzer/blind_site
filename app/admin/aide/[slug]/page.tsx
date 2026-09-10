// app/admin/aide/[slug]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Markdown } from '@/components/Markdown';
import { AideHashScroll } from '@/components/aide/AideHashScroll';
import { getAideNeighbours, getAideSection, listAideSections } from '@/lib/aide';

interface PageProps {
    params: Promise<{ slug: string }>;
}

/**
 * Les sections sont des fichiers du dépôt, pas des lignes en base : les rendre
 * à la compilation évite de relire le disque à chaque visite, et garantit que
 * `content/aide` part bien dans le déploiement.
 */
export function generateStaticParams() {
    return listAideSections().map((section) => ({ slug: section.slug }));
}

export async function generateMetadata({ params }: PageProps) {
    const { slug } = await params;
    const section = getAideSection(slug);
    return { title: section ? `${section.title} — Mode d'emploi` : "Mode d'emploi" };
}

export default async function AideSectionPage({ params }: PageProps) {
    const { slug } = await params;
    const section = getAideSection(slug);
    if (!section) notFound();

    const { previous, next } = getAideNeighbours(slug);
    // Le sommaire ne liste que les sous-sections (##). Les titres de niveau 3
    // sont des repères dans le texte, pas des destinations.
    const summary = section.headings.filter((h) => h.level === 2);

    return (
        <div className="space-y-4">
            <AideHashScroll />

            <Link
                href="/admin/aide"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Retour au mode d&apos;emploi
            </Link>

            <Card className="bg-card border-border">
                <CardHeader className="border-b border-border pb-4">
                    <CardTitle className="text-2xl font-bold text-foreground">
                        {section.title}
                    </CardTitle>
                </CardHeader>

                <CardContent className="pt-6">
                    {summary.length > 1 && (
                        <nav aria-label="Sommaire de la section" className="mb-8 rounded-lg border border-border bg-muted/40 p-4">
                            <p className="mb-2 text-sm font-semibold text-foreground">Dans cette section</p>
                            <ul className="space-y-1">
                                {summary.map((heading) => (
                                    <li key={heading.id}>
                                        <a
                                            href={`#${heading.id}`}
                                            className="text-sm text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                        >
                                            {heading.text}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    )}

                    <Markdown headingIds className="max-w-3xl">
                        {section.body}
                    </Markdown>

                    {(previous || next) && (
                        <nav
                            aria-label="Navigation entre les sections"
                            className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between"
                        >
                            {previous ? (
                                <Link
                                    href={`/admin/aide/${previous.slug}`}
                                    className="inline-flex items-center gap-2 text-sm text-foreground hover:text-primary"
                                >
                                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                                    {previous.title}
                                </Link>
                            ) : (
                                <span />
                            )}
                            {next && (
                                <Link
                                    href={`/admin/aide/${next.slug}`}
                                    className="inline-flex items-center gap-2 text-sm text-foreground hover:text-primary sm:justify-end"
                                >
                                    {next.title}
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                            )}
                        </nav>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
