export const MEMBER_TYPE_VALUES = ['ecouteur', 'auditeur', 'lecteur', 'informaticien', 'administration'] as const;
export const ACCESS_LEVEL_VALUES = ['member', 'admin', 'super_admin'] as const;
export const USER_TYPE_VALUES = ['auditeurs', 'lecteurs', 'permanents'] as const;

export type MemberType = typeof MEMBER_TYPE_VALUES[number];
export type AccessLevel = typeof ACCESS_LEVEL_VALUES[number];
export type UserType = typeof USER_TYPE_VALUES[number];

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
    ecouteur:      'Écouteur',
    auditeur:      'Auditeur',
    lecteur:       'Lecteur',
    informaticien: 'Informaticien',
    administration: 'Administrateur',
};

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
    member:      'Membre',
    admin:       'Permanent',
    super_admin: 'Super Admin',
};

export const MEMBER_TYPE_COLORS: Record<MemberType, string> = {
    ecouteur:       'bg-gray-100 text-gray-800',
    auditeur:       'bg-blue-100 text-blue-800',
    lecteur:        'bg-emerald-100 text-emerald-800',
    informaticien:  'bg-purple-100 text-purple-800',
    administration: 'bg-orange-100 text-orange-800',
};

export const ACCESS_LEVEL_COLORS: Record<AccessLevel, string> = {
    member:      'bg-blue-100 text-blue-800',
    admin:       'bg-purple-100 text-purple-800',
    super_admin: 'bg-red-100 text-red-800',
};

export const USER_TYPE_META: Record<UserType, { plural: string; singular: string }> = {
    auditeurs:  { plural: 'Auditeurs',  singular: 'auditeur' },
    lecteurs:   { plural: 'Lecteurs',   singular: 'lecteur' },
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