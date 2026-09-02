/**
 * The one definition of "strong enough" for a password in this app.
 *
 * Both places a password gets set — the forced change after a temporary
 * password (/auth/change-password) and the self-service reset link
 * (/auth/reset-password) — score it with this, so the meter the user watches
 * and the rule the server enforces can't drift apart.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Below this the password is refused, on the client and on the server. */
export const MIN_PASSWORD_SCORE = 3;

export interface PasswordStrength {
    /** 0–5: lowercase, uppercase, digit, special char, long enough. */
    score: number;
    message: string;
    /** Tailwind class for the meter bar. */
    color: string;
}

export function checkPasswordStrength(password: string): PasswordStrength {
    let score = 0;
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (password.length >= MIN_PASSWORD_LENGTH) score += 1;

    switch (score) {
        case 5:
            return { score, message: 'Excellente', color: 'bg-emerald-500' };
        case 4:
            return { score, message: 'Bonne', color: 'bg-green-500' };
        case 3:
            return { score, message: 'Moyenne', color: 'bg-yellow-500' };
        case 2:
            return { score, message: 'Faible', color: 'bg-orange-500' };
        default:
            return { score, message: 'Très faible', color: 'bg-red-500' };
    }
}

/** The French message shown when a password is refused, or null when it passes. */
export function validateNewPassword(password: string): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`;
    }
    if (checkPasswordStrength(password).score < MIN_PASSWORD_SCORE) {
        return 'Veuillez choisir un mot de passe plus fort (majuscules, minuscules, chiffres ou caractères spéciaux)';
    }
    return null;
}
