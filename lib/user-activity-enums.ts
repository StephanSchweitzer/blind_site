// Member activity statuses - drive the status selector, table badge and history.
// Enum identifiers must be Postgres-safe (no spaces/accents/parens); the French
// wording lives in the labels map below.
//
// NOTE: labels use \u escapes on purpose so this source stays pure ASCII and the
// accents can't be corrupted when the file is copied/downloaded between editors.
export const USER_ACTIVITY_STATUS_VALUES = [
    'ACTIVE',
    'INACTIVE',
    'ON_VACATION',
    'SUSPENDED',
    'DECEASED',
    'DEMISSION',
    'RADIATION',
    'PB_SANTE_MENTALE',
] as const;

export type UserActivityStatus = typeof USER_ACTIVITY_STATUS_VALUES[number];

export const USER_ACTIVITY_STATUS_LABELS: Record<UserActivityStatus, string> = {
    ACTIVE:           'Actif',
    INACTIVE:         'Inactif',
    ON_VACATION:      'En vacances',
    SUSPENDED:        'Suspendu',
    DECEASED:         'D\u00e9c\u00e9d\u00e9',
    DEMISSION:        'D\u00e9mission',
    RADIATION:        'Radiation (sans activit\u00e9)',
    PB_SANTE_MENTALE: 'Pb sant\u00e9 mentale',
};

// Tailwind badge classes per status (same style as the member-type badges).
export const USER_ACTIVITY_STATUS_COLORS: Record<UserActivityStatus, string> = {
    ACTIVE:           'bg-green-100 text-green-800',
    INACTIVE:         'bg-red-100 text-red-800',
    ON_VACATION:      'bg-blue-100 text-blue-800',
    SUSPENDED:        'bg-orange-100 text-orange-800',
    DECEASED:         'bg-gray-200 text-gray-800',
    DEMISSION:        'bg-yellow-100 text-yellow-800',
    RADIATION:        'bg-purple-100 text-purple-800',
    PB_SANTE_MENTALE: 'bg-pink-100 text-pink-800',
};

// Statuses that count as "currently active" for list filters that used to
// check `isActive === true`.
export const ACTIVE_USER_ACTIVITY_STATUSES: readonly UserActivityStatus[] = ['ACTIVE'];

export const getUserActivityStatusLabel = (status: string): string =>
    USER_ACTIVITY_STATUS_LABELS[status as UserActivityStatus] ?? status;

export const getUserActivityStatusColor = (status: string): string =>
    USER_ACTIVITY_STATUS_COLORS[status as UserActivityStatus] ?? 'bg-gray-100 text-gray-800';