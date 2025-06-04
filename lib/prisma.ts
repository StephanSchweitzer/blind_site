import { PrismaClient, Prisma } from "@prisma/client";

declare global {
    // eslint-disable-next-line no-var
    var prisma: PrismaClient | undefined;
}

const globalForPrisma = global as { prisma?: PrismaClient };

const getLogConfig = () => {
    if (process.env.NODE_ENV === 'development' && process.env.PRISMA_QUERY_LOG === 'true') {
        return ['query', 'error', 'warn'] as Prisma.LogLevel[];
    }
    return ['error'] as Prisma.LogLevel[];
};

export const prisma: PrismaClient =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: getLogConfig(),
        datasourceUrl: process.env.DATABASE_URL
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

// To see queries in development, add to .env.local:
// PRISMA_QUERY_LOG=true