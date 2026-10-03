// Compose a user's display name as « Civilité Prénom Nom », from
// firstName / lastName / civility, falling back to the email when those are
// missing.

export interface UserNameParts {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    civility?: { name?: string } | string | null;
}

// Name only, no email/'Sans nom' fallback — returns '' when the user has no
// name at all. Use this where the email is already displayed next to the name
// (list tables), so an unnamed user doesn't show their email twice; the caller
// picks its own placeholder.
export function getUserNameOnly(user: UserNameParts | null): string {
    if (!user) return '';
    const civRaw = user.civility;
    const civ = typeof civRaw === 'string' ? civRaw : civRaw?.name ?? '';
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return [civ, full].filter(Boolean).join(' ').trim();
}

export function getUserDisplayName(user: UserNameParts | null): string {
    if (!user) return '';
    return getUserNameOnly(user) || user.email || 'Sans nom';
}

/**
 * Name as it goes on an envelope: « Civilité Prénom NOM ». La Poste's norme
 * d'adressage wants the patronyme in capitals so sorting machines and postal
 * workers pick it out of the line.
 */
export function getPostalName(user: UserNameParts | null): string {
    if (!user) return '';
    const civRaw = user.civility;
    const civ = typeof civRaw === 'string' ? civRaw : civRaw?.name ?? '';
    const last = user.lastName?.trim();
    const full = [user.firstName?.trim(), last ? last.toUpperCase() : null]
        .filter(Boolean)
        .join(' ')
        .trim();
    return [civ, full].filter(Boolean).join(' ').trim();
}
