/**
 * ECA Portal — development seed.
 *
 * Goal: after `pnpm prisma db seed` on a fresh database, anyone who cloned the
 * repo can sign in and exercise EVERY page and service — catalogue, coups de
 * cœur, demandes (orders), attributions (assignments), factures (bills),
 * paiements, users of every type/access level, the /admin/review duplicate
 * fusion, the super-admin /admin/stats dashboard, and the DB-backed CMS pages.
 *
 * The reference/catalogue rows are anonymised extracts from the real dev DB
 * (book titles/authors, genres, media formats, statuses, civilities, public
 * CMS content). All people are fictional — no real names or emails.
 *
 * Login (every seeded account, same password): Password123!
 *   claude@eca.test        Super Admin  — dev agent account (ClaudeDev2026!)
 *   superadmin@eca.test    Super Admin  — sees everything, incl. /admin/stats
 *   permanent@eca.test     Permanent    — back-office staff (admin access)
 *   permanent2@eca.test    Permanent    — second staff member (for stats spread)
 *   informaticien@eca.test Informaticien (admin access)
 *   lecteur1@eca.test …    Lecteurs (readers, member access)
 *   auditeur1@eca.test …   Auditeurs (listeners, member access)
 *   bienfaiteur1@eca.test  Donateur (member access)
 *
 * Safety: if the target database already holds real data (> 20 users) the seed
 * refuses to run unless you pass SEED_RESET=true, so it can never wipe the
 * populated dev/prod DB by accident. On a fresh clone it just runs.
 */
import 'dotenv/config';
import { hash } from 'bcrypt';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL (or DIRECT_URL) must be set to run the seed.');
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ── date helpers ─────────────────────────────────────────────────────────────
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const yearStart = (y: number) => new Date(Date.UTC(y, 0, 1));

// ── reference data (from the dev DB, non-personal) ───────────────────────────
const GENRES: { name: string; description: string | null }[] = [
    { name: "Non classé", description: "Ouvrages qui ne correspondent à aucune catégorie spécifique" },
    { name: "Autobiographies-Mémoires", description: "Récits personnels relatant la vie et les expériences de leurs auteurs" },
    { name: "Roman étranger", description: "Œuvres de fiction traduites de langues étrangères" },
    { name: "Religion - Spiritualité", description: "Ouvrages traitant des croyances religieuses et des pratiques spirituelles" },
    { name: "Histoire-Politique", description: "Livres analysant les événements historiques et leur contexte politique" },
    { name: "Roman français", description: "Œuvre de fiction écrite par des auteurs français" },
    { name: "Policiers - Thrillers", description: "Romans à suspense mettant en scène des enquêtes criminelles" },
    { name: "Sciences - Médecine", description: "Ouvrages scientifiques et médicaux pour professionnels et grand public" },
    { name: "Essais - Chroniques", description: "Textes analytiques et réflexifs sur des sujets variés" },
    { name: "Contes - Nouvelles", description: "Courts récits de fiction, histoires traditionnelles et contemporaines" },
    { name: "Biographies", description: "Récits de vie de personnalités marquantes" },
    { name: "Témoignage", description: "Récits personnels d'expériences vécues" },
    { name: "Psychologie - Développement personnel", description: "Ouvrages sur la compréhension de soi et l'épanouissement personnel" },
    { name: "Voyages", description: "Récits d'aventures et guides de destinations" },
    { name: "Philosophie", description: "Réflexions sur les questions fondamentales de l'existence et de la pensée" },
    { name: "Vie domestique", description: "Guides pratiques pour la gestion du foyer et la vie quotidienne" },
    { name: "Arts - Culture", description: "Ouvrages sur les expressions artistiques et les phénomènes culturels" },
    { name: "Théâtre - Poésie", description: "Œuvres dramatiques et poétiques" },
    { name: "Divers", description: "Ouvrages aux thématiques variées ne correspondant pas aux autres catégories" },
    { name: "Ouvrages scolaires", description: "Manuels et supports pédagogiques pour l'enseignement" },
    { name: "Langue et langues", description: "Livres sur la linguistique et l'apprentissage des langues" },
    { name: "Economie- Finance", description: "Analyses des phénomènes économiques et financiers" },
    { name: "Droit - Economie", description: "Ouvrages juridiques et économiques" },
    { name: "Littérature Jeunesse", description: "Livres destinés aux jeunes lecteurs" },
    { name: "Technologies", description: "Ouvrages sur les innovations et avancées technologiques" },
    { name: "Périodiques", description: "Publications régulières : magazines, revues et journaux" },
    { name: "Sociologie", description: "Études des phénomènes sociaux et des comportements collectifs" },
    { name: "Bande dessinée", description: "Romans graphiques et bandes dessinées" },
    { name: "Roman historique", description: "Romans se déroulant dans un contexte historique précis" },
    { name: "Politique", description: "Analyses des systèmes et événements politiques" },
    { name: "Archéologie", description: "Études des civilisations anciennes à travers leurs vestiges" },
    { name: "Arts", description: "Ouvrages dédiés aux différentes formes d'expression artistique" },
    { name: "Spiritualité", description: "Exploration des pratiques et croyances spirituelles" },
    { name: "Essai", description: "Textes réflexifs sur des sujets divers" },
    { name: "Histoire", description: "Études des événements et périodes historiques" },
    { name: "Poésie", description: "Œuvres poétiques et analyses de la poésie" },
    { name: "Alimentation", description: "Ouvrages sur la nutrition et la gastronomie" },
    { name: "Médecine", description: "Ouvrages médicaux pour professionnels et grand public" },
    { name: "Sciences", description: "Ouvrages scientifiques pour professionnels et grand public" },
    { name: "Santé, bien-être", description: "Ouvrages sur la santé et le bien-être" },
    { name: "Vie quotidienne", description: "Guides pratiques pour la vie de tous les jours" },
    { name: "Humour", description: "Ouvrages humoristiques" },
    { name: "Musique", description: "Ouvrages sur la musique et les musiciens" },
    { name: "Animaux", description: "Ouvrages consacrés aux animaux" },
    { name: "Esotérisme", description: "Ouvrages sur les sciences occultes et l'ésotérisme" },
    { name: "Religion", description: "Ouvrages traitant des religions" },
    { name: "Nature", description: "Ouvrages sur la nature et l'environnement" },
    { name: "Enquête", description: "Enquêtes journalistiques et documentaires" },
    { name: "Handicap", description: "Ouvrages sur le handicap et l'accessibilité" },
    { name: "Sport", description: "Ouvrages consacrés au sport" },
];

// Assignment/Order statuses (Status model). sortOrder drives selector ordering.
const STATUSES = [
    { name: "Attente envoi vers lecteur", description: "En attente d'envoi vers le lecteur", sortOrder: 1 },
    { name: "En cours", description: "Demande en cours de traitement", sortOrder: 2 },
    { name: "Terminé", description: "Demande terminée", sortOrder: 3 },
    { name: "Soldé", description: "Soldé", sortOrder: 4 },
];

