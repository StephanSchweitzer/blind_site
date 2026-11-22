/**
 * Picks a filename extension matching a Blob's actual MIME type.
 *
 * The coup-de-cœur audio field always named its upload `*.mp3` regardless of
 * content — harmless while it only ever held the recorder's own WAV output,
 * but importing arbitrary files (mp3, wav, m4a, ogg…) makes that mislabeling
 * visible. `AudioRecorder.tsx` never re-encodes an imported file, so the
 * blob's `type` is whatever the admin's file carried in.
 */
export function extensionForMimeType(type: string): string {
    const subtype = type.split('/')[1]?.split(';')[0]?.toLowerCase();
    switch (subtype) {
        case 'mpeg':
            return 'mp3';
        case 'mp4':
        case 'x-m4a':
            return 'm4a';
        case 'x-wav':
            return 'wav';
        default:
            return subtype || 'audio';
    }
}

/**
 * The audio container a file's first bytes announce, or null when they
 * announce none of the formats the coup-de-cœur field takes.
 *
 * `File.type` is whatever the browser — or a crafted request — declared, and
 * `/api/upload-audio` writes to PUBLIC storage that the public site plays from.
 * So the route checks the bytes themselves before writing: the recorder's own
 * output (WAV, or WebM from MediaRecorder) and the files an admin may import
 * (MP3, M4A, Ogg/Opus, FLAC, AAC, AIFF). Twelve bytes are enough for all of
 * them. A plain-MPEG frame sync (0xFFE…) covers both MP3 without an ID3 tag and
 * ADTS AAC.
 */
export function sniffAudioContainer(head: Uint8Array): string | null {
    const ascii = (at: number, s: string) =>
        head.length >= at + s.length && [...s].every((c, i) => head[at + i] === c.charCodeAt(0));
    if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'wav';
    if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
    if (ascii(0, 'OggS')) return 'ogg';
    if (ascii(0, 'fLaC')) return 'flac';
    if (ascii(4, 'ftyp')) return 'mp4';
    if (ascii(0, 'FORM') && (ascii(8, 'AIFF') || ascii(8, 'AIFC'))) return 'aiff';
    if (ascii(0, 'ID3')) return 'mp3';
    if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'mpeg';
    return null;
}
