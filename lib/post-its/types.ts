/**
 * Les formes d'un post-it côté navigateur — sans Prisma, pour que les
 * composants clients puissent les importer. Le serveur les remplit dans
 * lib/post-its/postIts.ts.
 */

/** Ce à quoi un post-it peut être lié — au plus une chose à la fois. */
export type PostItLinkKind = 'user' | 'order' | 'assignment' | 'bill';

export const POST_IT_LINK_LABELS: Record<PostItLinkKind, string> = {
    user: 'Fiche',
    order: 'Demande',
    assignment: 'Attribution',
    bill: 'Facture',
};

export interface PostItLink {
    kind: PostItLinkKind;
    id: number;
    /** « Demande #812 — Mme Morvan », prêt à afficher. */
    label: string;
    /** Le dossier ou la liste ouverte sur cette ligne (les liens `?order=`…). */
    href: string;
    /** La fiche, la demande… a été supprimée depuis : le lien reste, barré. */
    deleted: boolean;
}

export interface PostItPerson {
    id: number;
    name: string;
}

export interface PostItItem {
    id: number;
    content: string;
    /** 'YYYY-MM-DD', ou null sans rappel. */
    remindOn: string | null;
    /** Le jour de rappel est aujourd'hui ou passé, et le post-it encore ouvert. */
    due: boolean;
    createdAt: string;
    updatedAt: string;
    doneAt: string | null;
    author: PostItPerson | null;
    doneBy: PostItPerson | null;
    link: PostItLink | null;
    /** L'auteur ou un super admin : modifier et supprimer. Tout permanent peut marquer « Fait ». */
    canEdit: boolean;
}

export type PostItState = 'ouverts' | 'termines';

/** Ce que le formulaire envoie, à la création comme à la modification. */
export interface PostItInput {
    content: string;
    remindOn: string | null;
    link: { kind: PostItLinkKind; id: number } | null;
}

/** Au-delà, ce n'est plus un post-it : la fiche ou la demande a son champ Notes. */
export const POST_IT_MAX_LENGTH = 1000;
