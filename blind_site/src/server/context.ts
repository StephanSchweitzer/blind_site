import { prisma } from "@/lib/prisma";

export function createContext() {
    return {
        prisma,
    };
}

export type Context = ReturnType<typeof createContext>;
