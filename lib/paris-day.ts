/**
 * Le jour du calendrier FRANÇAIS, pas celui du serveur.
 *
 * Prisma stocke les DateTime en timestamps UTC naïfs, et le déployé tourne en
 * UTC. « Les paiements du 3 mars » désigne pourtant le 3 mars vu de Paris :
 * borner sur un minuit UTC ferait entrer une heure du 2 mars en hiver, deux en
 * été, et sortir autant du 3. C'est le même parti pris que `lib/stats.ts`, qui
 * convertit ses bornes en SQL (`AT TIME ZONE`) — ici, côté JS, parce que ces
 * bornes-là partent dans un `where` construit par Prisma.
 */

export const PARIS_TIMEZONE = 'Europe/Paris';

const parisDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS_TIMEZONE });

/** La date d'un instant, en jour parisien, au format 'YYYY-MM-DD'. */
export const parisDayKey = (date: Date): string => parisDayFormatter.format(date);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** true pour un 'YYYY-MM-DD' qui désigne un vrai jour. */
export function isParisDay(value: string | null | undefined): value is string {
    if (!value || !DAY_RE.test(value)) return false;
    return !Number.isNaN(Date.parse(value));
}

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});

/**
 * De combien Paris est en avance sur UTC à cet instant, en millisecondes.
 *
 * Lu du fuseau lui-même plutôt que codé en dur : l'écart vaut +1 h ou +2 h selon
 * l'heure d'été, et la seule autorité sur la date de bascule est la base de
 * fuseaux horaires du moteur.
 */
function parisOffsetMs(at: Date): number {
    const parts: Record<string, string> = {};
    for (const part of offsetFormatter.formatToParts(at)) {
        if (part.type !== 'literal') parts[part.type] = part.value;
    }
    const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        // Certains moteurs rendent « 24 » pour minuit en hour12:false.
        Number(parts.hour) % 24,
        Number(parts.minute),
        Number(parts.second)
    );
    return asUtc - at.getTime();
}

/**
 * L'instant UTC où COMMENCE ce jour parisien — borne basse inclusive.
 *
 * L'écart est relu pour chaque borne indépendamment, si bien qu'un intervalle à
 * cheval sur un changement d'heure garde ses deux extrémités justes.
 */
export function parisDayStartUtc(day: string): Date | null {
    if (!isParisDay(day)) return null;
    const guess = new Date(`${day}T00:00:00Z`);
    return new Date(guess.getTime() - parisOffsetMs(guess));
}

/**
 * L'instant UTC où commence le LENDEMAIN — borne haute EXCLUSIVE.
 *
 * Un intervalle se ferme ainsi sur `lt`, et non sur un `lte` posé à 23:59:59 qui
 * laisserait tomber la dernière seconde du jour.
 */
export function parisDayEndUtc(day: string): Date | null {
    if (!isParisDay(day)) return null;
    const next = new Date(`${day}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return parisDayStartUtc(next.toISOString().slice(0, 10));
}