const MEDIA_FORMATS = [
    { name: "K7", description: "Cassette audio" },
    { name: "CDR", description: "CD enregistrable" },
    { name: "DVDR", description: "DVD enregistrable" },
    { name: "MD", description: "MiniDisc" },
    { name: "WeTransfer", description: "Transfert numérique via WeTransfer" },
    { name: "Clé USB", description: "Clé USB" },
    // Les revues (Revue AFTC, LUMEN, COLIN MAILLARD, Gazette Paris en Compagnie,
    // La vie à Bry, Revue EDF) ont été retirées : ce sont des périodiques, pas
    // des formats de média. Ne pas les remettre ici.
    { name: "Non défini", description: "Ce format de média n'a pas été défini" },
];

const CIVILITIES = [
    "Madame", "Monsieur", "Mademoiselle", "Dr", "Pr", "Maître",
    "Non-binaire", "Neutre", "Sans civilité", "Autre",
].map((name, i) => ({ name, sortOrder: i, isActive: true }));

// Anonymised catalogue extract (real titles/authors/descriptions, no personal data).
type SeedBook = {
    title: string; author: string; subtitle: string | null; publisher: string | null;
    isbn: string | null; year: number | null; durationMinutes: number | null;
    pageCount: number | null; genres: string[]; description: string | null;
};
const BOOKS: SeedBook[] = [
    { title: "Une histoire française", author: "Alain JUPPE", subtitle: "Mémoires", publisher: "Tallandier", isbn: "9791021051607", year: 2023, durationMinutes: 815, pageCount: 324, genres: ["Autobiographies-Mémoires"], description: "Dans ses Mémoires, Alain Juppé raconte près de cinquante ans de vie publique — plusieurs fois ministre, Premier ministre et maire de Bordeaux — et se livre sans fard sur son enfance à Mont-de-Marsan, ses racines catholiques et son amour des livres." },
    { title: "Lettres à Joséphine", author: "NAPOLEON", subtitle: null, publisher: null, isbn: null, year: 1833, durationMinutes: null, pageCount: null, genres: ["Roman français"], description: null },
    { title: "Idaho", author: "Emily RUSKOVICH", subtitle: null, publisher: null, isbn: null, year: 2017, durationMinutes: null, pageCount: null, genres: ["Roman étranger"], description: null },
    { title: "L'effet papillon", author: "Jussi ADLER-OLSEN", subtitle: null, publisher: null, isbn: null, year: 2015, durationMinutes: null, pageCount: null, genres: ["Policiers - Thrillers"], description: "Une enquête du Département V. Quand William Stark disparaît après un SMS envoyé du Cameroun, une mécanique implacable se met en marche." },
    { title: "Eleanor Roosevelt : les passions d'une présidente", author: "Béata de ROBIEN", subtitle: null, publisher: null, isbn: null, year: 2000, durationMinutes: null, pageCount: null, genres: ["Biographies"], description: "Le portrait d'une première dame qui transforma sa vie et son pays." },
    { title: "Les grandes plaidoiries des ténors du barreau, Tome 2", author: "Matthieu ARON", subtitle: "Quand les mots peuvent tout changer", publisher: "Jacob Duvernet", isbn: "9782847242973", year: 2010, durationMinutes: 491, pageCount: 316, genres: ["Essais - Chroniques"], description: "Matthieu Aron fait revivre les plaidoiries des plus grands avocats français, reconstituées à partir de ses notes d'audience." },
    { title: "Le Sang des farines", author: "Jean-François PAROT", subtitle: null, publisher: null, isbn: null, year: 2006, durationMinutes: 703, pageCount: null, genres: ["Policiers - Thrillers"], description: "Une enquête de Nicolas Le Floch dans le Paris du XVIIIe siècle." },
    { title: "La nuit sexuelle", author: "Pascal QUIGNARD", subtitle: null, publisher: null, isbn: null, year: null, durationMinutes: null, pageCount: null, genres: ["Philosophie"], description: "L'auteur a recours à l'anthropologie, la philosophie, aux textes grecs et romains et à l'art pour explorer les facettes de la sexualité." },
    { title: "La femme de guerre", author: "Bernard CLAVEL", subtitle: null, publisher: null, isbn: null, year: 1978, durationMinutes: null, pageCount: null, genres: ["Roman français"], description: "Hortense d'Eternoz et le docteur Alexandre Blondel ont sauvé et soigné des dizaines d'enfants victimes de la guerre." },
    { title: "Junil", author: "Joan-Lluis LLUIS", subtitle: null, publisher: "Les Argonautes", isbn: "9782494289451", year: 2024, durationMinutes: null, pageCount: 275, genres: ["Roman étranger"], description: "À l'aube du premier siècle, la jeune Junil fuit l'Empire avec trois amis esclaves dans un voyage périlleux au cœur des terres barbares." },
    { title: "Insurgés et visionnaires d'Amérique Latine", author: "Arturo Uslar PIETRI", subtitle: null, publisher: null, isbn: null, year: 1995, durationMinutes: null, pageCount: null, genres: ["Essais - Chroniques"], description: "Une autre vision de l'Amérique Latine, celle du métissage culturel et des liens avec l'Europe." },
    { title: "Se souvenir du futur", author: "Romuald LETERRIER", subtitle: "Guider son avenir par les synchronicités", publisher: null, isbn: null, year: 2019, durationMinutes: null, pageCount: null, genres: ["Psychologie - Développement personnel"], description: "Une méthode qui repose sur la « rétrocausalité », une influence qui s'exerce à rebours du temps." },
    { title: "Le domaine des oliviers", author: "Edouard BRASEY", subtitle: null, publisher: null, isbn: null, year: 2016, durationMinutes: null, pageCount: null, genres: ["Roman français"], description: "Les Baux-de-Provence, juillet 1913. Aimé Groussan achète une oliveraie à l'abandon et contrarie les plans d'un puissant fabricant de savons." },
    { title: "Danser les ombres", author: "Laurent GAUDÉ", subtitle: null, publisher: null, isbn: null, year: 2015, durationMinutes: null, pageCount: null, genres: ["Roman français"], description: "Une jeune femme revient à Port-au-Prince pour inventer sa vie. Mais la terre qui tremble redistribue les cartes de toute existence." },
    { title: "Les larmes du lagon", author: "Nicolas FEUZ", subtitle: null, publisher: "Slatkine et cie", isbn: "9782889442171", year: 2023, durationMinutes: 346, pageCount: 263, genres: ["Policiers - Thrillers"], description: "L'ex-inspectrice Tanja Stojkaj, exilée en Polynésie française, découvre derrière les eaux turquoise de Bora Bora l'envers de la carte postale." },
    { title: "Le fugitif", author: "Régis ARNAUD, Yann ROUSSEAU", subtitle: "Les secrets de Carlos Ghosn", publisher: "Stock", isbn: "9782234088757", year: 2020, durationMinutes: 472, pageCount: 270, genres: ["Biographies", "Politique"], description: "Complot politico-économique ou hold-up en col blanc ? L'enquête sur la chute et la fuite spectaculaire de Carlos Ghosn." },
    { title: "La zone d'intérêt", author: "Martin AMIS", subtitle: null, publisher: null, isbn: null, year: 2015, durationMinutes: null, pageCount: null, genres: ["Histoire-Politique"], description: "Une manière habile de caricaturer le mécanisme de l'horreur pour le rendre plus insoutenable encore." },
    { title: "Marie-Madeleine : la Reine Oubliée, Tome 2", author: "Christian DOUMERGUE", subtitle: "La Terre Élue", publisher: null, isbn: null, year: 2004, durationMinutes: null, pageCount: null, genres: ["Religion - Spiritualité"], description: "La vie de Marie-Madeleine après la disparition de Jésus, à la lumière de textes déclarés hérétiques par l'Église de Rome." },
    { title: "Lettres ouvertes aux cons", author: "Yvan AUDOUARD", subtitle: null, publisher: null, isbn: null, year: 1974, durationMinutes: null, pageCount: null, genres: ["Divers"], description: "Une chronique mordante et pleine d'humour sur la bêtise ordinaire." },
    { title: "Parcours Troyes", author: "COLLECTIF", subtitle: null, publisher: "Ville de Troyes", isbn: null, year: 2004, durationMinutes: null, pageCount: 16, genres: ["Arts"], description: null },
    { title: "Science et champ akashique", author: "Ervin LASZLO", subtitle: null, publisher: null, isbn: null, year: 2005, durationMinutes: null, pageCount: null, genres: ["Essais - Chroniques"], description: "Le champ akashique est un champ cosmique reliant tout à tout au plus profond de la réalité." },
    { title: "Les insurgents", author: "Gardner P. FOX", subtitle: null, publisher: null, isbn: null, year: 2025, durationMinutes: null, pageCount: null, genres: ["Roman étranger"], description: "Un western classique." },
    { title: "Amityville, la maison du diable", author: "Jay ANSON", subtitle: null, publisher: null, isbn: null, year: 1977, durationMinutes: null, pageCount: null, genres: ["Divers"], description: "Amityville, banlieue de New York, 13 novembre 1974. Un roman d'horreur devenu culte." },
    { title: "La France contre les robots", author: "Georges BERNANOS", subtitle: null, publisher: null, isbn: null, year: 2021, durationMinutes: null, pageCount: null, genres: ["Essais - Chroniques"], description: "Un pamphlet visionnaire sur la machine et la liberté, d'une incroyable actualité un demi-siècle après." },
    { title: "Homo : histoire plurielle d'un genre très singulier", author: "Claude-Louis GALLIEN", subtitle: null, publisher: null, isbn: null, year: 2014, durationMinutes: null, pageCount: null, genres: ["Sciences - Médecine"], description: "Qu'est-ce que l'Homme ? D'où venons-nous ? Un panorama de l'évolution humaine, préfacé par Yves Coppens." },
    { title: "Mes rendez-vous avec Walter Höffer", author: "Patricia DARRE", subtitle: null, publisher: null, isbn: null, year: 2021, durationMinutes: null, pageCount: null, genres: ["Psychologie - Développement personnel"], description: "Le récit d'une rencontre singulière avec un ange gardien, autour du pardon et de la réconciliation." },
    { title: "Promenades dans le Paris disparu", author: "Leonard PITT", subtitle: null, publisher: null, isbn: null, year: 2002, durationMinutes: null, pageCount: null, genres: ["Essais - Chroniques"], description: "Comment le tissu urbain du Paris d'avant Haussmann a été transformé en l'espace d'un siècle." },
    { title: "La joie, ma boussole", author: "Nikolaas SINTOBIN", subtitle: null, publisher: null, isbn: null, year: 2019, durationMinutes: null, pageCount: null, genres: ["Religion - Spiritualité"], description: null },
    { title: "Tous autonomes !", author: "Barbara RIXT", subtitle: null, publisher: null, isbn: null, year: 2018, durationMinutes: null, pageCount: null, genres: ["Essais - Chroniques"], description: "Une étude des paradoxes de l'autonomie, entre injonctions politiques et aspirations à l'autodétermination." },
    { title: "Chromosome 6", author: "Robin COOK", subtitle: null, publisher: "Le livre de poche", isbn: null, year: 2002, durationMinutes: 1022, pageCount: 538, genres: ["Policiers - Thrillers"], description: "Aux frontières de la science et de l'anticipation : un cadavre mutilé, un code ADN impossible et une organisation médico-scientifique sans éthique." },
    { title: "Devine qui vient tuer", author: "Anthony HOROWITZ", subtitle: null, publisher: null, isbn: null, year: 2007, durationMinutes: null, pageCount: null, genres: ["Littérature Jeunesse"], description: "Le détective Tim Diamant et son frère Nick doivent retrouver Charon, un tueur à gages insaisissable." },
    { title: "Les noces maudites du Sieur Vaval", author: "Robert SEBAS", subtitle: null, publisher: "Atipa Editions", isbn: "9782959683909", year: 2024, durationMinutes: 464, pageCount: 177, genres: ["Voyages"], description: "Le mythe du roi Vaval, figure emblématique du carnaval en Guyane et dans les Antilles." },
    { title: "Le sens du bétail", author: "Ulysse THEVENON", subtitle: "Vous ne mangerez plus jamais de la même façon", publisher: "Flammarion", isbn: "9782080432964", year: 2025, durationMinutes: 434, pageCount: 302, genres: ["Enquête", "Alimentation"], description: "Deux ans d'enquête au cœur de l'industrie de l'élevage français, racontée par ses propres acteurs." },
    { title: "La sentence", author: "John GRISHAM", subtitle: null, publisher: null, isbn: null, year: 2020, durationMinutes: null, pageCount: null, genres: ["Policiers - Thrillers"], description: "Octobre 1946, Mississippi. Pete Banning, héros de guerre décoré, abat calmement son ami le révérend Dexter Bell. Pourquoi ?" },
    { title: "L'empire du dragon", author: "Paul-Loup SULITZER", subtitle: null, publisher: null, isbn: null, year: 2006, durationMinutes: null, pageCount: null, genres: ["Roman français"], description: "Guy Deroubaix monte un empire textile familial français au cœur de l'empire du Dragon, entre triades de Shanghai et underground de Pékin." },
    { title: "Le voyage de Ritavan et ses douze chats", author: "Myrrha DJIAN-GUTENBERG, Samuel DJIAN-GUTENBERG", subtitle: null, publisher: "Le Courrier du Livre", isbn: "9782702913338", year: 2019, durationMinutes: 495, pageCount: 376, genres: ["Esotérisme"], description: "Un oracle richement illustré et un jeu de développement personnel pour mieux se comprendre soi-même et les autres." },
    { title: "D'or et de sang : La malédiction des Valois", author: "Catherine HERMARY-VIEILLE", subtitle: null, publisher: null, isbn: null, year: 2016, durationMinutes: null, pageCount: null, genres: ["Roman historique"], description: "Les dernières décennies du règne des Valois, de la mort d'Henri II à Henri III, jusqu'à l'apogée sanglant de la Saint-Barthélemy." },
    { title: "Millénium 4 : Ce qui ne me tue pas", author: "David LAGERCRANTZ", subtitle: null, publisher: null, isbn: null, year: 2019, durationMinutes: null, pageCount: null, genres: ["Policiers - Thrillers"], description: "Mikael Blomkvist a besoin de Lisbeth Salander pour un cocktail de scandales politiques et de jeux de pouvoir internationaux." },
    { title: "Le mouvement ouvrier pendant la Première Guerre mondiale", author: "Alfred ROSMER", subtitle: null, publisher: null, isbn: null, year: 1936, durationMinutes: null, pageCount: null, genres: ["Histoire-Politique"], description: "Une réédition d'un ouvrage de référence sur le mouvement ouvrier et la Grande Guerre." },
    { title: "Réfléchissez et devenez riche", author: "Napoleon HILL", subtitle: "Le guide d'action", publisher: null, isbn: null, year: 2021, durationMinutes: null, pageCount: null, genres: ["Psychologie - Développement personnel"], description: "Le guide d'action tiré du chef-d'œuvre de 1937 : treize principes éprouvés pour traduire ses désirs en réalité." },
];

