import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
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

const styles = StyleSheet.create({
    page: { paddingTop: 54, paddingBottom: 56, paddingHorizontal: 48, fontSize: 10.5, lineHeight: 1.5 },
    couvertureTitre: { fontFamily: BOLD, fontSize: 30, color: NAVY, marginBottom: 10 },
    couvertureSous: { fontSize: 12, color: GRIS, marginBottom: 28 },
    sommaireTitre: { fontFamily: BOLD, fontSize: 13, color: NAVY, marginBottom: 8 },
    sommaireLigne: { fontSize: 11, marginBottom: 4, color: '#111827' },
    sectionTitre: { fontFamily: BOLD, fontSize: 20, color: NAVY, marginBottom: 14 },
    h2: { fontFamily: BOLD, fontSize: 13, color: NAVY, marginTop: 16, marginBottom: 6 },
    h3: { fontFamily: BOLD, fontSize: 11, marginTop: 12, marginBottom: 4 },
    paragraphe: { marginBottom: 8, textAlign: 'justify' },
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
            {runs.map((run, i) => (
                <Text key={i} style={run.bold ? { fontFamily: BOLD } : undefined}>
                    {run.text}
                </Text>
            ))}
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
    dateImpression,
}: {
    sections: AideSectionPDF[];
    images: Map<string, AideImageResolue>;
    dateImpression: string;
}) {
    return (
        <Document title="Mode d'emploi — Arbre Rose" author="ECA — Les Auxiliaires des Aveugles">
            <Page size="A4" style={styles.page}>
                <Text style={styles.couvertureTitre}>Mode d&apos;emploi</Text>
                <Text style={styles.couvertureSous}>
                    Arbre Rose — la partie administration du site aux ECA{'\n'}
                    Édition du {dateImpression}
                </Text>

                <Text style={styles.sommaireTitre}>Sommaire</Text>
                {sections.map((section, i) => (
                    <Text key={section.titre} style={styles.sommaireLigne}>
                        {i + 1}. {section.titre}
                    </Text>
                ))}

                <Text style={[styles.paragraphe, { marginTop: 24, color: GRIS }]}>
                    Ce document est engendré depuis le mode d&apos;emploi consultable dans Arbre
                    Rose, à la page « Aide ». Les deux disent donc toujours la même chose : si
                    quelque chose vous semble faux ici, c&apos;est qu&apos;il l&apos;est aussi
                    là-bas, et cela se corrige.
                </Text>

                <Text style={styles.pied} fixed>Mode d&apos;emploi — Arbre Rose</Text>
            </Page>

            {sections.map((section) => (
                <Page key={section.titre} size="A4" style={styles.page}>
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
