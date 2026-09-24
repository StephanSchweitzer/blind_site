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

    // Une bande qui ferme la page, titre à gauche et phrases à droite sur grand
    // écran : posée seule sous le reste, la section avait l'air d'un
    // paragraphe oublié.
    return (
        <section
            aria-labelledby="aujourdhui"
            className="glass-card grid gap-4 p-6 sm:p-8 lg:grid-cols-12 lg:gap-8"
        >
            <div className="space-y-3 lg:col-span-4">
                <Dos />
                <h2 id="aujourdhui" className="text-2xl font-bold text-foreground">
                    Aujourd&apos;hui aux ECA
                </h2>
            </div>
            <p className="text-lg leading-relaxed text-muted-foreground lg:col-span-8 lg:self-end">
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

    // Le texte est celui de l'association, mot pour mot : ses phrases ont
    // seulement été redistribuées entre l'en-tête, les deux blocs « Auditeurs »
    // et « Lecteurs bénévoles », et la conclusion. Les libellés des boutons
    // reprennent ceux du menu.
    return (
        <div className="flex min-h-screen flex-col">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
            />
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            {/* Trois temps, sur une même grille de douze colonnes : qui nous
                sommes (et comment nous joindre), les deux publics reliés par la
                « passerelle », puis où en est le service. */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
                {/* Un seul titre de niveau 1 : le nom, qui était un second titre,
                    est désormais sa ligne d'accompagnement. Le logo en grande
                    image, qui le répétait une troisième fois, est retiré. */}
                <header className="grid gap-8 lg:grid-cols-12 lg:items-end">
                    <div className="space-y-6 lg:col-span-7">
                        <Dos />
                        <div className="space-y-2">
                            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
                                Bienvenue sur le site ECA !
                            </h1>
                            <p className="text-2xl font-semibold text-foreground">
                                ECA : Enregistrements à la Carte pour les Aveugles
                            </p>
                        </div>
                        <p className="max-w-prose text-xl text-muted-foreground">
                            Les ECA (Enregistrements à la Carte pour les Aveugles) proposent à leurs auditeurs un service
                            personnalisé d&apos;enregistrement des livres et documents de leurs choix.
                        </p>
                    </div>

                    {/* Le téléphone d'abord : beaucoup de nos auditeurs appellent
                        plutôt que d'écrire. Il n'apparaissait que sur la page du
                        catalogue. Sa propre carte, à côté du titre sur grand écran :
                        en ligne sous l'introduction, les deux numéros se
                        repliaient à côté du courriel et la moitié droite de
                        l'écran restait vide. */}
                    {contact && (
                        <div className="glass-card relative space-y-4 overflow-hidden p-6 pl-8 lg:col-span-5">
                            {/* Le filet orange du logo, dessiné à part : la bordure
                                de .glass-card l'emporte sur un border-l-4. */}
                            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-orange-eca" />
                            <p className="flex gap-3 text-xl font-semibold text-foreground">
                                <Phone aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-eca" />
                                <span>
                                    <span className="sr-only">Téléphone : </span>
                                    <PhoneLines text={contact.phones} />
                                </span>
                            </p>
                            <p className="flex gap-3">
                                <Mail aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-eca" />
                                <a href={`mailto:${contact.email}`} className={`${lien} [overflow-wrap:anywhere]`}>{contact.email}</a>
                            </p>
                            <p className="pl-8">
                                <Link href="/contact" className={lien}>Coordonnées</Link>
                            </p>
                        </div>
                    )}
                </header>

                {/* Les deux publics du site, chacun avec sa suite — et, entre
                    eux, la phrase qui dit ce qui les relie : placée sous les deux
                    cartes, à égale distance de l'une et de l'autre, plutôt que
                    seule entre les cartes et les chiffres. */}
                <div className="space-y-10">
                    <div className="grid gap-5 md:grid-cols-2">
                        <section aria-labelledby="auditeurs" className="glass-card flex flex-col gap-4 p-6 sm:p-8">
                            <div className="flex items-center gap-4">
                                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-blue-300/15">
                                    <Headphones className="h-6 w-6 text-primary dark:text-blue-300" />
                                </span>
                                <h2 id="auditeurs" className="text-2xl font-bold text-foreground">Auditeurs</h2>
                            </div>
                            <p className="flex-1 text-muted-foreground">
                                Les auditeurs peuvent faire parvenir aux ECA tous livres ou documents dont ils souhaitent
                                l&apos;enregistrement vocal que ce soit pour leur divertissement, leurs besoins professionnels
                                ou de formation. Les ECA mettent aussi à leur disposition les titres du catalogue.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Link href="/catalogue" className={bouton}>
                                    Catalogue <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                </Link>
                                <Link href="/contact" className={boutonSecondaire}>Contact</Link>
                            </div>
                        </section>
                        <section aria-labelledby="lecteurs" className="glass-card flex flex-col gap-4 p-6 sm:p-8">
                            <div className="flex items-center gap-4">
                                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-blue-300/15">
                                    <Mic className="h-6 w-6 text-primary dark:text-blue-300" />
                                </span>
                                <h2 id="lecteurs" className="text-2xl font-bold text-foreground">Lecteurs bénévoles</h2>
                            </div>
                            <p className="flex-1 text-muted-foreground">
                                Les ECA mettent en contact des lecteurs bénévoles formés par l&apos;association et des auditeurs
                                déficients visuels qui accèdent ainsi au plaisir de l&apos;écoute des textes qu&apos;ils ont choisis.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Link href="/nous-rejoindre" className={bouton}>
                                    Nous rejoindre <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                </Link>
                            </div>
                        </section>
                    </div>

                    {/* Du texte, pas une carte : rien ici ne se clique. Les deux
                        filets, purement décoratifs, le posent en travers des deux
                        colonnes comme un pont. */}
                    <div className="flex items-center gap-6">
                        <span aria-hidden="true" className="hidden h-px flex-1 bg-foreground/20 md:block" />
                        <p className="max-w-2xl text-xl font-medium md:text-center text-foreground">
                            Ainsi se met en place une passerelle humaine et chaleureuse entre voyants et malvoyants.
                            C&apos;est donc un service à la carte qui est proposé.
                        </p>
                        <span aria-hidden="true" className="hidden h-px flex-1 bg-foreground/20 md:block" />
                    </div>
                </div>

                {chiffres && <AujourdhuiAuxEca chiffres={chiffres} />}
            </div>
        </main>
        </div>
    );
}