// A ready-made duplicate pair for the /admin/review fusion workflow. The flagged
// book's id_arbre points at the canonical book's source_access_id (see the review
// page: id_arbre → source_access_id).
const CANONICAL_SOURCE_ID = 90001;

// ── public CMS content (correct French; org info is public, not personal) ─────
const HISTORY = [
    { year: 1985, iconKey: "Calendar", title: "Création d'ECA", description: "ECA a été créée par Mesdames Marguerite de Praslin et Odile Testa avec, comme objectif, l'enregistrement de tous documents utiles à la profession ou aux loisirs des aveugles et malvoyants. À la création, ECA signifie « Enregistrements sur Cassettes pour les Aveugles »." },
    { year: 1987, iconKey: "FileText", title: "Premier bulletin d'informations", description: "Parution du premier numéro du bulletin d'informations « le coup d'œil d'ECA »." },
    { year: 1992, iconKey: "Award", title: "Reconnaissance d'utilité publique", description: "L'association est reconnue d'utilité publique (décret du 30 octobre 1992, paru au Journal Officiel le 5 novembre 1992)." },
    { year: 2005, iconKey: "Bookmark", title: "Changement de nom", description: "L'association devient « Enregistrements à la Carte pour les Aveugles »." },
    { year: 2008, iconKey: "BookOpen", title: "Catalogue « Lu Pour Vous ! »", description: "Création du catalogue « Lu Pour Vous ! », une sélection des enregistrements les plus demandés par les auditeurs." },
    { year: 2009, iconKey: "Archive", title: "Intégration à la BDEA", description: "Les enregistrements figurant dans le catalogue « Lu Pour Vous ! » entrent dans la Banque de Données de l'Édition Adaptée (BDEA) de l'Institut National des Jeunes Aveugles." },
    { year: 2012, iconKey: "Archive", title: "Stockage informatique", description: "ECA garde en mémoire les ouvrages enregistrés, grâce à une importante unité de stockage informatique." },
    { year: 2014, iconKey: "Heart", title: "Création des « Coups de Cœur »", description: "Création des « Coups de Cœur », palmarès mensuel des enregistrements recommandés par les lecteurs et les permanentes de l'association." },
    { year: 2018, iconKey: "Users", title: "Délégation des Auxiliaires des Aveugles", description: "Aux termes du décret du 5 septembre 2018 paru au J.O. du 7 septembre 2018, ECA devient une délégation des Auxiliaires des Aveugles, association loi de 1901 reconnue d'utilité publique, et prend le nom de « ECA / Délégation des Auxiliaires des Aveugles »." },
    { year: 2023, iconKey: "Bookmark", title: "Évolution des coups de cœur", description: "Les coups de cœur deviennent « Listes de livres » et paraissent tous les deux mois." },
];

