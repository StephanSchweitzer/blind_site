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

Comments in this codebase explain **why**, not what, and are often long where the reasoning
was expensive (see `lib/audio/*`, `lib/statusSync.ts`). Match that when you touch those
files; don't strip a comment that records a decision.
