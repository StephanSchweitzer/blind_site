import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        // Prisma 7 reads the seed command from here (the legacy package.json
        // `prisma.seed` key is ignored). tsx runs the TypeScript seed as ESM,
        // which the generated client (it uses `import.meta.url`) requires.
        seed: "tsx prisma/seed.ts",
    },
    datasource: {
        url: process.env.DIRECT_URL!,
    },
});