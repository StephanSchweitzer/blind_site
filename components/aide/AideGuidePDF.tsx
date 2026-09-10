import { Document, Page, View, Text, Image, Link, StyleSheet } from '@react-pdf/renderer';
import type { AideBlock, AideRun } from '@/lib/aide-blocks';

/**
 * Le mode d'emploi complet, en PDF.
 *
 * Même source que /admin/aide : les sections viennent de `content/aide/*.md`,
 * découpées par `parseAideBlocks`. Il n'y a donc pas de version imprimée à
 * tenir à jour séparément — c'est tout l'intérêt.
 *
 * La graisse se demande par la POLICE (`Helvetica-Bold`), pas par `fontWeight` :
 * react-pdf ne synthétise une graisse que pour une famille enregistrée avec
 * elle, et la Helvetica intégrée ne l'est pas. Un `fontWeight: 'bold'` y est
 * ignoré sans rien signaler — la facture s'est imprimée en romain pendant des
 * mois pour cette raison (voir BillPDF.tsx).
 */
const BOLD = 'Helvetica-Bold';
const NAVY = '#15366b';
const GRIS = '#4b5563';

export interface AideSectionPDF {
    /** Sert d'ancre PDF (`id` de la page) — c'est elle que ciblent le sommaire et les renvois entre sections. */
    slug: string;
    titre: string;
    blocs: AideBlock[];
}

export interface AideImageResolue {
    /** Le nom de fichier tel qu'il figure dans le Markdown. */
    fichier: string;
    /** Le binaire lu au disque : react-pdf ne va pas chercher les URL gardées. */
    donnees: Buffer;
    format: 'jpg' | 'png';
    /** Taille d'affichage en points, calculée en amont — voir lib/aide-image-size. */
    largeur: number;
    hauteur: number;
}

// 1000 × 508 px — le même PNG que BillPDF.tsx, pensé pour l'impression (voir
// LOGO_RATIO là-bas). Pas eca_logo.png : trop étroit, pensé pour un bandeau
// web, pas pour une couverture.
const LOGO_RATIO = 1000 / 508;

