import Link from "next/link";
import FrontendNavbar from "@/components/Frontend-Navbar";
import { PhoneLines } from "@/components/PhoneLines";
import { getSiteContact } from "../contact/data";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
    title: 'Accessibilité',
    description: "Ce que le site des ECA propose aux personnes aveugles et malvoyantes, ce que nous vérifions, et comment nous signaler un problème d'accessibilité.",
    alternates: { canonical: '/accessibilite' },
};

/**
 * La déclaration d'accessibilité du site public.
 *
 * Pas la déclaration RGAA réglementaire : celle-ci exige un audit complet et
 * un taux de conformité, que nous n'avons pas — l'annoncer serait mentir au
 * public même que le site sert. La page dit donc ce qui est en place, comment
 * c'est vérifié, ce qui reste imparfait, et comment le signaler.
 *
 * Pas de section « voies de recours » (Défenseur des droits) non plus : le
 * modèle RGAA l'impose aux organismes soumis à la loi, pas à une petite
 * association. Ici elle renvoyait un visiteur vers une plainte avant même
 * qu'on ait pu l'aider — alors qu'un appel à la permanence règle l'affaire.
 *
 * DERNIERE_VERIFICATION est la date du dernier passage complet de
 * `pnpm a11y:check` : à mettre à jour quand on le relance, sinon la page
 * vieillit en silence.
 *
 * Coordonnées lues dans le même enregistrement que la page Contact : les
 * changer dans le back-office les change ici.
 */
const DERNIERE_VERIFICATION = '23 septembre 2026';

export default async function AccessibilitePage() {
    const contact = await getSiteContact();

    const section = "glass-card p-6 sm:p-8 space-y-4";
    const h2 = "text-2xl font-bold text-gray-900 dark:text-white";
    const texte = "text-gray-800 dark:text-gray-100 leading-relaxed";
    const liste = "list-disc space-y-2 pl-6 text-gray-800 dark:text-gray-100 leading-relaxed";
    const lien = "text-blue-700 dark:text-blue-300 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200";

    return (
        <div className="flex min-h-screen flex-col">
            <FrontendNavbar />
            <main id="contenu-principal" className="relative flex-1">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-8">
                    <PageHeader title="Accessibilité">
                        <p>
                            Les ECA enregistrent des livres pour les personnes aveugles et malvoyantes :
                            ce site doit d&apos;abord leur être utilisable.
                        </p>
                    </PageHeader>

                    <section className={section} aria-labelledby="etat">
                        <h2 id="etat" className={h2}>Où en est le site</h2>
                        <p className={texte}>
                            Nous visons le niveau AA des règles internationales d&apos;accessibilité du web (WCAG 2.2).
                            Le site n&apos;a pas encore été audité par un organisme extérieur.
                        </p>
                        <p className={texte}>
                            Chaque page publique est vérifiée par un outil automatique et parcourue au clavier.
                            Dernière vérification : {DERNIERE_VERIFICATION}.
                        </p>
                    </section>

                    <section className={section} aria-labelledby="propose">
                        <h2 id="propose" className={h2}>Ce que le site vous propose</h2>
                        <ul className={liste}>
                            <li>
                                <strong>Le bouton « Affichage »</strong>, en haut de chaque page : texte plus grand,
                                texte plus espacé, contraste renforcé, animations réduites. Vos choix sont gardés sur
                                votre appareil.
                            </li>
                            <li>
                                Le site suit aussi les réglages de votre appareil : thème sombre, contraste renforcé,
                                animations réduites, couleurs forcées de Windows.
                            </li>
                            <li>
                                Tout se fait au clavier. Dès la première touche Tab, deux liens mènent directement au
                                contenu de la page ou au menu.
                            </li>
                            <li>
                                Avec un lecteur d&apos;écran, les pages se parcourent par titres, et les résultats
                                d&apos;une recherche sont annoncés dès qu&apos;ils arrivent.
                            </li>
                            <li>
                                Dans le catalogue, la fiche de chaque livre peut lire sa description à voix haute.
                            </li>
                            <li>
                                Le lecteur audio des listes de livres règle la vitesse d&apos;écoute (jusqu&apos;à
                                deux fois plus vite) et avance ou recule de 15 secondes.
                            </li>
                        </ul>
                    </section>

                    <section className={section} aria-labelledby="limites">
                        <h2 id="limites" className={h2}>Ce qui reste imparfait</h2>
                        <p className={texte}>
                            Le site n&apos;a pas encore été essayé avec chacun des lecteurs d&apos;écran courants
                            (NVDA, JAWS, VoiceOver, TalkBack).
                        </p>
                    </section>

                    <section className={section} aria-labelledby="signaler">
                        <h2 id="signaler" className={h2}>Signaler un problème</h2>
                        <p className={texte}>
                            Si une page, un bouton ou une information vous reste inaccessible, dites-le-nous : nous
                            chercherons à le corriger, et en attendant à vous transmettre l&apos;information
                            autrement. Indiquez-nous si possible la page, ce que vous cherchiez à faire et l&apos;outil
                            que vous utilisez (lecteur d&apos;écran, loupe, téléphone…).
                        </p>
                        {contact ? (
                            <ul className={liste}>
                                <li>
                                    Par courriel :{' '}
                                    <a href={`mailto:${contact.email}`} className={lien}>{contact.email}</a>
                                </li>
                                <li>
                                    Par téléphone : <PhoneLines text={contact.phones.split('\n').filter(Boolean).join(' ou ')} />
                                </li>
                            </ul>
                        ) : null}
                        <p className={texte}>
                            Nos horaires de permanence et notre adresse sont sur la page{' '}
                            <Link href="/contact" className={lien}>Coordonnées</Link>.
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
