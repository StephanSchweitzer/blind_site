// CoupDeCoeurPDF.tsx
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import type { PublicBook } from '@/lib/books/publicBook';
import { groupBy } from 'lodash';

/**
 * Mise en page « papier » : la liste s'imprime et se poste aux auditeurs, donc
 * chaque page économisée compte (24 pages pour ~50 titres dans la version
 * précédente, contre 12 au plus pour les listes d'origine). Elle suit la liste
 * du 12 mai 2026 : un seul corps (11 pt) — sauf la ligne éditeur / pages /
 * durée, plus petite —, la hiérarchie vient du gras et de l'alignement, un
 * paragraphe justifié par livre, et aucun saut de page forcé : seuls les titres
 * ne restent jamais seuls en bas de page. Les présentations étant désormais
 * résumées, la mise en page peut respirer un peu (interlignes et espaces entre
 * notices plus larges).
 */
const BODY = 11;
const META = 9;
const TITLE = 16;
// Interligne en points, posé texte par texte (un lineHeight sur <Page>
// fait disparaître, sans erreur, le numéro de page — Text à `render` — et un
// coefficient posé sur un Text est multiplié par un corps que react-pdf choisit seul).
const LEADING = '14pt';

// Les polices intégrées de react-pdf (Times-Roman…) ne couvrent que le latin
// occidental : le « ł » d'un auteur polonais sortait en signe illisible. Liberation
// Serif (OFL, public/fonts) a les mêmes chasses que Times et couvre le latin étendu.
const SERIF = 'Liberation Serif';
Font.register({
    family: SERIF,
    fonts: [
        { src: '/fonts/LiberationSerif-Regular.ttf' },
        { src: '/fonts/LiberationSerif-Bold.ttf', fontWeight: 'bold' },
    ],
});

// Même fichier que la facture (BillPDF) : fond blanc opaque, 300 dpi.
const LOGO_SRC = '/eca_logo_facture.png';
const LOGO_WIDTH = 92;
const LOGO_RATIO = 1000 / 508;

const s = StyleSheet.create({
    page: { paddingTop: 46, paddingBottom: 50, paddingHorizontal: 54, fontFamily: SERIF, fontSize: BODY, color: '#000000' },

    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    logo: { width: LOGO_WIDTH, height: LOGO_WIDTH / LOGO_RATIO },
    headerText: { flex: 1, paddingLeft: 14, paddingRight: LOGO_WIDTH, alignItems: 'center' },
    title: { fontWeight: 'bold', fontSize: TITLE, textAlign: 'center', lineHeight: '19pt' },
    subtitle: { textAlign: 'center', marginTop: 3, lineHeight: LEADING },
    notice: { borderWidth: 0.75, borderColor: '#000000', paddingVertical: 6, paddingHorizontal: 12, marginBottom: 10, textAlign: 'center', lineHeight: LEADING },

    genreTitle: { fontWeight: 'bold', textAlign: 'center', marginTop: 14, marginBottom: 9, lineHeight: LEADING },

    book: { marginBottom: 12 },
    // Titre et auteur sur une ligne quand ils y tiennent ; sinon l'auteur passe à
    // la ligne suivante, calé à droite (flexWrap), plutôt que d'écraser le titre.
    bookHead: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 },
    bookTitle: { fontWeight: 'bold', lineHeight: LEADING },
    // marginLeft auto : l'auteur est poussé au bout de sa ligne, qu'il la partage
    // avec le titre ou non.
    author: { fontWeight: 'bold', marginLeft: 'auto', paddingLeft: 12, textAlign: 'right', lineHeight: LEADING },
    // La ligne éditeur / année / pages / durée se lit avant le résumé, sous le
    // titre : on sait de quoi il s'agit (et combien ça dure) avant de lire.
    meta: { fontSize: META, lineHeight: '12pt', marginBottom: 3 },
    bookDesc: { textAlign: 'justify', lineHeight: LEADING },

    contact: { textAlign: 'center', marginTop: 18, lineHeight: LEADING },
    footer: { position: 'absolute', bottom: 16, left: 0, right: 0 },
    pageNumber: { fontFamily: SERIF, fontSize: META, textAlign: 'center' },
});

// Espace insécable : « 11 h 53 » ou « 381 p. » ne se coupent jamais en fin de ligne.
const NBSP = ' ';