const styles = StyleSheet.create({
    page: { paddingTop: 54, paddingBottom: 56, paddingHorizontal: 48, fontSize: 10.5, lineHeight: 1.5 },
    // Logo, titre et sous-titre centrés en bloc : `alignItems: 'center'` sur ce
    // conteneur seulement, pas sur toute la Page, pour que le sommaire qui suit
    // reste, lui, aligné à gauche sur toute la largeur.
    couvertureEntete: { alignItems: 'center', marginBottom: 46 },
    couvertureLogo: { width: 230, height: 230 / LOGO_RATIO, marginBottom: 28 },
    couvertureTitre: { fontFamily: BOLD, fontSize: 36, lineHeight: 1, color: NAVY, marginTop: 8, marginBottom: 20, textAlign: 'center' },
    couvertureSous: { fontSize: 13, color: GRIS, textAlign: 'center', lineHeight: 1.6 },
    sommaireTitre: { fontFamily: BOLD, fontSize: 14, color: NAVY, marginBottom: 16 },
    // Deux colonnes plutôt qu'une : à 16 sections, une colonne unique laisse la
    // moitié droite de la page vide et le sommaire ressemble à une liste
    // abandonnée sur le bord gauche. Le total tient alors sur une seule page
    // au lieu de déborder sur une deuxième aux trois quarts blanche.
    sommaireGrille: { flexDirection: 'row' },
    sommaireColonneGauche: { flex: 1, paddingRight: 20 },
    sommaireColonneDroite: { flex: 1, paddingLeft: 20 },
    sommaireLigne: {
        flexDirection: 'row',
        marginBottom: 9,
        paddingBottom: 9,
        borderBottomWidth: 0.5,
        borderBottomColor: '#e5e7eb',
    },
    sommaireNumero: { width: 20, fontSize: 11, color: GRIS },
    sommaireLien: { flex: 1, fontSize: 11, color: '#2563eb', textDecoration: 'none' },
    sectionTitre: { fontFamily: BOLD, fontSize: 20, color: NAVY, marginBottom: 14 },
    h2: { fontFamily: BOLD, fontSize: 13, color: NAVY, marginTop: 16, marginBottom: 6 },
    h3: { fontFamily: BOLD, fontSize: 11, marginTop: 12, marginBottom: 4 },
    paragraphe: { marginBottom: 8, textAlign: 'justify' },
    lien: { color: '#2563eb', textDecoration: 'underline' },
    citation: {
        marginBottom: 8,
        paddingLeft: 10,
        borderLeftWidth: 2,
        borderLeftColor: '#d1d5db',
        fontStyle: 'italic',
        color: GRIS,
        textAlign: 'justify',
    },
    listeLigne: { flexDirection: 'row', marginBottom: 4, paddingLeft: 6 },
    listePuce: { width: 16 },
    listeTexte: { flex: 1 },
    // La taille est posée par le générateur, pas devinée ici : react-pdf place
    // une image à sa taille intrinsèque (jusqu'à 2048 px de large) faute de
    // consigne, et le bloc `wrap={false}` qui la porte devient alors plus haut
    // qu'une page — le rendu abandonne sur « unsupported number ». Ni
    // `width: '100%'` ni `maxHeight` n'y suffisent. Voir lib/aide-image-size.ts.
    image: { marginVertical: 10, borderWidth: 0.5, borderColor: '#d1d5db' },
    tableauLigne: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', paddingVertical: 4 },
    tableauCellule: { flex: 1, paddingRight: 8, fontSize: 9.5 },
    // Un pied de page SANS numero de page — et ce n'est pas un oubli.
    //
    // `<Text fixed render={({ pageNumber }) => ...} />` fait tomber le rendu
    // des qu'un document depasse une vingtaine de captures :
    // « unsupported number: -3.7e+22 ». Ce ne sont pas les images — les memes,
    // sans ce rappel dynamique, passent toutes. Le numero de page est donc
    // abandonne : un guide qui s'imprime vaut mieux qu'un guide numerote qui
    // ne s'imprime pas. On se repere par le sommaire et par ce rappel de
    // section, present sur chaque page.
    pied: { position: 'absolute', bottom: 26, left: 48, right: 48, fontSize: 8.5, color: GRIS },
});

function Runs({ runs }: { runs: AideRun[] }) {
    return (
        <>
            {runs.map((run, i) =>
                run.url ? (
                    <Link key={i} src={run.url} style={styles.lien}>
                        {run.text}
                    </Link>
                ) : (
                    <Text key={i} style={run.bold ? { fontFamily: BOLD } : undefined}>
                        {run.text}
                    </Text>
                ),
            )}
        </>
    );
}

function Bloc({ bloc, images }: { bloc: AideBlock; images: Map<string, AideImageResolue> }) {
    switch (bloc.type) {
        case 'titre':
            return <Text style={bloc.niveau === 2 ? styles.h2 : styles.h3}>{bloc.texte}</Text>;

        case 'paragraphe':
            return (
                <Text style={styles.paragraphe}>
                    <Runs runs={bloc.runs} />
                </Text>
            );

        case 'citation':
            return (
                <Text style={styles.citation}>
                    <Runs runs={bloc.runs} />
                </Text>
            );

        case 'liste':
            return (
                <View style={styles.listeLigne} wrap={false}>
                    <Text style={styles.listePuce}>{bloc.puce}</Text>
                    <Text style={styles.listeTexte}>
                        <Runs runs={bloc.runs} />
                    </Text>
                </View>
            );

        case 'tableau':
            return (
                <View style={{ marginBottom: 10 }}>
                    {bloc.lignes.map((ligne, i) => (
                        <View key={i} style={styles.tableauLigne} wrap={false}>
                            {ligne.map((cellule, j) => (
                                <Text
                                    key={j}
                                    style={[styles.tableauCellule, i === 0 ? { fontFamily: BOLD } : {}]}
                                >
                                    {cellule}
                                </Text>
                            ))}
                        </View>
                    ))}
                </View>
            );

        case 'image': {
            const image = images.get(bloc.fichier);
            if (!image) return null;
            // `wrap={false}` : une capture coupée en deux par un saut de page
            // ne montre plus rien d'utilisable.
            return (
                <View wrap={false}>
                    {/* jsx-a11y voit un <img> ; c'est l'Image de react-pdf, qui
                        n'accepte pas d'alt — un PDF n'a pas de texte de
                        remplacement. La description reste dans le Markdown, et
                        c'est elle que sert la version en ligne. */}
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image
                        style={[styles.image, { width: image.largeur, height: image.hauteur }]}
                        src={{ data: image.donnees, format: image.format }}
                    />
                </View>
            );
        }
    }
}

