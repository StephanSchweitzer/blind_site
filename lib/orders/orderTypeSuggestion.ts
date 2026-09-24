/**
 * Le type qu'un ouvrage appelle quand on le choisit dans une nouvelle demande.
 *
 * Le mode d'emploi pose la règle (06-demandes) : un livre déjà enregistré se
 * duplique, un livre qu'il faut faire lire s'enregistre. Le type est donc, dans
 * la plupart des cas, une conséquence du livre — pas une décision à retenir par
 * cœur. Chaque ligne naissait pourtant « Duplication », et les boutons de type
 * se trouvent juste sous le sélecteur de livre, que la liste de résultats
 * recouvre pendant la recherche : on choisissait un livre, la liste se fermait,
 * et la ligne partait en duplication sans que personne l'ait vue. Les nouveaux
 * livres ressortaient ainsi en duplications de rien.
 *
 * On déduit donc le type AU MOMENT où le livre est choisi, c'est-à-dire après la
 * fermeture de la liste : ce que la liste cachait n'a plus d'importance. Ça
 * reste une proposition — un nouvel enregistrement d'un livre déjà enregistré
 * (relecture) se choisit à la main, et le bouton cliqué l'emporte.
 *
 * Trois cas, dans cet ordre :
 * 1. le livre a un fichier audio → « Duplication » : il y a de quoi copier ;
 * 2. pas d'audio, mais un enregistrement est déjà en route (demande
 *    d'enregistrement ouverte, ou attribution « Attente envoi vers lecteur » /
 *    « En cours ») → « Duplication » : elle attend ce retour-là plutôt que de
 *    lancer une seconde lecture du même livre ;
 * 3. sinon → « Enregistrement ».
 *
 * Une attribution déjà « Terminé » ne compte pas au cas 2 : son audio est revenu,
 * c'est le cas 1. Et si l'audio a été perdu depuis, il faut bien réenregistrer.
 */

export type OrderLineType = 'DUPLICATION' | 'ENREGISTREMENT';

/** Pourquoi ce type-là — ce que la ligne dit à l'utilisateur quand il n'est pas évident. */
export type OrderTypeReason = 'audio' | 'recording-under-way' | 'to-record';

export interface OrderTypeSuggestion {
    type: OrderLineType;
    reason: OrderTypeReason;
}

export function suggestOrderType({
    bookHasAudio,
    recordingUnderWay,
}: {
    bookHasAudio: boolean;
    recordingUnderWay: boolean;
}): OrderTypeSuggestion {
    if (bookHasAudio) return { type: 'DUPLICATION', reason: 'audio' };
    if (recordingUnderWay) return { type: 'DUPLICATION', reason: 'recording-under-way' };
    return { type: 'ENREGISTREMENT', reason: 'to-record' };
}
