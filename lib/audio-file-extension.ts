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
