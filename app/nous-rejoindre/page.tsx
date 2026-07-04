import FrontendNavbar from "@/components/Frontend-Navbar";
import { resolveIcon } from "@/lib/icons";
import { MEMBERSHIP_THEME, asTheme } from "@/lib/color-themes";
import { Markdown } from "@/components/Markdown";
import { getMembershipOptions } from "./data";

export default async function NousRejoindre() {
    const options = await getMembershipOptions();

    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">
                {/* Hero Section */}
                <section className="text-center glass-card-lg p-12">
                    <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Nous rejoindre</h1>
                    <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto mb-6"></div>
                    <p className="text-lg text-gray-700 dark:text-gray-100 max-w-2xl mx-auto">
                        Adhérer à ECA, c&apos;est s&apos;engager dans une association qui croit au partage
                        de la culture et à l&apos;échange entre voyants et malvoyants.
                    </p>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {options.map((opt) => {
                        const Icon = resolveIcon(opt.iconKey);
                        const theme = MEMBERSHIP_THEME[asTheme(opt.colorTheme)];
                        const bullets = (opt.bullets ?? '').split('\n').map((b) => b.trim()).filter(Boolean);
                        const emphasizeValue = !!opt.highlightValue && opt.highlightValue.length <= 12;
                        return (
                            <section key={opt.id} className="glass-card overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
                                <div className={`bg-gradient-to-r ${theme.header} p-4 flex items-center`}>
                                    <Icon className="h-8 w-8 text-white mr-3" />
                                    <h2 className="text-2xl font-semibold text-white">{opt.title}</h2>
                                </div>
                                <div className="p-6 space-y-4">
                                    <Markdown>{opt.body}</Markdown>

                                    {(opt.highlightLabel || bullets.length > 0) && (
                                        <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 p-4 rounded-lg">
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
                                            <a href={opt.ctaHref} className={`inline-block bg-gradient-to-r ${theme.cta} text-white font-medium py-3 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105`}>
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
                <section className="glass-card-lg p-8 text-center bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Prêt à nous rejoindre ?</h2>
                    <p className="text-gray-700 dark:text-gray-100 mb-6 max-w-lg mx-auto">
                        Quelle que soit la forme de votre engagement, votre participation est précieuse pour faire vivre notre mission
                        d&apos;accessibilité à la lecture.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <a href="/contact" className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 font-medium py-3 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105">
                            Nous contacter
                        </a>
                        <a href="/formulaire-adhesion" className="bg-transparent border-2 border-blue-600 dark:border-white text-blue-600 dark:text-white hover:bg-blue-600 dark:hover:bg-white hover:text-white dark:hover:text-gray-900 font-medium py-3 px-8 rounded-lg transition-all duration-300">
                            Formulaire d&apos;adhésion
                        </a>
                    </div>
                </section>
            </div>
        </main>
    );
}