export function AideGuidePDF({
    sections,
    images,
    logo,
    dateImpression,
}: {
    sections: AideSectionPDF[];
    images: Map<string, AideImageResolue>;
    /** Le logotype ECA, lu au disque côté serveur — voir app/admin/aide/pdf/route.ts. */
    logo: Buffer;
    dateImpression: string;
}) {
    // Deux colonnes : la première reçoit la section en plus quand le compte est impair.
    const milieu = Math.ceil(sections.length / 2);
    const colonnes = [sections.slice(0, milieu), sections.slice(milieu)];

    return (
        <Document title="Mode d'emploi — Arbre Rose" author="ECA — Les Auxiliaires des Aveugles">
            <Page size="A4" style={styles.page}>
                <View style={styles.couvertureEntete}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- l'Image de react-pdf n'accepte pas d'alt */}
                    <Image style={styles.couvertureLogo} src={{ data: logo, format: 'png' }} />
                    <Text style={styles.couvertureTitre}>Mode d&apos;emploi</Text>
                    <Text style={styles.couvertureSous}>
                        Arbre Rose — la partie administration du site aux ECA{'\n'}
                        Édition du {dateImpression}
                    </Text>
                </View>

                {/*
                    Chaque ligne du sommaire est une ancre interne, pas un numéro de
                    page : `Link src="#<slug>"` saute directement à la page de la
                    section (`Page id={section.slug}` plus bas) au lieu d'ouvrir le
                    site — voir isSrcId/setLink dans @react-pdf/render. Un numéro de
                    page n'aurait rien apporté de plus et aurait fait courir le
                    risque documenté sur `pied` plus bas.
                */}
                <Text style={styles.sommaireTitre}>Sommaire</Text>
                <View style={styles.sommaireGrille}>
                    {colonnes.map((colonne, c) => (
                        <View key={c} style={c === 0 ? styles.sommaireColonneGauche : styles.sommaireColonneDroite}>
                            {colonne.map((section, i) => (
                                <View key={section.slug} style={styles.sommaireLigne}>
                                    <Text style={styles.sommaireNumero}>{c * milieu + i + 1}.</Text>
                                    <Link src={`#${section.slug}`} style={styles.sommaireLien}>
                                        {section.titre}
                                    </Link>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>

                <Text style={styles.pied} fixed>Mode d&apos;emploi — Arbre Rose</Text>
            </Page>

            {sections.map((section) => (
                <Page key={section.slug} id={section.slug} size="A4" style={styles.page}>
                    <Text style={styles.sectionTitre}>{section.titre}</Text>
                    {section.blocs.map((bloc, i) => (
                        <Bloc key={i} bloc={bloc} images={images} />
                    ))}

                    <Text style={styles.pied} fixed>
                        Mode d&apos;emploi — {section.titre}
                    </Text>
                </Page>
            ))}
        </Document>
    );
}
