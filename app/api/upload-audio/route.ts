import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(request: Request) {
    try {
        // Admin-only: this writes to public storage on our account.
        const me = await getCurrentUser();
        if (!me) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }
        if (!isAdmin(me.accessLevel)) {
            return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
        }

        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
        }

        // Validate type and size before writing anything.
        if (!audioFile.type.startsWith('audio/')) {
            return NextResponse.json({ error: 'Le fichier doit être un fichier audio' }, { status: 400 });
        }
        if (audioFile.size > MAX_BYTES) {
            return NextResponse.json({ error: 'Fichier trop volumineux (max 25 Mo)' }, { status: 400 });
        }

        // Never trust the client-supplied name: strip any path component and prefix a
        // timestamp so a crafted name can't traverse directories or overwrite a file.
        const safeName = `${Date.now()}-${path.basename(audioFile.name)}`;

        if (process.env.NODE_ENV === 'development') {
            const uploadDir = path.join(process.cwd(), 'public', 'coup_descriptions');
            await mkdir(uploadDir, { recursive: true });

            const buffer = Buffer.from(await audioFile.arrayBuffer());
            const filePath = path.join(uploadDir, safeName);
            await writeFile(filePath, buffer);

            return NextResponse.json({ filepath: `/coup_descriptions/${safeName}` });
        } else {
            const { url } = await put(
                `coup_descriptions/${safeName}`,
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