const PRACTICAL_INFO = [
    { iconKey: "BookMarked", colorTheme: "blue", question: "Comment ça marche ?", sortOrder: 0, active: true, body: "Membre des ECA (vous avez acquitté votre adhésion annuelle), vous postez le(s) livre(s) — l'envoi postal est gratuit grâce au cécogramme — ou vous le(s) déposez à l'adresse des ECA en indiquant éventuellement vos consignes de lecture.\n\nEnsuite le document est adressé pour enregistrement à un lecteur bénévole. Une fois la lecture terminée, les ECA vous adressent en retour votre livre et l'enregistrement audio au format mp3 (CD, clé USB, plateforme WeTransfer…)." },
    { iconKey: "Clock", colorTheme: "purple", question: "Quel est le délai d'enregistrement d'un livre par un lecteur ?", sortOrder: 1, active: true, body: "**4 à 6 semaines**, ce délai varie en fonction du nombre de pages et de la difficulté du texte.\n\nUne demande urgente (examens, présentation…) est bien évidemment prise en compte." },
    { iconKey: "Euro", colorTheme: "green", question: "Combien ça coûte ?", sortOrder: 2, active: true, body: "Chaque enregistrement est facturé **3 €**, il reste votre propriété exclusive et il est réservé à votre usage personnel.\n\nLa facture vous est adressée pour règlement lorsqu'elle atteint **21 €**, ou avant en fin d'année comptable." },
    { iconKey: "BookMarked", colorTheme: "amber", question: "Peut-on obtenir des enregistrements déjà demandés par d'autres adhérents ?", sortOrder: 3, active: true, body: "Bien sûr, le catalogue des livres enregistrés est à la disposition des adhérents et peut être consulté en ligne sur le site.\n\nIl vous suffit de commander la duplication du livre qui vous intéresse par mail, téléphone ou courrier. Chaque duplication coûte **3 €**." },
    { iconKey: "HelpCircle", colorTheme: "red", question: "J'ai une question, je cherche un livre, j'ai une réclamation…", sortOrder: 4, active: true, body: "N'hésitez pas à nous contacter, les ECA tiennent toute l'année deux permanences hebdomadaires ouvertes au public :\n\n- **Mardi de 9h à 17h**\n- **Jeudi de 9h à 14h**\n\nSi vous êtes de passage à Paris, venez nous rencontrer au 71 avenue de Breteuil, 75015 Paris." },
];

