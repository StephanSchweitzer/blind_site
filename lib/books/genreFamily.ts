/**
 * La famille d'un genre, pour la couleur du dos d'un livre dans le catalogue
 * public.
 *
 * Il y a 59 genres et sept dos de livres dans le logo : une couleur par genre
 * ne tiendrait pas, et deux genres voisins (« Policiers - Thrillers » et
 * « Thriller ») finiraient de deux couleurs sans rapport. Les genres sont donc
 * rangés en sept familles, reconnues à des mots de leur nom — un genre créé
 * demain dans le back-office trouve sa famille s'il en porte un, sinon il prend
 * le dos neutre.
 *
 * La couleur n'est qu'un repère pour l'œil qui parcourt la page : le genre est
 * toujours écrit sur la carte, et un lecteur d'écran n'a rien à en déduire.
 *
 * L'ordre compte : la première famille dont un mot apparaît l'emporte. D'où
 * « science-fiction » avant les sciences, et les romans avant l'histoire
 * (« Roman historique » est un roman).
 */

export type GenreFamily =
    | 'polar'
    | 'roman'
    | 'vie'
    | 'spiritualite'
    | 'histoire'
    | 'sciences'
    | 'arts'
    | 'autre';

const FAMILIES: { family: Exclude<GenreFamily, 'autre'>; words: string[] }[] = [
    { family: 'polar', words: ['policier', 'thriller', 'enquete', 'science fiction', 'science-fiction'] },
    { family: 'roman', words: ['roman', 'conte', 'nouvelle', 'bande dessinee', 'humour', 'jeunesse'] },
    { family: 'vie', words: ['biograph', 'memoire', 'temoignage', 'handicap'] },
    { family: 'spiritualite', words: ['religion', 'spiritualite', 'esoterisme'] },
    { family: 'histoire', words: ['histoire', 'politique', 'sociologie', 'droit', 'economie', 'finance', 'archeologie'] },
    { family: 'sciences', words: ['science', 'medecine', 'sante', 'psycholog', 'technolog', 'nature', 'animaux'] },
    { family: 'arts', words: ['art', 'musique', 'poesie', 'theatre', 'architecture', 'essai', 'chronique', 'philosoph', 'langue', 'dictionnaire'] },
];

/** Tailwind background class of each family's spine (tailwind.config.js, `dos`). */
export const GENRE_FAMILY_SPINE: Record<GenreFamily, string> = {
    polar: 'bg-dos-violet',
    roman: 'bg-dos-rouge',
    vie: 'bg-dos-orange',
    spiritualite: 'bg-dos-jaune',
    histoire: 'bg-dos-bleu',
    sciences: 'bg-dos-turquoise',
    arts: 'bg-dos-rose',
    autre: 'bg-dos-neutre',
};

const fold = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function genreFamily(name: string | null | undefined): GenreFamily {
    if (!name) return 'autre';
    const folded = fold(name);
    for (const { family, words } of FAMILIES) {
        if (words.some((w) => folded.includes(w))) return family;
    }
    return 'autre';
}
