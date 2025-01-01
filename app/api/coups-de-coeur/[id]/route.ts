import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

interface Params {
    params: Promise<{
        id: string;
    }>;
}

// GET: Fetch a specific coup de coeur by ID
export async function GET(req: NextRequest, { params }: Params) {
    const { id } = await params;

    try {
        const coupDeCoeur = await prisma.coupsDeCoeur.findUnique({
            where: { id: parseInt(id, 10) },
            include: {
                books: {
                    include: {
                        book: true
                    }
                }
            }
        });

        if (!coupDeCoeur) {
            return NextResponse.json({ error: 'Coup de coeur not found' }, { status: 404 });
        }

        return NextResponse.json(coupDeCoeur);
    } catch (error) {
        console.error('Failed to fetch coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to fetch coup de coeur' }, { status: 500 });
    }
}

// PUT: Update a specific coup de coeur by ID
export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params;

    try {
        const { title, description, audioPath, bookIds, active } = await req.json();

        if (!title || !description || !audioPath || !bookIds || !Array.isArray(bookIds)) {
            return NextResponse.json(
                { error: 'Title, description, audioPath, and bookIds array are required' },
                { status: 400 }
            );
        }

        // First, delete existing book relationships
        await prisma.coupsDeCoeurBooks.deleteMany({
            where: { coupsDeCoeurId: parseInt(id, 10) }
        });

        // Then update the coup de coeur and create new relationships
        const updatedCoupDeCoeur = await prisma.coupsDeCoeur.update({
            where: { id: parseInt(id, 10) },
            data: {
                title,
                description,
                audioPath,
                active: active ?? true,
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

        return NextResponse.json({
            message: 'Coup de coeur updated successfully',
            coupDeCoeur: updatedCoupDeCoeur,
        });
    } catch (error) {
        console.error('Failed to update coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to update coup de coeur' }, { status: 500 });
    }
}

// DELETE: Delete a specific coup de coeur by ID
export async function DELETE(req: NextRequest, { params }: Params) {
    const { id } = await params;

    try {
        // First delete the related CoupsDeCoeurBooks entries
        await prisma.coupsDeCoeurBooks.deleteMany({
            where: { coupsDeCoeurId: parseInt(id, 10) }
        });

        // Then delete the CoupsDeCoeur entry
        await prisma.coupsDeCoeur.delete({
            where: { id: parseInt(id, 10) }
        });

        return NextResponse.json({ message: 'Coup de coeur deleted successfully' });
    } catch (error) {
        console.error('Failed to delete coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to delete coup de coeur' }, { status: 500 });
    }
}