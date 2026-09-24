import FrontendNavbar from "@/components/Frontend-Navbar";
import { resolveIcon } from "@/lib/icons";
import { INFO_THEME, asTheme } from "@/lib/color-themes";
import { Markdown } from "@/components/Markdown";
import { getPracticalInfo } from "./data";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
    title: 'Informations Pratiques',
    description: 'Tout ce que vous devez savoir sur les services des ECA : modalités, fonctionnement et réponses aux questions fréquentes.',
    alternates: { canonical: '/nous-connaitre/informations-pratiques' },
};

export default async function InformationsPratique() {
    const items = await getPracticalInfo();

    return (
        <div className="flex min-h-screen flex-col">
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12">
                <PageHeader title="Informations pratiques">
                    <p>Tout ce que vous devez savoir sur nos services.</p>
                </PageHeader>

                {/* Information Cards */}
                <section className="space-y-8">
                    {items.map((item) => {
                        const Icon = resolveIcon(item.iconKey);
                        const theme = INFO_THEME[asTheme(item.colorTheme)];
                        return (
                            <div key={item.id} className="glass-card p-8 group">
                                <div className="flex items-start gap-4 mb-4">
                                    <div className={`p-3 rounded-lg ${theme.box}`}>
                                        <Icon className={`h-6 w-6 ${theme.icon}`} />
                                    </div>
                                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex-1">{item.question}</h2>
                                </div>
                                <Markdown>{item.body}</Markdown>
                            </div>
                        );
                    })}
                </section>
            </div>
        </main>
        </div>
    );
}
