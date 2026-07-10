// Compose a user's display name as « Civilité Prénom Nom ».
// /api/user/search returns firstName/lastName/civility but no `name`,
// so build it here and fall back to name/email when parts are missing.

export interface UserNameParts {
    name?: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    civility?: { name?: string } | string | null;
}

export function getUserDisplayName(user: UserNameParts | null): string {
    if (!user) return '';
    const civRaw = user.civility;
    const civ = typeof civRaw === 'string' ? civRaw : civRaw?.name ?? '';
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const composed = [civ, full].filter(Boolean).join(' ').trim();
    return composed || user.name || user.email || 'Sans nom';
}
