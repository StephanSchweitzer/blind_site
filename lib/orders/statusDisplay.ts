import { STATUS } from '@/lib/statusSync';

/**
 * Comment la liste des demandes nomme et colore le statut de chaque ligne.
 *
 * Les noms sont raccourcis pour le tableau et mis au féminin, puisque c'est
 * une *demande* qu'ils décrivent. Les clés sont les `Status.id` (seed :
 * prisma/seed.ts STATUSES ; constantes : lib/statusSync.ts).
 *
 * Les couleurs suivent le circuit, du neutre au vert, et évitent à dessein le
 * rouge et l'ambre : sur cette liste, ils disent déjà « en retard », « à
 * surveiller » et « duplication en attente ». Deux statuts voisins n'ont jamais
 * deux teintes proches.
 */
type StatusStyle = { short: string; badge: string };

const STYLES: Record<number, StatusStyle> = {
    [STATUS.A_FAIRE]: {
        short: 'À faire',
        badge: 'bg-slate-200 text-slate-800 dark:bg-slate-700/60 dark:text-slate-200',
    },
    [STATUS.ATTENTE]: {
        short: 'À envoyer',
        badge: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200',
    },
    [STATUS.EN_COURS]: {
        short: 'En cours',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    },
    [STATUS.ATTENTE_AUDITEUR]: {
        short: 'À expédier',
        badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    },
    [STATUS.TERMINE]: {
        short: 'Terminée',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
    [STATUS.SOLDE]: {
        short: 'Soldée',
        badge: 'bg-muted text-muted-foreground',
    },
};

export function orderStatusStyle(status: { id: number; name: string }): StatusStyle {
    return STYLES[status.id] ?? { short: status.name, badge: 'bg-muted text-foreground' };
}
