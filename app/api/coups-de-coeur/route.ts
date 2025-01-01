// app/api/coups-de-coeur/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const recent = searchParams.get('recent') === 'true';
        const skip = (page - 1) * limit;

        let whereClause: any = {};

        // Search functionality
        if (search) {
            whereClause = {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                    {
                        books: {
                            some: {
                                book: {
                                    OR: [
                                        { title: { contains: search, mode: 'insensitive' } },
                                        { author: { contains: search, mode: 'insensitive' } }
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
            // Get the most recent coup de coeur
            const lastCoupDeCoeur = await prisma.coupsDeCoeur.findFirst({
                orderBy: {
                    createdAt: 'desc'
                }
            });

            // If there's a last coup de coeur, get books after its date
            // If not, all books will be considered "recent"
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
                            book: true
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
    let session;

    try {
        session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { title, description, audioPath, bookIds, active = true } = body;

        // Input validation
        if (!title || !description || !audioPath || !bookIds || !Array.isArray(bookIds)) {
            return NextResponse.json(
                { error: 'Title, description, audioPath, and bookIds array are required' },
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

        const newCoupDeCoeur = await prisma.coupsDeCoeur.create({
            data: {
                title,
                description,
                audioPath,
                active,
                addedById: parsedAuthorId,
                books: {
                    create: bookIds.map(bookId => ({
                        book: {
                            connect: { id: parseInt(bookId, 10) }
                        }
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

        return NextResponse.json(
            { message: 'Coup de coeur created successfully', coupDeCoeur: newCoupDeCoeur },
            { status: 201 }
        );
    } catch (error) {
        console.error('Database operation failed:', error);
        return NextResponse.json(
            { error: 'Database operation failed' },
            { status: 500 }
        );
    }
}