/**
 * Sections of the public Équipe page.
 *
 * Here rather than inside the admin screen that renders them: the journal des
 * modifications words enum values through the same maps the screens do
 * (ENUM_VALUE_LABELS, lib/audit/labels.ts), and lib/audit/labels.ts is imported
 * by client components — it can hold no server-only or Prisma-runtime import.
 * A map living in a component is one the journal cannot reach, which is how
 * « Section : CONSEIL » ended up in the trail while the screen said « Conseil
 * d'Administration ».
 */
export const TeamSection = {
    DIRECTION: 'DIRECTION',
    CONSEIL: 'CONSEIL',
    PERMANENCE: 'PERMANENCE',
} as const;

export type TeamSection = typeof TeamSection[keyof typeof TeamSection];

export const TEAM_SECTION_LABELS: Record<TeamSection, string> = {
    DIRECTION: 'Direction',
    CONSEIL: "Conseil d'Administration",
    PERMANENCE: 'Animation des Permanences',
};

/** Display order on the public page and in the back office. */
export const TEAM_SECTION_ORDER: TeamSection[] = ['DIRECTION', 'CONSEIL', 'PERMANENCE'];
