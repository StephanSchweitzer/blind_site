import React from "react";
import FrontendNavbar from "@/components/Frontend-Navbar";
import type { Metadata } from "next";
import Link from "next/link";
import { getHomeFigures, type HomeFigures } from "./chiffres";
import { getSiteContact } from "./contact/data";
import { PhoneLines } from "@/components/PhoneLines";
import { Dos } from "@/components/Dos";
import { ArrowRight, Headphones, Mail, Mic, Phone } from "lucide-react";

export const metadata: Metadata = {
    title: 'ECA - Enregistrements à la Carte pour les Aveugles',
    description: "Les ECA proposent aux personnes aveugles et malvoyantes un service gratuit d'enregistrement à la carte de livres et documents, lus par des bénévoles.",
    alternates: { canonical: '/' },
};

const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: 'ECA - Enregistrements à la Carte pour les Aveugles',
    alternateName: 'Délégation des Auxiliaires des Aveugles',
    url: 'https://eca-aveugles.fr',
    logo: 'https://eca-aveugles.fr/eca_logo.png',
    description: "Service gratuit d'enregistrement à la carte de livres et documents pour les personnes aveugles et malvoyantes, réalisé par des lecteurs bénévoles.",
    areaServed: 'FR',
    availableLanguage: 'fr',
};

// Les chiffres d'« Aujourd'hui aux ECA » (./chiffres.ts) : la page est servie
// depuis le cache et regénérée au plus toutes les heures, comme le catalogue.
export const revalidate = 3600;

const nombre = new Intl.NumberFormat('fr-FR');

// Liens du texte : soulignés, pour ne pas dépendre de la seule couleur.
const lien = 'rounded font-medium text-primary underline underline-offset-2 hover:text-encre dark:text-blue-300 dark:hover:text-white';
// Les boutons des deux parcours.
const bouton = 'inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90';
const boutonSecondaire = 'inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 font-semibold text-foreground hover:bg-muted';

/** Un nombre dans une phrase : mis en valeur à l'œil, lu normalement. */
function N({ n }: { n: number }) {
    return <span className="font-semibold tabular-nums text-foreground">{nombre.format(n)}</span>;
}

/**
 * « Aujourd'hui aux ECA » — les chiffres du service, dits en phrases plutôt
 * qu'alignés en gros chiffres : c'est une association qui parle, pas un
 * tableau de bord. Chaque phrase ne paraît que si son chiffre n'est pas nul,
 * et la section entière disparaît si la base ne répond pas.
 */
function AujourdhuiAuxEca({ chiffres }: { chiffres: HomeFigures }) {
    const { lecteurs, auditeurs, enregistrements, titres } = chiffres;
    const phrases: React.ReactNode[] = [];

    if (lecteurs > 0 && auditeurs > 0) {
        phrases.push(
            <>
                Les ECA comptent <N n={lecteurs} /> {lecteurs > 1 ? 'lecteurs bénévoles, qui prêtent leur' : 'lecteur bénévole, qui prête sa'}{' '}
                voix à <N n={auditeurs} /> {auditeurs > 1 ? 'auditeurs' : 'auditeur'}.
            </>,
        );
    }
    if (enregistrements > 0) {
        phrases.push(
            <>
                En douze mois, {phrases.length > 0 ? 'ils ont' : 'nos lecteurs ont'} enregistré <N n={enregistrements} />{' '}
                {enregistrements > 1 ? 'livres et documents' : 'livre ou document'}.
            </>,
        );
    }
    if (titres > 0) {
        phrases.push(
            <>
                Le{' '}
                <Link
                    href="/catalogue"
                    className={lien}
                >
                    catalogue
                </Link>{' '}
                réunit <N n={titres} /> {titres > 1 ? 'titres' : 'titre'}.
            </>,
        );
    }
    if (phrases.length === 0) return null;

    return (
        <section aria-labelledby="aujourdhui" className="space-y-3">
            <h2 id="aujourdhui" className="text-2xl font-bold text-foreground">
                Aujourd&apos;hui aux ECA
            </h2>
            <p className="max-w-prose text-muted-foreground">
                {phrases.map((phrase, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && ' '}
                        {phrase}
                    </React.Fragment>
                ))}
            </p>
        </section>
    );
}

