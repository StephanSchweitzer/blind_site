import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';
import { withAdmin } from '@/lib/auth/guards';
import { sniffAudioContainer } from '@/lib/audio-file-extension';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * The spoken presentation of a coup de cœur (« Liste des Livres »).
 *
 * Unrelated to the audiobook bucket: this is one short narration per list,
 * played by an `<audio src>` on the public `/listes-de-livres` page — hence a
 * PUBLIC Blob. A private one would need an expiring link minted per render, on
 * a page the public cache keeps for a day.
 *
 * Admin-only, because it writes to public storage on our account. It used to
 * hand-roll that check; it is withAdmin now like every other route, which also
 * brings the forced password change and the audit actor with it.
 */
export const POST = withAdmin(async (request) => {
    try {
        const formData = await request.formData();
        const audioFile = formData.get('audio');

        if (!(audioFile instanceof File)) {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
        }

        // Validate type and size before writing anything.
        if (!audioFile.type.startsWith('audio/')) {
            return NextResponse.json({ error: 'Le fichier doit être un fichier audio' }, { status: 400 });
        }
        if (audioFile.size > MAX_BYTES) {
            return NextResponse.json({ error: 'Fichier trop volumineux (max 25 Mo)' }, { status: 400 });
        }
        // The declared type is the client's word; the bytes are the file's. A
        // page or a script renamed `.wav` would otherwise be published as-is
        // and served from our Blob store to the public site.
        const head = new Uint8Array(await audioFile.slice(0, 12).arrayBuffer());
        if (!sniffAudioContainer(head)) {
            return NextResponse.json(
                { error: 'Le contenu du fichier n’est pas un format audio reconnu (MP3, WAV, M4A, Ogg, FLAC, WebM).' },
                { status: 400 },
            );
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
});
