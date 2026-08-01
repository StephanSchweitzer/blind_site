// Member activity statuses - drive the status selector, table badge and history.
// Enum identifiers must be Postgres-safe (no spaces/accents/parens); the French
// wording lives in the labels map below.
//
// NOTE: labels use \u escapes on purpose so this source stays pure ASCII and the
// accents can't be corrupted when the file is copied/downloaded between editors.
//
// NOTE: these labels are also dropped straight into "X est {label}" sentences
// (toasts, the inactive-person reactivation dialog) via .toLowerCase(), so each
// one must read correctly as a predicate after "est" — not just stand alone as
// a badge. RADIATION used to be a noun ("Radiation (sans activité)") which made
// "X est radiation" ungrammatical; it is a participial form now ("radié") so the
// sentence stays correct either way.
//
// The four statuses offered, in picker order. Same list for every member type
// (lecteurs, auditeurs, donateurs, permanents): there is no per-type subset.
// All four are reversible - any of them can be changed back to any other,
// DECEASED included; it only asks for a confirmation first, see
// CONFIRMED_USER_ACTIVITY_STATUSES.
//
// DEMISSION ("Démissionnaire") was dropped: it overlapped with RADIATION and
// made no sense for auditeurs and donateurs, who don't resign from anything.
// Every record carrying it was migrated to RADIATION and the Postgres enum
// value was removed, so it can never come back through a stored row.
export const OFFERED_USER_ACTIVITY_STATUSES = [
    'ACTIVE',
    'UNAVAILABLE',
    'RADIATION',
    'DECEASED',
] as const;

// Retired statuses. Rows recorded under them keep displaying their label (and
// withCurrentValue() keeps the value visible in a select whose person still
// carries it), but they are never offered for a new change. INACTIVE is kept in
// the Postgres enum on purpose - hundreds of User rows and history events still
// carry it, and dropping the value would orphan them.
//
// ON_VACATION / SUSPENDED / PB_SANTE_MENTALE were removed entirely: their rows
// were migrated to INACTIVE and the enum values dropped.
export const LEGACY_USER_ACTIVITY_STATUSES = [
    'INACTIVE',
] as const;

// Every value the column can hold: offered + legacy. Use this to VALIDATE a
// stored value; use OFFERED_USER_ACTIVITY_STATUSES to POPULATE a picker.
export const USER_ACTIVITY_STATUS_VALUES = [
    ...OFFERED_USER_ACTIVITY_STATUSES,
    ...LEGACY_USER_ACTIVITY_STATUSES,
] as const;

export type UserActivityStatus = typeof USER_ACTIVITY_STATUS_VALUES[number];

export const USER_ACTIVITY_STATUS_LABELS: Record<UserActivityStatus, string> = {
    ACTIVE:           'Actif',
    // Temporary, and always dated: see DATED_USER_ACTIVITY_STATUSES below.
    UNAVAILABLE:      'Indisponible',
    // Spelled out, always: the label is "Decede" (accented), never the
    // abbreviation "DCD". Kept as its own status, NOT merged into RADIATION.
    DECEASED:         'D\u00e9c\u00e9d\u00e9',
    RADIATION:        'Radi\u00e9',
    INACTIVE:         'Inactif',
};

// Tailwind badge classes per status (same style as the member-type badges).
export const USER_ACTIVITY_STATUS_COLORS: Record<UserActivityStatus, string> = {
    ACTIVE:           'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    UNAVAILABLE:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    DECEASED:         'bg-gray-200 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300',
    RADIATION:        'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    INACTIVE:         'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

// Statuses that count as "currently active" for list filters that used to
// check `isActive === true`.
//
// IMPORTANT: match the EFFECTIVE status against this, not the stored column.
// A person stored UNAVAILABLE whose window has not started (or has elapsed)
// is effectively ACTIVE - see lib/users/activityStatus.ts.
export const ACTIVE_USER_ACTIVITY_STATUSES: readonly UserActivityStatus[] = ['ACTIVE'];

// Statuses carrying a start/end window. UNAVAILABLE is the only one: it is
// temporary by definition, so both dates are required when it is applied, and
// the window is what makes the status expire on its own.
export const DATED_USER_ACTIVITY_STATUSES: readonly UserActivityStatus[] = ['UNAVAILABLE'];

// Statuses grave enough that the UI asks the permanent to confirm before
// applying them. Confirming is all it takes - the status stays reversible
// afterwards like any other.
export const CONFIRMED_USER_ACTIVITY_STATUSES: readonly UserActivityStatus[] = ['DECEASED'];

/** Does this status carry an unavailability window (start + end dates)? */
export const isDatedActivityStatus = (status: string): boolean =>
    (DATED_USER_ACTIVITY_STATUSES as readonly string[]).includes(status);

/** Does applying this status require an explicit confirmation first? */
export const needsActivityStatusConfirmation = (status: string): boolean =>
    (CONFIRMED_USER_ACTIVITY_STATUSES as readonly string[]).includes(status);

export const getUserActivityStatusLabel = (status: string): string =>
    USER_ACTIVITY_STATUS_LABELS[status as UserActivityStatus] ?? status;

export const getUserActivityStatusColor = (status: string): string =>
    USER_ACTIVITY_STATUS_COLORS[status as UserActivityStatus] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300';