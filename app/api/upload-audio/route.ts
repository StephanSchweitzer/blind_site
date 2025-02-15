import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
        }

        // Check if we're in development or production
        if (process.env.NODE_ENV === 'development') {
            // Local storage logic (development)
            const uploadDir = path.join(process.cwd(), 'public', 'coup_descriptions');
            await mkdir(uploadDir, { recursive: true });

            const buffer = Buffer.from(await audioFile.arrayBuffer());
            const filePath = path.join(uploadDir, audioFile.name);
            await writeFile(filePath, buffer);

            const relativePath = `/coup_descriptions/${audioFile.name}`;
            return NextResponse.json({ filepath: relativePath });
        } else {
            // Vercel Blob storage logic (production)
            const { url } = await put(
                `coup_descriptions/${audioFile.name}`,
                audioFile,
                { access: 'public' }
            );
            return NextResponse.json({ filepath: url });
        }

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}