import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
        }

        const uploadDir = path.join(process.cwd(), 'public', 'coup_descriptions');
        await mkdir(uploadDir, { recursive: true });

        const buffer = Buffer.from(await audioFile.arrayBuffer());
        const filePath = path.join(uploadDir, audioFile.name);
        await writeFile(filePath, buffer);

        const relativePath = `/coup_descriptions/${audioFile.name}`;
        return NextResponse.json({ filepath: relativePath });

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}