import { PrismaClient } from "@prisma/client";

declare global {
    var prisma: PrismaClient | undefined;
}

const globalForPrisma = global as { prisma?: PrismaClient };

export const prisma: PrismaClient =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: ["query"],
        datasourceUrl: process.env.DATABASE_URL
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}