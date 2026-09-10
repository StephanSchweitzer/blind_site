// app/admin/aide/page.tsx
import Link from 'next/link';
import { BookOpen, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listAideSections } from '@/lib/aide';
import { AidePdfButton } from '@/components/aide/AidePdfButton';

export const metadata = {
    title: "Mode d'emploi — Arbre Rose",
};

/**
 * Le sommaire du mode d'emploi.
 *
 * Les sections viennent de `content/aide/*.md`, la seule source : ajouter un
 * fichier l'ajoute ici, sans toucher à cette page.
 */
export default function AidePage() {
    const sections = listAideSections();

    return (
        <div className="space-y-4">
            <Card className="bg-card border-border">
                <CardHeader className="border-b border-border pb-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                            <BookOpen className="h-6 w-6 text-primary mt-1 shrink-0" aria-hidden="true" />
                            <div>
                                <CardTitle className="text-2xl font-bold text-foreground">
                                    Mode d&apos;emploi
                                </CardTitle>
                                <CardDescription className="text-muted-foreground mt-1">
                                    Comment se servir d&apos;Arbre Rose, section par section.
                                    Chaque page d&apos;administration renvoie ici par son bouton « Aide ».
                                </CardDescription>
                            </div>
                        </div>
                        <AidePdfButton className="sm:text-right sm:max-w-xs shrink-0" />
                    </div>
                </CardHeader>

                <CardContent className="pt-6">
                    {sections.length === 0 ? (
                        <p className="text-muted-foreground">
                            Aucune section n&apos;est encore rédigée.
                        </p>
                    ) : (
                        <ol className="grid gap-3 sm:grid-cols-2">
                            {sections.map((section, index) => (
                                <li key={section.slug}>
                                    <Link
                                        href={`/admin/aide/${section.slug}`}
                                        className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <span className="flex items-center gap-3">
                                            <span
                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground"
                                                aria-hidden="true"
                                            >
                                                {index + 1}
                                            </span>
                                            <span className="font-medium text-foreground">{section.title}</span>
                                        </span>
                                        <ChevronRight
                                            className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                                            aria-hidden="true"
                                        />
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    )}

                    <p className="mt-6 text-sm text-muted-foreground">
                        Nouveau parmi les permanents ? Les sections se lisent dans l&apos;ordre :
                        « Composants de base » et « Page principale » expliquent le vocabulaire
                        commun à toutes les autres.
                    </p>

                    <p className="mt-2 text-sm text-muted-foreground">
                        Quelque chose vous semble faux dans ces pages ? Envoyez la page concernée
                        et une capture d&apos;écran à{' '}
                        <a
                            href="mailto:steezefanschweitzer@gmail.com"
                            className="text-primary hover:underline"
                        >
                            steezefanschweitzer@gmail.com
                        </a>{' '}
                        pour le faire corriger ou vous l&apos;expliquer.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
