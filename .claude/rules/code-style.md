---
paths:
  - "app/**/*.{ts,tsx}"
  - "components/**/*.{ts,tsx}"
  - "hooks/**/*.{ts,tsx}"
  - "lib/**/*.{ts,tsx}"
---

## Code style / lint

Respect the existing ESLint config. Rules that have bitten this repo before:
- `react-hooks/set-state-in-effect` — avoid unguarded `setState` inside effects
- `static-components` — don't define components inside render
- `error-boundaries` — keep error boundary usage intact

### Dates affichées

Une date se rend **en heure française**, jamais dans le fuseau de la machine.
`toLocaleDateString('fr-FR')` ne fixe que la langue : le fuseau reste celui du
navigateur (ou UTC sur le serveur), ce qui DÉPLACE le jour à l'ouest d'UTC.
Utilise `parisDate` / `parisDateTimeDisplay` (`lib/paris-day.ts`).

L'exception : les colonnes **jour** normalisées à minuit UTC — indisponibilités,
créneaux de disponibilité, clés de bucket des statistiques — se relisent en
`timeZone: 'UTC'`, qui rend le jour tel qu'il a été écrit. Voir
`lib/users/activityStatus.ts`, `lib/users/availability.ts`,
`app/admin/stats/stats-utils.ts`.

Comments in this codebase explain **why**, not what, and are often long where the reasoning
was expensive (see `lib/audio/*`, `lib/statusSync.ts`). Match that when you touch those
files; don't strip a comment that records a decision.
