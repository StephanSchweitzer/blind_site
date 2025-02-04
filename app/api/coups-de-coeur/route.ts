import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const recent = searchParams.get('recent') === 'true';
        const skip = (page - 1) * limit;

        let whereClause: Prisma.CoupsDeCoeurWhereInput = {};

        // Search functionality
        if (search) {
            whereClause = {
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

        // Recent books functionality
        if (recent) {
            const lastCoupDeCoeur = await prisma.coupsDeCoeur.findFirst({
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
                include: {
                    books: {
                        include: {
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
                    },
                    addedBy: {
                        select: {
                            name: true
                        }
                    }
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.coupsDeCoeur.count({ where: whereClause })
        ]);

        return NextResponse.json({
            items: coupsDeCoeur,
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

export async function POST(req: NextRequest) {
    try {
        // Authenticate the user
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse request body
        const body = await req.json();
        const { title, description, audioPath, bookIds, active } = body;

        // Validate required fields
        if (!title || !Array.isArray(bookIds) || bookIds.length === 0) {
            return NextResponse.json(
                { error: 'Title and at least one book are required' },
                { status: 400 }
            );
        }

        const parsedAuthorId = parseInt(session.user.id, 10);
        if (isNaN(parsedAuthorId)) {
            return NextResponse.json(
                { error: 'Invalid author ID' },
                { status: 400 }
            );
        }

        // Create new Coup de Coeur entry
        const newCoupDeCoeur = await prisma.coupsDeCoeur.create({
            data: {
                title,
                description: description || null,
                audioPath: audioPath || null,
                active: active ?? true,
                addedById: parsedAuthorId, // Link to the user who created it
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

        return NextResponse.json(newCoupDeCoeur, { status: 201 });
    } catch (error) {
        console.error('Error creating coup de coeur:', error);
        return NextResponse.json(
            { error: 'Failed to create coup de coeur' },
            { status: 500 }
        );
    }
}
