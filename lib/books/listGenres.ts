/**
 * Les livres d'une liste, rangés comme le site, la liste imprimée et l'éditeur
 * les montrent : par genre — chacun une seule fois —, puis livre par livre.
 *
 * L'ordre est celui que les permanents ont choisi dans l'éditeur
 * (CoupsDeCoeurBooks.position) : les genres dans l'ordre de leur premier livre,
 * les livres par rang. Sans rang (une liste jamais réordonnée, ou un livre
 * ajouté depuis), l'ordre alphabétique : genres par nom, livres par titre, et
 * un livre sans rang se range après ceux qui en ont un.
 *
 * Une seule fonction pour la page publique (BookList), le PDF (CoupDeCoeurPDF)
 * et l'éditeur, pour que les trois montrent le même ordre. Le tri alphabétique
 * est fait ici et non en base : sans ORDER BY, Postgres rendait les livres dans
 * l'ordre où ils se trouvaient sur le disque, et modifier une ligne la
 * déplaçait. Il est en français, accents et casse compris (« Éloge » avec les E).
 */

const NO_GENRE = 'Sans genre';

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

interface GenreLike {
    genre?: { name?: string | null } | null;
}

interface BookLike {
    id: number;
    title: string;
    author?: string | null;
    genres?: GenreLike[] | null;
}

interface EntryLike {
    book: BookLike;
    /** Rang choisi dans la liste ; absent ou null : ordre alphabétique. */
    position?: number | null;
}

/** Le genre sous lequel un livre est rangé : le premier de ses genres, par ordre alphabétique. */
export function listGenreOf(book: BookLike): string {
    const names = (book.genres ?? [])
        .map((g) => g.genre?.name)
        .filter((name): name is string => !!name)
        .sort(collator.compare);
    return names[0] ?? NO_GENRE;
}

const rank = (position: number | null | undefined) => position ?? Number.POSITIVE_INFINITY;

const byRankThenTitle = ({ book: a, position: pa }: EntryLike, { book: b, position: pb }: EntryLike) =>
    rank(pa) - rank(pb) ||
    collator.compare(a.title.trim(), b.title.trim()) ||
    collator.compare(a.author?.trim() ?? '', b.author?.trim() ?? '') ||
    a.id - b.id;

/** Les entrées d'une liste, groupées par genre, dans l'ordre choisi ou, à défaut, alphabétique. */
export function groupListByGenre<T extends EntryLike>(entries: T[]): [string, T[]][] {
    const groups = new Map<string, T[]>();
    for (const entry of entries) {
        const genre = listGenreOf(entry.book);
        const group = groups.get(genre);
        if (group) group.push(entry);
        else groups.set(genre, [entry]);
    }
    for (const group of groups.values()) group.sort(byRankThenTitle);
    // Un genre vient au rang de son premier livre (le groupe est déjà trié).
    return [...groups.entries()].sort(
        ([nameA, a], [nameB, b]) => rank(a[0].position) - rank(b[0].position) || collator.compare(nameA, nameB)
    );
}

/** Rien n'a de rang : la liste suit l'ordre alphabétique. */
export const isAlphabeticalOrder = (entries: EntryLike[]): boolean =>
    entries.every(({ position }) => position === null || position === undefined);
