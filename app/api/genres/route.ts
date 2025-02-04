// app/api/genres/route.ts
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

interface GenreBody {
    name: string;
    description?: string;
}

// Error handling functions
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError) {
    console.error('Database operation error:', {
        name: error.name,
        code: error.code,
        message: error.message,
        meta: error.meta
    });

    switch (error.code) {
        case 'P2002':
            return NextResponse.json({
                success: false,
                error: 'A genre with this name already exists',
                field: error.meta?.target
            }, { status: 409 });

        case 'P2003':
            return NextResponse.json({
                success: false,
                error: 'Foreign key constraint failed',
                field: error.meta?.field_name
            }, { status: 400 });

        case 'P2025':
            return NextResponse.json({
                success: false,
                error: 'Record not found',
                details: error.meta
            }, { status: 404 });

        case 'P2021':
            return NextResponse.json({
                success: false,
                error: 'Table does not exist',
                table: error.meta?.table
            }, { status: 500 });

        case 'P2019':
            return NextResponse.json({
                success: false,
                error: 'Input error',
                details: `Invalid input data for field: ${error.meta?.target}`
            }, { status: 400 });

        default:
            return NextResponse.json({
                success: false,
                error: 'An unexpected database error occurred',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                type: error.name
            }, { status: 500 });
    }
}

function handleValidationError(error: Prisma.PrismaClientValidationError) {
    return NextResponse.json({
        success: false,
        error: 'Invalid data provided',
        details: error.message,
        type: 'validation_error'
    }, { status: 400 });
}

function handleGenericError(error: Error) {
    return NextResponse.json({
        success: false,
        error: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        type: error.name
    }, { status: 500 });
}

// Parse and validate request body
async function parseAndValidateBody(request: NextRequest): Promise<GenreBody> {
    const body = await request.json();
    console.log('Received body:', body);

    if (!body || !body.name) {
        throw new Error('Name is required');
    }

    return {
        name: body.name,
        description: body.description || null
    };
}

// Database operations
async function createGenre(data: GenreBody) {
    return prisma.genre.create({
        data: {
            name: data.name,
            description: data.description,
        },
    });
}

// Request handlers
export async function POST(request: NextRequest) {
    try {
        const body = await parseAndValidateBody(request);
        const genre = await createGenre(body);

        return NextResponse.json({
            success: true,
            data: genre,
            message: 'Genre created successfully'
        }, { status: 201 });

    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return handlePrismaError(error);
        }
        if (error instanceof Prisma.PrismaClientValidationError) {
            return handleValidationError(error);
        }
        if (error instanceof Error && error.message === 'Name is required') {
            return NextResponse.json({
                success: false,
                error: error.message
            }, { status: 400 });
        }
        // Ensure error is of type Error before passing to handleGenericError
        if (error instanceof Error) {
            return handleGenericError(error);
        }
        // Fallback for non-Error types
        return handleGenericError(new Error('An unknown error occurred'));
    }
}


export async function GET() {
    try {
        const genres = await prisma.genre.findMany({
            orderBy: {
                name: 'asc',
            },
        });
        return NextResponse.json(genres);
    } catch (error) {
        console.error('Error fetching genres:', error);
        return NextResponse.json({ error: 'Failed to fetch genres' }, { status: 500 });
    }
}

