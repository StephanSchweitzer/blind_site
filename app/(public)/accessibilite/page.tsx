import Link from "next/link";
import FrontendNavbar from "@/components/Frontend-Navbar";
import { PhoneLines } from "@/components/PhoneLines";
import { getSiteContact } from "../contact/data";
import type { Metadata } from "next";

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
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-8">
                    <section className="text-center glass-card-lg p-8 sm:p-12">
                        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Accessibilité</h1>
                        <p className="text-lg text-gray-700 dark:text-gray-100">
                            Les ECA enregistrent des livres pour les personnes aveugles et malvoyantes :
                            ce site doit d&apos;abord leur être utilisable.
                        </p>
                    </section>

                    <section className={section} aria-labelledby="etat">
                        <h2 id="etat" className={h2}>Où en est le site</h2>
                        <p className={texte}>
                            Nous visons le niveau AA des règles internationales d&apos;accessibilité du web (WCAG 2.2),
                            sur lesquelles s&apos;appuie le référentiel français (RGAA).
                        </p>
                        <p className={texte}>
                            Le site n&apos;a pas encore fait l&apos;objet d&apos;un audit de conformité complet par un
                            organisme extérieur. Nous ne pouvons donc pas annoncer de taux de conformité.
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
                                Les réglages de votre appareil sont respectés : thème clair ou sombre, contraste
                                renforcé, réduction des animations, couleurs forcées de Windows.
                            </li>
                            <li>
                                Tout se fait au clavier. Dès la première touche Tab, deux liens mènent directement au
                                contenu de la page ou au menu.
                            </li>
                            <li>
                                Pour les lecteurs d&apos;écran : des pages titrées et structurées, des images décrites,
                                et les résultats d&apos;une recherche annoncés dès qu&apos;ils arrivent.
                            </li>
                            <li>
                                Dans le catalogue, la fiche de chaque livre peut lire sa description à voix haute.
                            </li>
                            <li>
                                Le lecteur audio des listes de livres règle la vitesse d&apos;écoute (jusqu&apos;à
                                deux fois plus vite) et avance ou recule de 15 secondes.
                            </li>
                            <li>Depuis un téléphone, il suffit de toucher nos numéros pour nous appeler.</li>
                        </ul>
                    </section>

                    <section className={section} aria-labelledby="verifications">
                        <h2 id="verifications" className={h2}>Comment nous vérifions</h2>
                        <p className={texte}>
                            Chaque page publique passe un contrôle automatique (outil axe) dans toutes les
                            présentations que le site propose : thème clair et sombre, ordinateur et téléphone,
                            texte très grand, texte espacé, contraste renforcé et couleurs forcées. Nous le
                            complétons par des vérifications à la main : parcours au clavier et lecture de la
                            structure de chaque page telle qu&apos;un lecteur d&apos;écran la présente.
                        </p>
                        <p className={texte}>Dernière vérification : {DERNIERE_VERIFICATION}.</p>
                    </section>

                    <section className={section} aria-labelledby="limites">
                        <h2 id="limites" className={h2}>Ce qui reste imparfait</h2>
                        <ul className={liste}>
                            <li>
                                Un contrôle automatique ne repère qu&apos;une partie des difficultés. Le site n&apos;a
                                pas encore été éprouvé avec chacun des lecteurs d&apos;écran courants (NVDA, JAWS,
                                VoiceOver, TalkBack).
                            </li>
                            <li>
                                Les enregistrements des listes de livres n&apos;ont pas de transcription mot à mot ;
                                les livres présentés sont en revanche tous listés par écrit sur la même page.
                            </li>
                            <li>
                                L&apos;espace de gestion réservé à l&apos;équipe des ECA n&apos;est pas concerné par
                                cette page.
                            </li>
                        </ul>
                    </section>

                    <section className={section} aria-labelledby="signaler">
                        <h2 id="signaler" className={h2}>Signaler un problème</h2>
                        <p className={texte}>
                            Si une page, un bouton ou une information vous reste inaccessible, dites-le-nous : nous
                            chercherons à le corriger, et en attendant à vous transmettre l&apos;information
                            autrement.
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

                    <section className={section} aria-labelledby="recours">
                        <h2 id="recours" className={h2}>Si vous n&apos;obtenez pas de réponse</h2>
                        <p className={texte}>
                            Si vous nous avez signalé un défaut d&apos;accessibilité sans obtenir de réponse
                            satisfaisante, vous pouvez vous adresser au Défenseur des droits :
                        </p>
                        <ul className={liste}>
                            <li>
                                par le formulaire en ligne du site{' '}
                                <a href="https://www.defenseurdesdroits.fr/" className={lien}>defenseurdesdroits.fr</a> ;
                            </li>
                            <li>
                                par courrier, sans affranchissement : Défenseur des droits, Libre réponse 71120,
                                75342 Paris CEDEX 07.
                            </li>
                        </ul>
                    </section>
                </div>
            </main>
        </div>
    );
}
