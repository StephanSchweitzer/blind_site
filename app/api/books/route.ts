import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Unauthorized'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const userId = parseInt(session.user.id, 10);
        const formData = await req.json();

        console.log("this is my user ID " + userId)

        const newBook = await prisma.book.create({
            data: {
                title: formData.title,
                author: formData.author,
                publishedDate: new Date(formData.publishedDate),
                isbn: formData.isbn,
                description: formData.description,
                available: formData.available,
                addedById: userId,
                genres: {
                    create: formData.genres.map((genreId: number) => ({
                        genre: {
                            connect: {
                                id: genreId
                            }
                        }
                    }))
                }
            },
            include: {
                genres: {
                    include: {
                        genre: true
                    }
                }
            }
        });

        return new Response(JSON.stringify({
            success: true,
            message: 'Book added successfully',
            book: newBook
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to add book'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}