// app/api/admin/stats/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { startOfWeek, endOfWeek, subMonths, format } from 'date-fns';

interface WeeklyActivity {
    week: string;
    weekStart: Date;
    weekEnd: Date;
    count: number;
    items: {
        id: number;
        title: string;
        createdAt: Date;
        type: 'book' | 'news' | 'coupsdecoeur';
    }[];
}

interface AdminActivity {
    userId: number;
    userName: string;
    email: string;
    weeks: WeeklyActivity[];
}

export async function GET(req: NextRequest) {
    try {
        // Check if user is authenticated and is an admin
        const session = await getServerSession(authOptions);
        if (!session?.user?.role || session.user.role !== 'super_admin') {
            return NextResponse.json(
                { error: 'Unauthorized - Super admin access required' },
                { status: 401 }
            );
        }

        const searchParams = req.nextUrl.searchParams;
        const type = searchParams.get('type') || 'books'; // books, news, or coupsdecoeur
        const monthsBack = parseInt(searchParams.get('months') || '3');

        // Calculate date range
        const endDate = new Date();
        const startDate = subMonths(endDate, monthsBack);

        // Get all admin users
        const adminUsers = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true
            }
        });

        // Prepare the response data
        const adminActivities: AdminActivity[] = [];

        for (const admin of adminUsers) {
            const weeklyData: WeeklyActivity[] = [];

            // Generate weeks for the time period
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday as start
                const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let items: any[] = [];
                let count = 0;

                if (type === 'books') {
                    const books = await prisma.book.findMany({
                        where: {
                            addedById: admin.id,
                            createdAt: {
                                gte: weekStart,
                                lte: weekEnd
                            }
                        },
                        select: {
                            id: true,
                            title: true,
                            subtitle: true,
                            author: true,
                            createdAt: true
                        }
                    });
                    items = books.map(book => ({
                        id: book.id,
                        title: `${book.title}${book.subtitle ? ` - ${book.subtitle}` : ''} by ${book.author}`,
                        createdAt: book.createdAt,
                        type: 'book' as const
                    }));
                    count = books.length;
                } else if (type === 'news') {
                    const news = await prisma.news.findMany({
                        where: {
                            authorId: admin.id,
                            publishedAt: {
                                gte: weekStart,
                                lte: weekEnd
                            }
                        },
                        select: {
                            id: true,
                            title: true,
                            type: true,
                            publishedAt: true
                        }
                    });
                    items = news.map(article => ({
                        id: article.id,
                        title: `${article.title} (${article.type})`,
                        createdAt: article.publishedAt,
                        type: 'news' as const
                    }));
                    count = news.length;
                } else if (type === 'coupsdecoeur') {
                    const coupsDeCoeur = await prisma.coupsDeCoeur.findMany({
                        where: {
                            addedById: admin.id,
                            createdAt: {
                                gte: weekStart,
                                lte: weekEnd
                            }
                        },
                        select: {
                            id: true,
                            title: true,
                            createdAt: true,
                            books: {
                                select: {
                                    book: {
                                        select: {
                                            title: true
                                        }
                                    }
                                }
                            }
                        }
                    });
                    items = coupsDeCoeur.map(cdc => ({
                        id: cdc.id,
                        title: `${cdc.title} (${cdc.books.length} books)`,
                        createdAt: cdc.createdAt,
                        type: 'coupsdecoeur' as const
                    }));
                    count = coupsDeCoeur.length;
                }

                weeklyData.push({
                    week: format(weekStart, 'MMM dd'),
                    weekStart,
                    weekEnd,
                    count,
                    items
                });

                // Move to next week
                currentDate.setDate(currentDate.getDate() + 7);
            }

            adminActivities.push({
                userId: admin.id,
                userName: admin.name || admin.email,
                email: admin.email,
                weeks: weeklyData
            });
        }

        return NextResponse.json({
            admins: adminActivities,
            startDate,
            endDate,
            type
        });

    } catch (error) {
        console.error('Error fetching admin stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch admin statistics' },
            { status: 500 }
        );
    }
}

// Get list of admin users for the filter
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.role || session.user.role !== 'super_admin') {
            return NextResponse.json(
                { error: 'Unauthorized - Super admin access required' },
                { status: 401 }
            );
        }

        const adminUsers = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true
            },
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json({ admins: adminUsers });

    } catch (error) {
        console.error('Error fetching admin users:', error);
        return NextResponse.json(
            { error: 'Failed to fetch admin users' },
            { status: 500 }
        );
    }
}