export default async function Home() {
    // Une base injoignable ne doit pas faire tomber l'accueil : chaque bloc qui
    // en dépend se tait.
    const [chiffres, contact] = await Promise.all([
        getHomeFigures().catch((error) => {
            console.error("Chiffres de l'accueil indisponibles :", error);
            return null;
        }),
        getSiteContact().catch((error) => {
            console.error("Coordonnées de l'accueil indisponibles :", error);
            return null;
        }),
    ]);

    return (
        <div className="flex min-h-screen flex-col">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
            />
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-14">
                {/* Un seul titre, qui dit ce que sont les ECA. Il y en avait deux
                    (« Bienvenue sur le site ECA ! », puis le nom), suivis du logo
                    en grande image : trois fois la même chose avant la première
                    information. */}
                <header className="space-y-6">
                    <Dos />
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
                        Enregistrements à la Carte pour les Aveugles
                    </h1>
                    <p className="max-w-prose text-xl text-muted-foreground">
                        Les ECA proposent à leurs auditeurs un service personnalisé d&apos;enregistrement
                        des livres et documents de leurs choix, lus par des bénévoles.
                    </p>

                    {/* Le téléphone d'abord : beaucoup de nos auditeurs appellent
                        plutôt que d'écrire. Il n'apparaissait que sur la page du
                        catalogue. */}
                    {contact && (
                        <div className="flex flex-col gap-3 border-l-4 border-orange-eca pl-5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-8">
                            <p className="flex items-baseline gap-3 text-xl font-semibold text-foreground">
                                <Phone aria-hidden="true" className="h-5 w-5 shrink-0 self-center text-orange-eca" />
                                <span>
                                    <span className="sr-only">Téléphone : </span>
                                    <PhoneLines text={contact.phones} />
                                </span>
                            </p>
                            <p className="flex items-baseline gap-3">
                                <Mail aria-hidden="true" className="h-5 w-5 shrink-0 self-center text-orange-eca" />
                                <a href={`mailto:${contact.email}`} className={`${lien} [overflow-wrap:anywhere]`}>{contact.email}</a>
                            </p>
                            <p>
                                <Link href="/contact" className={lien}>Adresse et permanences</Link>
                            </p>
                        </div>
                    )}
                </header>

                {/* Les deux raisons de venir ici, chacune avec sa suite. */}
                <section aria-labelledby="commencer" className="space-y-5">
                    <h2 id="commencer" className="text-2xl font-bold text-foreground">Par où commencer ?</h2>
                    <div className="grid gap-5 md:grid-cols-2">
                        <article aria-labelledby="ecouter" className="glass-card flex flex-col gap-4 p-6 sm:p-8">
                            <Headphones aria-hidden="true" className="h-8 w-8 text-primary dark:text-blue-300" />
                            <h3 id="ecouter" className="text-xl font-bold text-foreground">Vous souhaitez écouter des livres</h3>
                            <p className="flex-1 text-muted-foreground">
                                Faites-nous parvenir le livre ou le document de votre choix : un lecteur bénévole
                                l&apos;enregistre pour vous. Vous pouvez aussi choisir parmi les titres du catalogue.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Link href="/catalogue" className={bouton}>
                                    Parcourir le catalogue <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                </Link>
                                <Link href="/contact" className={boutonSecondaire}>Nous contacter</Link>
                            </div>
                        </article>
                        <article aria-labelledby="lire" className="glass-card flex flex-col gap-4 p-6 sm:p-8">
                            <Mic aria-hidden="true" className="h-8 w-8 text-primary dark:text-blue-300" />
                            <h3 id="lire" className="text-xl font-bold text-foreground">Vous souhaitez lire pour les autres</h3>
                            <p className="flex-1 text-muted-foreground">
                                Les ECA forment des lecteurs bénévoles, qui prêtent leur voix aux livres et documents
                                demandés par les auditeurs.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Link href="/nous-rejoindre" className={bouton}>
                                    Devenir lecteur bénévole <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                </Link>
                            </div>
                        </article>
                    </div>
                </section>

                {chiffres && <AujourdhuiAuxEca chiffres={chiffres} />}

                {/* Du texte, pas des cartes : rien ici ne se clique. */}
                <section aria-labelledby="service" className="space-y-4">
                    <h2 id="service" className="text-2xl font-bold text-foreground">Un service à la carte</h2>
                    <div className="max-w-prose space-y-4 text-muted-foreground">
                        <p>
                            Les ECA mettent en contact des lecteurs bénévoles formés par l&apos;association et des auditeurs
                            déficients visuels qui accèdent ainsi au plaisir de l&apos;écoute des textes qu&apos;ils ont choisis.
                            Les ECA mettent aussi à leur disposition les titres du catalogue. Ainsi se met en place une
                            passerelle humaine et chaleureuse entre voyants et malvoyants.
                        </p>
                        <p>
                            C&apos;est donc un service à la carte qui est proposé. Les auditeurs peuvent faire parvenir aux ECA
                            tous livres ou documents dont ils souhaitent l&apos;enregistrement vocal, que ce soit pour leur
                            divertissement, leurs besoins professionnels ou de formation.
                        </p>
                    </div>
                </section>
            </div>
        </main>
        </div>
    );
}
