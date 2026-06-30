import next from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  // Base Next.js config: next rules + react/hooks/jsx-a11y/import,
  // TypeScript support, core-web-vitals, and ignores (.next, out, build, next-env.d.ts).
  ...next,

  // Project-specific overrides go here, e.g.:
  // {
  //   rules: {
  //     "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  //   },
  // },
];

export default config;
