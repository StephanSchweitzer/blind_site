import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { Context } from "../context";

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
    book: t.router({
        getAll: t.procedure.query(async ({ ctx }) => {
            return await ctx.prisma.book.findMany();
        }),
        getById: t.procedure
            .input(z.number())
            .query(async ({ ctx, input }) => {
                return await ctx.prisma.book.findUnique({ where: { id: input } });
            }),
        add: t.procedure
            .input(
                z.object({
                    title: z.string(),
                    author: z.string(),
                    description: z.string(),
                })
            )
            .mutation(async ({ ctx, input }) => {
                return await ctx.prisma.book.create({
                    data: input,
                });
            }),
    }),
});

export type AppRouter = typeof appRouter;
