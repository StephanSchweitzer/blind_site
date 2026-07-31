import next from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  // Base Next.js config: next rules + react/hooks/jsx-a11y/import,
  // TypeScript support, core-web-vitals, and ignores (.next, out, build, next-env.d.ts).
  ...next,

  // Global ignores. The Next preset only ignores the build output at the ROOT,
  // so any nested one still gets linted — and bundled chunks trip rules they
  // were never meant to satisfy (no-assign-module-variable, unused-vars on
  // minified names), burying real findings under dozens of bogus errors.
  //
  // `.claude/` is agent scratch space (gitignored): `.claude/worktrees/*` are
  // throwaway checkouts, each with its own `.next/`. Nothing in there is source
  // this project ships, so none of it should ever be linted.
  {
    ignores: ["**/.next/**", ".claude/**"],
  },

  // Project-specific overrides go here, e.g.:
  // {
  //   rules: {
  //     "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  //   },
  // },
];

export default config;