const MEMBERSHIP_OPTIONS = [
    { iconKey: "Headphones", colorTheme: "blue", title: "Auditeur", sortOrder: 0, active: true, highlightLabel: "Cotisation annuelle", highlightValue: "50 €", bullets: "Non déductible des impôts, au titre de l'accession à un service\nPermet de voter à l'assemblée générale des Auxiliaires des Aveugles", ctaLabel: null, ctaHref: null, body: "Vous êtes aveugle ou malvoyant. Après paiement de votre cotisation annuelle, vous devenez auditeur membre d'ECA et avez également accès à tous les services et activités de l'association Auxiliaires des Aveugles.\n\nEn ce qui concerne les enregistrements, vous pouvez faire parvenir à ECA les livres, revues ou documents qui vous intéressent. Ce sont VOS livres que lisent les lecteurs." },
    { iconKey: "BookOpen", colorTheme: "green", title: "Lecteur", sortOrder: 1, active: true, highlightLabel: "Cotisation annuelle", highlightValue: "20 €", bullets: "Déductible des impôts\nPermet d'être assuré et de voter à l'assemblée générale des Auxiliaires des Aveugles", ctaLabel: null, ctaHref: null, body: "Vous aimez lire à haute voix, vous avez une voix agréable et vous articulez clairement. Vous avez du temps libre et votre environnement est calme.\n\nRejoignez l'équipe de lecteurs, vivant dans toute la France, et qui, pour certains, peuvent lire en allemand, anglais, arabe, espagnol, grec ou italien." },
    { iconKey: "Clock", colorTheme: "amber", title: "Animateur de permanence", sortOrder: 2, active: true, highlightLabel: "Cotisation annuelle", highlightValue: "20 €", bullets: "Mêmes conditions que pour les lecteurs\nPermet d'être assuré pendant vos activités", ctaLabel: null, ctaHref: null, body: "Vous pouvez consacrer régulièrement une ou une demi-journée par semaine pour venir au siège afin d'accueillir lecteurs ou malvoyants, gérer les livres reçus ou envoyés, participer à des actions de communication ou assurer la comptabilité.\n\n**En un mot, mettre vos compétences à la disposition d'ECA.**" },
    { iconKey: "Heart", colorTheme: "red", title: "Bienfaiteur", sortOrder: 3, active: true, highlightLabel: "Avantage fiscal", highlightValue: "Vos dons sont déductibles des impôts à hauteur de 66 % dans la limite de 20 % de votre revenu imposable.", bullets: null, ctaLabel: "Faire un don", ctaHref: "/faire-un-don", body: "Nous ne bénéficions d'aucune subvention. Grâce à votre don, vous permettez à ECA de poursuivre sa mission.\n\nVos dons nous permettent d'acquérir du matériel d'enregistrement, de former nos lecteurs et d'améliorer nos services pour les personnes malvoyantes." },
];

const TEAM_MEMBERS = [
    { name: "Marguerite Laval", role: "Présidente", section: "DIRECTION", sortOrder: 0 },
    { name: "Odette Sinclair", role: "Vice-présidente", section: "DIRECTION", sortOrder: 1 },
    { name: "Bernard Aubry", role: "Trésorier", section: "DIRECTION", sortOrder: 2 },
    { name: "Françoise Rey", role: "Administratrice", section: "CONSEIL", sortOrder: 0 },
    { name: "Henri Colin", role: "Administrateur", section: "CONSEIL", sortOrder: 1 },
    { name: "Lucie Marchand", role: "Administratrice", section: "CONSEIL", sortOrder: 2 },
    { name: "Yvonne Faure", role: "Permanente", section: "PERMANENCE", sortOrder: 0 },
    { name: "Gérard Simon", role: "Permanent", section: "PERMANENCE", sortOrder: 1 },
    { name: "Alice Perrot", role: "Permanente", section: "PERMANENCE", sortOrder: 2 },
];

