import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { withAdmin } from '@/lib/auth/guards';
import { parsePageParam, parseLimitParam, pageSkip } from '@/lib/pagination';
import { toPublicBook } from '@/lib/books/publicBook';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';
        const page = parsePageParam(searchParams.get('page'));
        const limit = parseLimitParam(searchParams.get('limit'), 10);
        const recent = searchParams.get('recent') === 'true';
        const skip = pageSkip(page, limit);

        let whereClause: Prisma.CoupsDeCoeurWhereInput = {
            active: true
        };

        if (search) {
            whereClause = {
                active: true,
                OR: [
                    {
                        title: {
                            contains: search,
                            mode: 'insensitive' as Prisma.QueryMode
                        }
                    },
                    {
                        description: {
                            contains: search,
                            mode: 'insensitive' as Prisma.QueryMode
                        }
                    },
                    {
                        books: {
                            some: {
                                book: {
                                    OR: [
                                        {
                                            title: {
                                                contains: search,
                                                mode: 'insensitive' as Prisma.QueryMode
                                            }
                                        },
                                        {
                                            author: {
                                                contains: search,
                                                mode: 'insensitive' as Prisma.QueryMode
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }
                ]
            };
        }

        if (recent) {
            const lastCoupDeCoeur = await prisma.coupsDeCoeur.findFirst({
                where: { active: true },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            if (lastCoupDeCoeur) {
                whereClause = {
                    ...whereClause,
                    createdAt: {
                        gte: lastCoupDeCoeur.createdAt
                    }
                };
            }
        }

        const [coupsDeCoeur, total] = await Promise.all([
            prisma.coupsDeCoeur.findMany({
                where: whereClause,
                // `select`, not `include`: this route is open without a session, and
                // the public page only ever reads id/title/description/audioPath off
                // a coup de cœur — `addedBy` (a staff name), `addedById`, `active` and
                // the timestamps were only in the response because `include` hands
                // back every scalar column by default.
                select: {
                    id: true,
                    title: true,
                    description: true,
                    audioPath: true,
                    books: {
                        // Cette route est ouverte sans session (la recherche
                        // publique s'en sert), et sans ce filtre elle renvoyait
                        // la fiche complète d'un livre masqué du catalogue dès
                        // qu'il figurait dans une liste. app/listes-de-livres/
                        // data.ts, qui alimente la page elle-même, filtre déjà.
                        where: { book: { hiddenFromCatalogue: false } },
                        select: {
                            book: {
                                include: {
                                    genres: {
                                        include: {
                                            genre: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.coupsDeCoeur.count({ where: whereClause })
        ]);

        // Same reasoning as /api/books: trim each embedded book down to what a
        // visitor can actually see, regardless of session — this route has no
        // `withAdmin` branch to begin with, so there's no "admin" shape to
        // preserve here the way there was in /api/books.
        const items = coupsDeCoeur.map((coup) => ({
            ...coup,
            books: coup.books.map((b) => ({ ...b, book: toPublicBook(b.book) })),
        }));

        return NextResponse.json({
            items,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error in coups de coeur API:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export const POST = withAdmin(async (req, { me }) => {
    revalidateAdmin();
    try {
        const body = await req.json();
        const { title, description, audioPath, bookIds, active } = body;

        if (!title || !Array.isArray(bookIds) || bookIds.length === 0) {
            return NextResponse.json(
                { error: 'Title and at least one book are required' },
                { status: 400 }
            );
        }

        const newCoupDeCoeur = await prisma.coupsDeCoeur.create({
            data: {
                title,
                description: description || null,
                audioPath: audioPath || null,
                active: active ?? true,
                addedById: me.id,
                books: {
                    create: bookIds.map((bookId: number) => ({
                        book: { connect: { id: bookId } }
                    }))
                }
            },
            include: {
                books: {
                    include: {
                        book: true
                    }
                }
            }
        });

        revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');

        return NextResponse.json(newCoupDeCoeur, { status: 201 });
    } catch (error) {
        console.error('Error creating coup de coeur:', error);
        return NextResponse.json(
            { error: 'Failed to create coup de coeur' },
            { status: 500 }
        );
    }
});