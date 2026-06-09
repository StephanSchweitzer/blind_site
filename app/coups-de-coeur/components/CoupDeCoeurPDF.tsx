// CoupDeCoeurPDF.tsx
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import type { BookWithGenres } from '@/types/book';
import { groupBy } from 'lodash';

const NAVY = '#15366b';

const s = StyleSheet.create({
    page: { padding: 48, fontFamily: 'Helvetica', fontSize: 13, color: '#111111', lineHeight: 1.5 },

    headerCard: { backgroundColor: NAVY, borderRadius: 8, paddingVertical: 22, paddingHorizontal: 26, marginBottom: 22 },
    org: { color: '#ffffff', fontSize: 11, marginBottom: 6 },
    title: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' },

    introText: { fontSize: 13, marginBottom: 24, lineHeight: 1.6, color: '#111111' },

    // genreGroup keeps the genre bar + its first book on the same page (wrap={false})
    genreGroup: { marginTop: 20 },
    genreBar: { backgroundColor: '#e9f0fb', paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 },
    genreText: { color: NAVY, fontSize: 15, fontWeight: 'bold' },

    // Subtle card per book; wrap={false} keeps the fill intact across page breaks
    book: { backgroundColor: '#f6f9fd', paddingVertical: 9, paddingHorizontal: 12, marginBottom: 12 },
    bookTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY },
    author: { fontSize: 12, marginTop: 2, color: '#374151' },
    bookDesc: { fontSize: 12, marginTop: 5, lineHeight: 1.55, color: '#374151' },

    contact: { fontSize: 11, textAlign: 'center', marginTop: 36, color: NAVY },
});

const groupBooksByGenre = (books: { book: BookWithGenres }[]) => {
    const withGenres = books.map(({ book }) => ({
        ...book,
        genreNames: book.genres?.length
            ? book.genres.map(g => g.genre?.name).filter(Boolean).sort()
            : ['Sans genre'],
    }));
    return Object.entries(groupBy(withGenres, b => b.genreNames[0] || 'Sans genre'))
        .sort(([a], [b]) => a.localeCompare(b));
};

export const CoupDeCoeurPDF = ({ content }: { content: CoupDeCoeur[] }) => {
    const cdc = content[0];
    if (!cdc) return null;

    return (
        <Document title={`Coup de cœur — ${cdc.title}`}>
            <Page size="A4" style={s.page} wrap>
                <View style={s.headerCard} wrap={false}>
                    <Text style={s.org}>ECA — Enregistrements à la Carte pour les Aveugles</Text>
                    <Text style={s.title}>Coup de cœur : {cdc.title}</Text>
                </View>

                {cdc.description && <Text style={s.introText}>{cdc.description}</Text>}

                {groupBooksByGenre(cdc.books).flatMap(([genre, books]) => {
                    const [firstBook, ...rest] = books;
                    return [
                        // Genre bar + first book are inseparable: if they don't fit, both move to the next page
                        <View key={`genre-${genre}`} style={s.genreGroup} wrap={false}>
                            <View style={s.genreBar}>
                                <Text style={s.genreText}>{genre}</Text>
                            </View>
                            {firstBook && (
                                <View style={s.book}>
                                    <Text style={s.bookTitle}>{firstBook.title}</Text>
                                    <Text style={s.author}>{firstBook.author}</Text>
                                    {firstBook.description && <Text style={s.bookDesc}>{firstBook.description}</Text>}
                                </View>
                            )}
                        </View>,
                        ...rest.map(book => (
                            <View key={book.id} style={s.book} wrap={false}>
                                <Text style={s.bookTitle}>{book.title}</Text>
                                <Text style={s.author}>{book.author}</Text>
                                {book.description && <Text style={s.bookDesc}>{book.description}</Text>}
                            </View>
                        )),
                    ];
                })}

                <Text style={s.contact}>
                    À commander au 01 88 32 31 47 ou 48  ·  ecapermanence@gmail.com
                </Text>
            </Page>
        </Document>
    );
};