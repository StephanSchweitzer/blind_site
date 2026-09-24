import FrontendNavbar from "@/components/Frontend-Navbar";
import { resolveIcon } from "@/lib/icons";
import { MEMBERSHIP_THEME, asTheme } from "@/lib/color-themes";
import { Markdown } from "@/components/Markdown";
import { getMembershipOptions } from "./data";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
    title: 'Nous rejoindre',
    description: "Devenez lecteur bénévole ou adhérez aux ECA pour soutenir l'accès à la lecture des personnes aveugles et malvoyantes.",
    alternates: { canonical: '/nous-rejoindre' },
};

export default async function NousRejoindre() {
    const options = await getMembershipOptions();

    return (
        <div className="flex min-h-screen flex-col">
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12">
                <PageHeader title="Nous rejoindre">
                    <p>
                        Adhérer aux ECA, c&apos;est s&apos;engager dans une association qui croit au partage
                        de la culture et à l&apos;échange entre voyants et malvoyants.
                    </p>
                </PageHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {options.map((opt) => {
                        const Icon = resolveIcon(opt.iconKey);
                        const theme = MEMBERSHIP_THEME[asTheme(opt.colorTheme)];
                        const bullets = (opt.bullets ?? '').split('\n').map((b) => b.trim()).filter(Boolean);
                        const emphasizeValue = !!opt.highlightValue && opt.highlightValue.length <= 12;
                        return (
                            <section key={opt.id} className="glass-card overflow-hidden group">
                                <div className={`${theme.header} p-4 flex items-center`}>
                                    <Icon className="h-8 w-8 text-white mr-3" />
                                    <h2 className="text-2xl font-semibold text-white">{opt.title}</h2>
                                </div>
                                <div className="p-6 space-y-4">
                                    <Markdown>{opt.body}</Markdown>

                                    {(opt.highlightLabel || bullets.length > 0) && (
                                        <div className="bg-muted p-4 rounded-lg">
                                            {opt.highlightLabel && (
                                                <p className="text-gray-900 dark:text-gray-100">
                                                    <span className="font-semibold">{opt.highlightLabel}</span>
                                                    {opt.highlightValue && (
                                                        <>
                                                            {' : '}
                                                            {emphasizeValue
                                                                ? <span className={`text-xl font-bold ${theme.value}`}>{opt.highlightValue}</span>
                                                                : opt.highlightValue}
                                                        </>
                                                    )}
                                                </p>
                                            )}
                                            {bullets.length > 0 && (
                                                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-2 space-y-1 text-sm">
                                                    {bullets.map((b, i) => <li key={i}>{b}</li>)}
                                                </ul>
                                            )}
                                        </div>
                                    )}

                                    {opt.ctaLabel && opt.ctaHref && (
                                        <div className="text-center pt-4">
                                            <a href={opt.ctaHref} className={`inline-block ${theme.cta} text-white font-medium py-3 px-8 rounded-lg`}>
                                                {opt.ctaLabel}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>

                {/* CTA Section */}
                <section className="glass-card-lg p-8 text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Prêt à nous rejoindre ?</h2>
                    <p className="text-gray-700 dark:text-gray-100 mb-6 max-w-lg mx-auto">
                        Quelle que soit la forme de votre engagement, votre participation est précieuse pour faire vivre notre mission
                        d&apos;accessibilité à la lecture.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <a href="/contact" className="bg-primary text-white hover:bg-primary/90 font-medium py-3 px-8 rounded-lg">
                            Nous contacter
                        </a>
                    </div>
                </section>
            </div>
        </main>
        </div>
    );
}