/** « Éditions Hermann, 2011, 381 p., durée d'écoute : 11 h 53 » — vide si rien n'est connu. */
const formatBookMeta = (book: PublicBook) => {
    const parts: string[] = [];
    if (book.publisher) parts.push(book.publisher);
    // `publishedDate` arrive en chaîne ISO une fois passé par le JSON de l'API.
    if (book.publishedDate) {
        const year = new Date(book.publishedDate).getUTCFullYear();
        if (Number.isFinite(year)) parts.push(String(year));
    }
    if (book.pageCount) parts.push(`${book.pageCount}${NBSP}p.`);
    if (book.readingDurationMinutes) {
        const h = Math.floor(book.readingDurationMinutes / 60);
        const min = String(book.readingDurationMinutes % 60).padStart(2, '0');
        parts.push(`durée d'écoute${NBSP}: ${h}${NBSP}h${NBSP}${min}`);
    }
    return parts.join(', ');
};

// Pas de guillemets autour des présentations pour l'instant. Beaucoup de celles
// saisies sur le site portent déjà les leurs : on les retire quand elles ouvrent
// ET ferment la présentation, pour que toutes s'impriment pareil.
const unquoted = (description: string) => {
    const text = description.trim();
    return /^«/.test(text) && /»$/.test(text)
        ? text.replace(/^(?:«\s*)+/, '').replace(/(?:\s*»)+$/, '')
        : text;
};

const groupBooksByGenre = (books: { book: PublicBook }[]) => {
    const withGenres = books.map(({ book }) => ({
        ...book,
        genreNames: book.genres?.length
            ? book.genres.map(g => g.genre?.name).filter(Boolean).sort()
            : ['Sans genre'],
    }));
    return Object.entries(groupBy(withGenres, b => b.genreNames[0] || 'Sans genre'))
        .sort(([a], [b]) => a.localeCompare(b));
};

// wrap={false} : une notice ne se coupe pas entre deux pages, donc son titre ne
// reste jamais seul en bas de page (minPresenceAhead, essayé, n'est pas respecté
// sur une vue imbriquée). Sauf une présentation démesurée (une collection qui
// énumère ses quarante volumes) : une vue insécable plus haute que la page ne
// peut pas être posée, react-pdf la laisse déborder et laisse un trou avant elle.
const KEEP_TOGETHER_MAX_CHARS = 1500;
const keepsTogether = (book: PublicBook) => (book.description?.length ?? 0) <= KEEP_TOGETHER_MAX_CHARS;

const BookEntry = ({ book }: { book: PublicBook }) => {
    const meta = formatBookMeta(book);
    return (
        <View style={s.book} wrap={!keepsTogether(book)}>
            <View style={s.bookHead}>
                <Text style={s.bookTitle}>{book.title}</Text>
                <Text style={s.author}>{book.author}</Text>
            </View>
            {meta && <Text style={s.meta}>{meta}</Text>}
            {book.description && <Text style={s.bookDesc}>{unquoted(book.description)}</Text>}
        </View>
    );
};

// Message fixe de l'ECA, repris tel quel de la liste papier : il ne dépend pas de la
// liste (le champ « description » d'une liste est une note propre à celle-ci).
const NOTICE = "Chers adhérentes et adhérents,\nN'oubliez pas de consulter également notre nouveau site ECA : https://www.eca-aveugles.fr";

export const CoupDeCoeurPDF = ({ content, logoSrc = LOGO_SRC }: { content: CoupDeCoeur[]; logoSrc?: string }) => {
    const cdc = content[0];
    if (!cdc) return null;

    return (
        <Document title={`Liste de livres — ${cdc.title}`}>
            <Page size="A4" style={s.page} wrap>
                {/* Pied de page : vue absolue fixée en bas, le Text numéroté dedans — un
                    Text `render` posé directement en absolu n'était pas calé en bas. */}
                <View style={s.footer} fixed>
                    <Text style={s.pageNumber} render={({ pageNumber }) => `${pageNumber}`} />
                </View>

                <View style={s.header}>
                    {/* jsx-a11y voit un <img> ; l'Image de react-pdf n'a pas d'attribut alt. */}
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={logoSrc} style={s.logo} />
                    <View style={s.headerText}>
                        <Text style={s.title}>{cdc.title}</Text>
                        {cdc.description && <Text style={s.subtitle}>{cdc.description}</Text>}
                    </View>
                </View>

                <Text style={s.notice}>{NOTICE}</Text>

                {groupBooksByGenre(cdc.books).flatMap(([genre, [firstBook, ...rest]]) => [
                    // Le titre de section et sa première notice sont inséparables : s'ils
                    // ne tiennent pas, les deux passent à la page suivante.
                    <View key={`genre-${genre}`} wrap={!keepsTogether(firstBook)}>
                        <Text style={s.genreTitle} minPresenceAhead={60}>{genre}</Text>
                        <BookEntry book={firstBook} />
                    </View>,
                    ...rest.map(book => <BookEntry key={book.id} book={book} />),
                ])}

                <Text style={s.contact}>
                    À demander au 01 88 32 31 47 ou 48  ·  ecapermanence@gmail.com
                </Text>

            </Page>
        </Document>
    );
};
