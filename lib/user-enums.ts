// Active member types — drive selectable options in forms (MEMBER_TYPE_VALUES).
export const MEMBER_TYPE_VALUES = ['auditeur', 'lecteur', 'informaticien', 'administration', 'bienfaiteur'] as const;

// LEGACY: retained ONLY so existing database records type-check and render.
// Deliberately excluded from MEMBER_TYPE_VALUES so it is never offered as a
// selectable option. Remove `ecouteur` once all records are migrated:
//   UPDATE "User" SET "memberType" = 'auditeur' WHERE "memberType" = 'ecouteur';
export const LEGACY_MEMBER_TYPE_VALUES = ['ecouteur'] as const;

export const ACCESS_LEVEL_VALUES = ['member', 'admin', 'super_admin'] as const;
export const USER_TYPE_VALUES = ['auditeurs', 'lecteurs', 'bienfaiteurs', 'permanents'] as const;

export type ActiveMemberType = typeof MEMBER_TYPE_VALUES[number];
export type LegacyMemberType = typeof LEGACY_MEMBER_TYPE_VALUES[number];
export type MemberType = ActiveMemberType | LegacyMemberType;
export type AccessLevel = typeof ACCESS_LEVEL_VALUES[number];
export type UserType = typeof USER_TYPE_VALUES[number];

export const isLegacyMemberType = (value: string): value is LegacyMemberType =>
    (LEGACY_MEMBER_TYPE_VALUES as readonly string[]).includes(value);

export const isUserType = (value: string): value is UserType =>
    (USER_TYPE_VALUES as readonly string[]).includes(value);

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
    auditeur:      'Auditeur',
    lecteur:       'Lecteur',
    informaticien: 'Informaticien',
    administration: 'Administrateur',
    bienfaiteur:    'Donateur',
    ecouteur:      'Auditeur', // LEGACY: displays as Auditeur; remove with the `ecouteur` value once migrated.
};

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
    member:      'Membre',
    admin:       'Permanent',
    super_admin: 'Super Admin',
};

export const MEMBER_TYPE_COLORS: Record<MemberType, string> = {
    auditeur:       'bg-blue-100 text-blue-800',
    lecteur:        'bg-emerald-100 text-emerald-800',
    informaticien:  'bg-purple-100 text-purple-800',
    administration: 'bg-orange-100 text-orange-800',
    bienfaiteur:    'bg-green-100 text-green-800',
    ecouteur:       'bg-blue-100 text-blue-800', // LEGACY: mirrors auditeur; remove once migrated.
};

export const ACCESS_LEVEL_COLORS: Record<AccessLevel, string> = {
    member:      'bg-blue-100 text-blue-800',
    admin:       'bg-purple-100 text-purple-800',
    super_admin: 'bg-red-100 text-red-800',
};

export const USER_TYPE_META: Record<UserType, { plural: string; singular: string }> = {
    auditeurs:  { plural: 'Auditeurs',  singular: 'auditeur' },
    lecteurs:   { plural: 'Lecteurs',   singular: 'lecteur' },
    bienfaiteurs: { plural: 'Donateurs', singular: 'donateur' },
    permanents: { plural: 'Permanents', singular: 'permanent' },
};

export const getMemberTypeLabel = (value: string): string =>
    MEMBER_TYPE_LABELS[value as MemberType] ?? value;

export const getAccessLevelLabel = (value: string): string =>
    ACCESS_LEVEL_LABELS[value as AccessLevel] ?? value;

export const getMemberTypeColor = (value: string): string =>
    MEMBER_TYPE_COLORS[value as MemberType] ?? 'bg-gray-100 text-gray-800';

export const getAccessLevelColor = (value: string): string =>
    ACCESS_LEVEL_COLORS[value as AccessLevel] ?? 'bg-gray-100 text-gray-800';
export const SAVE_TYPE_VALUES = [
    'AUDACITY', 'GARAGEBAND', 'REAPER', 'ADOBE_AUDITION',
    'OCENAUDIO', 'WAVEPAD', 'LOGIC_PRO', 'STUDIO_ONE', 'AUTRE',
] as const;
export type SaveType = typeof SAVE_TYPE_VALUES[number];

export const SAVE_TYPE_LABELS: Record<SaveType, string> = {
    AUDACITY: 'Audacity', GARAGEBAND: 'GarageBand', REAPER: 'Reaper',
    ADOBE_AUDITION: 'Adobe Audition', OCENAUDIO: 'Ocenaudio', WAVEPAD: 'WavePad',
    LOGIC_PRO: 'Logic Pro', STUDIO_ONE: 'Studio One', AUTRE: 'Autre',
};

export const getSaveTypeLabel = (v: string): string =>
    SAVE_TYPE_LABELS[v as SaveType] ?? v;