async function main() {
    // ── safety guard ─────────────────────────────────────────────────────────
    const existingUsers = await prisma.user.count();
    if (existingUsers > 20 && process.env.SEED_RESET !== 'true') {
        console.error(
            `\n✋ Refusing to seed: the database already has ${existingUsers} users.\n` +
            `   This seed WIPES the tables it manages before inserting demo data.\n` +
            `   If you really want to reset THIS database, re-run with SEED_RESET=true.\n`,
        );
        await prisma.$disconnect();
        process.exit(1);
    }

    console.log('🧹 Resetting seeded tables…');
    // FK-safe order: children before parents.
    await prisma.billEvent.deleteMany();
    await prisma.assignmentReader.deleteMany();
    await prisma.assignment.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orders.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.coupsDeCoeurBooks.deleteMany();
    await prisma.coupsDeCoeur.deleteMany();
    await prisma.bookGenre.deleteMany();
    await prisma.news.deleteMany();
    await prisma.bookMergeEvent.deleteMany();
    await prisma.userActivityEvent.deleteMany();
    await prisma.address.deleteMany();
    await prisma.readerLanguage.deleteMany();
    await prisma.book.deleteMany();
    await prisma.user.deleteMany();
    await prisma.genre.deleteMany();
    await prisma.status.deleteMany();
    await prisma.mediaFormat.deleteMany();
    await prisma.civility.deleteMany();
    await prisma.teamMember.deleteMany();
    await prisma.historyEvent.deleteMany();
    await prisma.practicalInfo.deleteMany();
    await prisma.membershipOption.deleteMany();

    // ── reference data ─────────────────────────────────────────────────────
    console.log('📚 Reference data (genres, statuses, media formats, civilities)…');
    await prisma.genre.createMany({ data: GENRES });
    await prisma.status.createMany({ data: STATUSES });
    await prisma.mediaFormat.createMany({ data: MEDIA_FORMATS });
    await prisma.civility.createMany({ data: CIVILITIES });

    const genres = await prisma.genre.findMany();
    const genreId = new Map(genres.map((g) => [g.name, g.id]));
    const statuses = await prisma.status.findMany();
    const statusId = new Map(statuses.map((s) => [s.name, s.id]));
    const mediaFormats = await prisma.mediaFormat.findMany();
    const mediaId = new Map(mediaFormats.map((m) => [m.name, m.id]));
    const civilities = await prisma.civility.findMany();
    const civilityId = new Map(civilities.map((c) => [c.name, c.id]));

    const ST_ATTENTE = statusId.get('Attente envoi vers lecteur')!;
    const ST_ENCOURS = statusId.get('En cours')!;
    const ST_TERMINE = statusId.get('Terminé')!;
    const ST_SOLDE = statusId.get('Soldé')!;

    // ── users ───────────────────────────────────────────────────────────────
    console.log('👤 Users (every member type & access level)…');
    const password = await hash('Password123!', 10);
    const base = {
        password,
        passwordNeedsChange: false,
        role: 'user',
        activityStatus: 'ACTIVE' as const,
    };

    const superAdmin = await prisma.user.create({
        data: {
            ...base, email: 'superadmin@eca.test', name: 'Camille Dubois',
            firstName: 'Camille', lastName: 'Dubois', memberType: 'administration',
            accessLevel: 'super_admin', role: 'admin',
            civilityId: civilityId.get('Madame'), cellPhone: '+33 6 12 34 56 78',
        },
    });
    // Permanent local dev account for Claude Code (see prisma/dev-claude-user.ts,
    // which recreates just this user without wiping anything).
    await prisma.user.create({
        data: {
            ...base, email: 'claude@eca.test', name: 'Claude Dev',
            firstName: 'Claude', lastName: 'Dev', memberType: 'informaticien',
            accessLevel: 'super_admin', role: 'admin',
            password: await hash('ClaudeDev2026!', 10),
            specialization: 'Compte de développement (agent)',
            notes: 'Compte de développement local — ne pas créer en production.',
        },
    });

    const permanentA = await prisma.user.create({
        data: {
            ...base, email: 'permanent@eca.test', name: 'Julien Moreau',
            firstName: 'Julien', lastName: 'Moreau', memberType: 'administration',
            accessLevel: 'admin', civilityId: civilityId.get('Monsieur'),
            homePhone: '+33 1 45 67 89 01',
        },
    });
    const permanentB = await prisma.user.create({
        data: {
            ...base, email: 'permanent2@eca.test', name: 'Sophie Laurent',
            firstName: 'Sophie', lastName: 'Laurent', memberType: 'administration',
            accessLevel: 'admin', civilityId: civilityId.get('Madame'),
        },
    });
    await prisma.user.create({
        data: {
            ...base, email: 'informaticien@eca.test', name: 'Thomas Bernard',
            firstName: 'Thomas', lastName: 'Bernard', memberType: 'informaticien',
            accessLevel: 'admin', specialization: 'Maintenance du portail',
        },
    });

    // Readers (lecteurs)
    const reader1 = await prisma.user.create({
        data: {
            ...base, email: 'lecteur1@eca.test', name: 'Nathalie Petit',
            firstName: 'Nathalie', lastName: 'Petit', memberType: 'lecteur',
            accessLevel: 'member', civilityId: civilityId.get('Madame'),
            saveType: 'AUDACITY', specialization: 'Romans et littérature',
            isAvailable: true, maxConcurrentAssignments: 3,
            languages: { create: [{ language: 'FRANCAIS' }, { language: 'ANGLAIS' }] },
        },
    });
    const reader2 = await prisma.user.create({
        data: {
            ...base, email: 'lecteur2@eca.test', name: 'Philippe Girard',
            firstName: 'Philippe', lastName: 'Girard', memberType: 'lecteur',
            accessLevel: 'member', civilityId: civilityId.get('Monsieur'),
            saveType: 'REAPER', specialization: 'Essais et histoire',
            isAvailable: true, maxConcurrentAssignments: 5,
            languages: { create: [{ language: 'FRANCAIS' }, { language: 'ESPAGNOL' }, { language: 'ITALIEN' }] },
        },
    });
    const reader3 = await prisma.user.create({
        data: {
            ...base, email: 'lecteur3@eca.test', name: 'Isabelle Roux',
            firstName: 'Isabelle', lastName: 'Roux', memberType: 'lecteur',
            accessLevel: 'member', civilityId: civilityId.get('Madame'),
            saveType: 'GARAGEBAND', specialization: 'Jeunesse',
            isAvailable: false, availabilityNotes: 'Indisponible jusqu\'en septembre',
            maxConcurrentAssignments: 2,
            languages: { create: [{ language: 'FRANCAIS' }, { language: 'ALLEMAND' }] },
        },
    });

    // Listeners (auditeurs — the visually impaired members)
    const listener1 = await prisma.user.create({
        data: {
            ...base, email: 'auditeur1@eca.test', name: 'Marcel Fontaine',
            firstName: 'Marcel', lastName: 'Fontaine', memberType: 'auditeur',
            accessLevel: 'member', civilityId: civilityId.get('Monsieur'),
            preferredMediaFormatId: mediaId.get('Clé USB'),
            preferredDeliveryMethod: 'ENVOI', paymentThreshold: 21, currentBalance: 12,
            addresses: { create: [{ addressLine1: '12 rue des Lilas', city: 'Paris', postalCode: '75015', isDefault: true }] },
        },
    });
    const listener2 = await prisma.user.create({
        data: {
            ...base, email: 'auditeur2@eca.test', name: 'Denise Lefebvre',
            firstName: 'Denise', lastName: 'Lefebvre', memberType: 'auditeur',
            accessLevel: 'member', civilityId: civilityId.get('Madame'),
            preferredMediaFormatId: mediaId.get('CDR'),
            preferredDeliveryMethod: 'RETRAIT', paymentThreshold: 21, currentBalance: 0,
            addresses: { create: [{ addressLine1: '5 avenue Victor Hugo', city: 'Lyon', postalCode: '69002', isDefault: true }] },
        },
    });
    const listener3 = await prisma.user.create({
        data: {
            ...base, email: 'auditeur3@eca.test', name: 'André Mercier',
            firstName: 'André', lastName: 'Mercier', memberType: 'auditeur',
            accessLevel: 'member', civilityId: civilityId.get('Monsieur'),
            preferredMediaFormatId: mediaId.get('WeTransfer'),
            preferredDeliveryMethod: 'ENVOI', paymentThreshold: 21, currentBalance: 6,
            addresses: { create: [{ addressLine1: '28 boulevard de la Mer', city: 'Marseille', postalCode: '13008', isDefault: true }] },
        },
    });

    // Donor (bienfaiteur)
    const donor = await prisma.user.create({
        data: {
            ...base, email: 'bienfaiteur1@eca.test', name: 'Hélène Garnier',
            firstName: 'Hélène', lastName: 'Garnier', memberType: 'bienfaiteur',
            accessLevel: 'member', civilityId: civilityId.get('Madame'),
        },
    });

    // Legacy `ecouteur` member type (renders as "Auditeur") — to exercise legacy display.
    await prisma.user.create({
        data: {
            ...base, email: 'ecouteur1@eca.test', name: 'Robert Ancien',
            firstName: 'Robert', lastName: 'Ancien', memberType: 'ecouteur',
            accessLevel: 'member',
        },
    });

    // Inactive user (with activity history) + a soft-deleted user (edge cases).
    const inactive = await prisma.user.create({
        data: {
            ...base, email: 'inactif1@eca.test', name: 'Georges Durand',
            firstName: 'Georges', lastName: 'Durand', memberType: 'lecteur',
            accessLevel: 'member', activityStatus: 'INACTIVE', isActive: false,
            isAvailable: false, activityChangedAt: daysAgo(30),
        },
    });
    await prisma.user.create({
        data: {
            ...base, email: 'supprime@eca.test', name: 'Utilisateur Supprimé',
            firstName: 'Ancien', lastName: 'Compte', memberType: 'lecteur',
            accessLevel: 'member', deletedAt: daysAgo(10),
        },
    });

    const staff = [superAdmin, permanentA, permanentB];
    const listeners = [listener1, listener2, listener3];

    // ── books + genres ────────────────────────────────────────────────────────
    console.log('📖 Catalogue…');
    const books = [];
    for (let i = 0; i < BOOKS.length; i++) {
        const b = BOOKS[i];
        const addedBy = staff[i % staff.length];
        const hasAudio = i % 4 === 0;
        const created = await prisma.book.create({
            data: {
                title: b.title, author: b.author, subtitle: b.subtitle,
                publisher: b.publisher, isbn: b.isbn, description: b.description,
                publishedDate: b.year ? yearStart(b.year) : null,
                readingDurationMinutes: b.durationMinutes, pageCount: b.pageCount,
                available: i % 9 !== 0, addedById: addedBy.id,
                createdAt: daysAgo(60 - i), stock_date: hasAudio ? daysAgo(55 - i) : null,
                audio_filepath: hasAudio ? `audio/demo/${i + 1}-${b.title.slice(0, 20).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.mp3` : null,
                source_access_id: 1000 + i,
                genres: {
                    create: b.genres
                        .map((g) => genreId.get(g))
                        .filter((id): id is number => id != null)
                        .map((id) => ({ genre: { connect: { id } } })),
                },
            },
        });
        books.push(created);
    }

    // Duplicate pair for /admin/review (fusion des doublons).
    const canonical = await prisma.book.create({
        data: {
            title: "L'Étranger", author: 'Albert CAMUS', subtitle: null,
            publisher: 'Gallimard', isbn: '9782070360024', description: "Le roman emblématique d'Albert Camus, figure de l'absurde.",
            publishedDate: yearStart(1942), available: true, addedById: permanentA.id,
            createdAt: daysAgo(20), source_access_id: CANONICAL_SOURCE_ID,
            genres: { create: [{ genre: { connect: { id: genreId.get('Roman français')! } } }] },
        },
    });
    await prisma.book.create({
        data: {
            title: "L'Etranger", author: 'Albert Camus', subtitle: null,
            publisher: 'Gallimard', description: "Doublon importé — à fusionner avec la fiche canonique.",
            publishedDate: yearStart(1942), available: true, addedById: permanentB.id,
            createdAt: daysAgo(3), needsReview: true, id_arbre: CANONICAL_SOURCE_ID,
            genres: { create: [{ genre: { connect: { id: genreId.get('Roman français')! } } }] },
        },
    });
    // A historical fusion, to populate the BookMergeEvent audit log.
    await prisma.bookMergeEvent.create({
        data: {
            canonicalId: canonical.id, duplicateId: 999999,
            performedById: permanentA.id, createdAt: daysAgo(15),
            snapshot: { title: "L'Étranger (doublon)", author: 'A. Camus', isbn: null, note: 'Fiche fusionnée puis supprimée.' },
        },
    });

    // ── news ─────────────────────────────────────────────────────────────────
    console.log('📰 Dernières infos…');
    await prisma.news.createMany({
        data: [
            { title: "Reprise des permanences après les congés d'été", content: "Les permanences du mardi et du jeudi reprennent leur horaire habituel. Nous serons ravis de vous accueillir au 71 avenue de Breteuil.", type: 'ANNONCE', authorId: permanentA.id, publishedAt: daysAgo(2) },
            { title: "Nouvelle liste de livres disponible", content: "Découvrez notre sélection de coups de cœur du mois : de nouveaux enregistrements recommandés par nos lecteurs et permanentes.", type: 'ACTUALITE', authorId: superAdmin.id, publishedAt: daysAgo(9) },
            { title: "Assemblée générale annuelle", content: "L'assemblée générale des Auxiliaires des Aveugles se tiendra le mois prochain. Tous les membres à jour de cotisation peuvent y participer et voter.", type: 'EVENEMENT', authorId: permanentB.id, publishedAt: daysAgo(20) },
            { title: "Bienvenue sur le nouveau portail ECA", content: "Notre portail de gestion a été modernisé. N'hésitez pas à nous faire part de vos retours.", type: 'GENERAL', authorId: superAdmin.id, publishedAt: daysAgo(45) },
        ],
    });

    // ── coups de cœur ──────────────────────────────────────────────────────────
    console.log('💛 Coups de cœur…');
    await prisma.coupsDeCoeur.create({
        data: {
            title: 'Liste de mai 2026', description: 'Notre sélection du printemps.', active: true,
            addedById: permanentA.id, createdAt: daysAgo(40),
            books: { create: books.slice(0, 6).map((b) => ({ book: { connect: { id: b.id } } })) },
        },
    });
    await prisma.coupsDeCoeur.create({
        data: {
            title: 'Liste de mars 2026', description: 'Policiers et thrillers à découvrir.', active: true,
            addedById: permanentB.id, createdAt: daysAgo(100),
            books: { create: books.slice(6, 11).map((b) => ({ book: { connect: { id: b.id } } })) },
        },
    });
    await prisma.coupsDeCoeur.create({
        data: {
            title: 'Archive 2025 (masquée)', description: 'Ancienne liste, non affichée au public.', active: false,
            addedById: permanentA.id, createdAt: daysAgo(300),
            books: { create: books.slice(11, 14).map((b) => ({ book: { connect: { id: b.id } } })) },
        },
    });

    // ── orders (demandes) ──────────────────────────────────────────────────────
    console.log('📥 Demandes (orders)…');
    const deliveryMethods = ['ENVOI', 'RETRAIT', 'NON_APPLICABLE'] as const;
    const orderStatuses = [ST_ATTENTE, ST_ENCOURS, ST_TERMINE, ST_SOLDE];
    const mediaNames = ['Clé USB', 'CDR', 'WeTransfer', 'K7'];
    const orders: any[] = [];
    for (let i = 0; i < 14; i++) {
        const listener = listeners[i % listeners.length];
        const book = books[i % books.length];
        const st = orderStatuses[i % orderStatuses.length];
        const done = st === ST_TERMINE || st === ST_SOLDE;
        const created = await prisma.orders.create({
            data: {
                aveugleId: listener.id, catalogueId: book.id,
                requestReceivedDate: daysAgo(50 - i), createdDate: daysAgo(48 - i),
                closureDate: done ? daysAgo(20 - (i % 15)) : null,
                statusId: st, isDuplication: i % 5 === 0,
                mediaFormatId: mediaId.get(mediaNames[i % mediaNames.length])!,
                deliveryMethod: deliveryMethods[i % deliveryMethods.length],
                processedByStaffId: staff[i % staff.length].id,
                cost: 3, billingStatus: 'UNBILLED', lentPhysicalBook: i % 3 === 0,
                notes: i % 4 === 0 ? 'Demande urgente (examen).' : null,
            },
        });
        orders.push(created);
    }

    // ── assignments (attributions) + reader history ────────────────────────────
    console.log('📤 Attributions (assignments)…');
    for (let i = 0; i < 9; i++) {
        const order = orders[i];
        const reader = [reader1, reader2, reader3][i % 3];
        const st = orderStatuses[i % orderStatuses.length];
        const sent = st !== ST_ATTENTE;
        const returned = st === ST_TERMINE || st === ST_SOLDE;
        const assignment = await prisma.assignment.create({
            data: {
                catalogueId: order.catalogueId, orderId: order.id, statusId: st,
                receptionDate: daysAgo(47 - i),
                sentToReaderDate: sent ? daysAgo(40 - i) : null,
                returnedToECADate: returned ? daysAgo(15 - (i % 12)) : null,
                processedByStaffId: staff[i % staff.length].id,
                deliveryMethod: 'ENVOI',
                notes: i % 3 === 0 ? 'Lecture confiée en priorité.' : null,
                readerHistory: {
                    create: [{ readerId: reader.id, assignedDate: daysAgo(41 - i), notes: 'Attribution initiale.' }],
                },
            },
        });
        void assignment;
    }

    // ── bills (factures) — one per BillingStatus, with audit events ─────────────
    console.log('🧾 Factures (bills) + audit…');
    async function makeBill(
        client: { id: number }, state: 'DRAFT' | 'BILLED' | 'PAID' | 'SOLDE',
        attach: typeof orders, opts: { paymentMethodRef?: string; ageDays: number },
    ) {
        const amount = attach.length * 3;
        const issued = state !== 'DRAFT';
        const paid = state === 'PAID' || state === 'SOLDE';
        const bill = await prisma.bill.create({
            data: {
                clientId: client.id, state, invoiceAmount: amount,
                creationDate: daysAgo(opts.ageDays),
                issueDate: issued ? daysAgo(opts.ageDays - 2) : null,
                paymentDate: paid ? daysAgo(opts.ageDays - 8) : null,
                paymentReference: paid ? opts.paymentMethodRef ?? 'CHQ-DEMO' : null,
            },
        });
        // Attach orders (mark them billed).
        for (const o of attach) {
            await prisma.orders.update({
                where: { id: o.id },
                data: { billId: bill.id, billingStatus: 'BILLED' },
            });
        }
        // Append-only audit trail.
        const events: { type: string; toState?: string; createdAt: Date }[] = [
            { type: 'CREATED', createdAt: daysAgo(opts.ageDays) },
        ];
        if (issued) events.push({ type: 'ISSUED', toState: 'BILLED', createdAt: daysAgo(opts.ageDays - 2) });
        if (state === 'PAID') events.push({ type: 'PAID', toState: 'PAID', createdAt: daysAgo(opts.ageDays - 8) });
        if (state === 'SOLDE') events.push({ type: 'SETTLED', toState: 'SOLDE', createdAt: daysAgo(opts.ageDays - 8) });
        for (const e of events) {
            await prisma.billEvent.create({
                data: {
                    billId: bill.id, type: e.type as never, toState: (e.toState ?? null) as never,
                    performedById: permanentA.id, createdAt: e.createdAt,
                    payload: { note: 'Événement de démonstration.' },
                },
            });
        }
        return bill;
    }
    await makeBill(listener1, 'DRAFT', orders.slice(0, 2), { ageDays: 6 });
    await makeBill(listener2, 'BILLED', orders.slice(2, 5), { ageDays: 18 });
    const paidBill = await makeBill(listener1, 'PAID', orders.slice(5, 7), { ageDays: 30, paymentMethodRef: 'CB-2026-0042' });
    await makeBill(listener3, 'SOLDE', orders.slice(7, 9), { ageDays: 60, paymentMethodRef: 'VIR-2026-0099' });

    // ── payments (paiements) — every type & method ─────────────────────────────
    console.log('💶 Paiements…');
    await prisma.payment.createMany({
        data: [
            { type: 'COTISATION', amount: 50, paymentMethod: 'CHEQUE', clientId: listener1.id, cotisationYear: 2026, creationDate: daysAgo(40), issueDate: daysAgo(40), paymentDate: daysAgo(38), receiptNumber: 'REC-2026-001', isAllocated: true, allocationDate: daysAgo(38) },
            { type: 'COTISATION', amount: 20, paymentMethod: 'VIREMENT', clientId: reader1.id, cotisationYear: 2026, creationDate: daysAgo(35), paymentDate: daysAgo(35), receiptNumber: 'REC-2026-002', isAllocated: true },
            { type: 'ENREGISTREMENT', amount: 6, paymentMethod: 'CB', clientId: listener1.id, billId: paidBill.id, creationDate: daysAgo(22), paymentDate: daysAgo(22), receiptNumber: 'REC-2026-003', isAllocated: true, allocationDate: daysAgo(22) },
            { type: 'DON', amount: 100, paymentMethod: 'VIREMENT', clientId: donor.id, creationDate: daysAgo(15), paymentDate: daysAgo(15), receiptNumber: 'REC-2026-004', fiscalite: 'oui', observations: 'Don avec reçu fiscal.' },
            { type: 'DON', amount: 30, paymentMethod: 'ESPECE', clientId: null, creationDate: daysAgo(12), paymentDate: daysAgo(12), observations: 'Don anonyme en espèces.' },
            { type: 'DIVERS', amount: 15, paymentMethod: 'COMPTE_AUXI', clientId: listener2.id, creationDate: daysAgo(8), observations: 'Régularisation diverse.', isAllocated: false },
        ],
    });

    // ── user activity history ──────────────────────────────────────────────────
    console.log('🗂️  Historique d\'activité…');
    await prisma.userActivityEvent.createMany({
        data: [
            { userId: inactive.id, fromStatus: null, toStatus: 'ACTIVE', changedById: permanentA.id, changedAt: daysAgo(200), comment: 'Adhésion initiale.' },
            { userId: inactive.id, fromStatus: 'ACTIVE', toStatus: 'INACTIVE', reason: 'Départ à la retraite', changedById: permanentA.id, changedAt: daysAgo(30), comment: 'Ne prend plus d\'attributions.' },
        ],
    });

    // ── CMS pages ────────────────────────────────────────────────────────────
    console.log('🌐 Contenu des pages publiques (CMS)…');
    await prisma.siteContact.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            orgName: 'ECA — Enregistrements à la Carte pour les Aveugles',
            orgSubtitle: 'Délégation des Auxiliaires des Aveugles',
            addressLines: '71, avenue de Breteuil\n75015 Paris',
            phones: '+33 1 88 32 31 47\n+33 1 88 32 31 48',
            email: 'ecapermanence@gmail.com',
            hoursText: 'Mardi : 9h - 17h\nJeudi : 9h - 14h',
            metroText: 'Duroc (lignes 10, 13)\nSégur (ligne 10)\nSèvres-Lecourbe (ligne 6)',
            busText: 'Lignes 28, 70, 82, 89, 92',
            visitText: 'Notre équipe sera ravie de vous accueillir pendant nos permanences. N\'hésitez pas à nous contacter avant de vous déplacer.',
        },
    });
    await prisma.teamMember.createMany({ data: TEAM_MEMBERS as never });
    await prisma.historyEvent.createMany({ data: HISTORY });
    await prisma.practicalInfo.createMany({ data: PRACTICAL_INFO });
    await prisma.membershipOption.createMany({ data: MEMBERSHIP_OPTIONS });

    // ── summary ────────────────────────────────────────────────────────────────
    const [users, bookCount, orderCount, billCount, paymentCount] = await Promise.all([
        prisma.user.count(), prisma.book.count(), prisma.orders.count(),
        prisma.bill.count(), prisma.payment.count(),
    ]);
    console.log('\n✅ Seed terminé.');
    console.log(`   Users: ${users} · Books: ${bookCount} · Orders: ${orderCount} · Bills: ${billCount} · Payments: ${paymentCount}`);
    console.log('\n🔑 Connexion (mot de passe commun : Password123!)');
    console.log('   claude@eca.test       → Super Admin (compte dev agent, ClaudeDev2026!)');
    console.log('   superadmin@eca.test   → Super Admin (accès total, /admin/stats)');
    console.log('   permanent@eca.test    → Permanent (back-office)');
    console.log('   lecteur1@eca.test     → Lecteur');
    console.log('   auditeur1@eca.test    → Auditeur');
    console.log('   bienfaiteur1@eca.test → Donateur\n');
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
