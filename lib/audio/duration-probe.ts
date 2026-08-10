/**
 * Reads a track's playback length out of its own header bytes.
 *
 * PURE PARSER — no S3, no Prisma, no `server-only`. It takes the first N KB of a
 * file (and optionally the last N KB) plus the object's total size, and returns
 * a duration or a reason it could not. The split exists so the same code can run
 * inside a route and under plain Node in a script, exactly like bucket-core.
 *
 * ## Why parse headers instead of decoding
 *
 * The duration of a recording is knowable from a few hundred bytes: an MP3
 * announces its bitrate in every frame header and its exact frame count in the
 * Xing tag written by the encoder, an MP4 states duration/timescale in `mvhd`, a
 * WAV states its byte rate and data size, a FLAC its total sample count. None of
 * that requires the audio itself. A 500 MB folder can therefore be measured with
 * a few ranged GETs instead of a transfer, which is the whole point: the current
 * alternative is an admin downloading the folder and uploading it again so the
 * browser will measure it for us.
 *
 * ## Exact vs estimated
 *
 * `exact: true` means the file states a frame or sample count and the answer is
 * the encoder's own. `exact: false` means we divided the remaining bytes by the
 * announced bitrate — right to within a second for a CBR file, and wrong for a
 * VBR file that carries no Xing tag. Callers that care (a probe report, a
 * confidence badge) can tell the two apart; callers that just want minutes can
 * ignore it, since both round to the same minute in every case that matters.
 */

export type ProbeMethod =
    /** MP3 Xing/Info tag — exact frame count written by the encoder. */
    | 'XING'
    /** MP3 VBRI tag (Fraunhofer encoders) — also an exact frame count. */
    | 'VBRI'
    /** MP3 with no VBR tag: bytes ÷ announced bitrate. Exact only if truly CBR. */
    | 'MPEG_CBR'
    /** MP4/M4A/M4B `mvhd` box — duration ÷ timescale. */
    | 'MP4'
    /** RIFF/WAVE — data chunk size ÷ byte rate. */
    | 'WAV'
    /** FLAC STREAMINFO — total samples ÷ sample rate. */
    | 'FLAC';

export type ProbeFailureReason =
    /** Extension this parser does not implement (ogg, opus, wma, aac, aiff…). */
    | 'UNSUPPORTED_FORMAT'
    /** Container recognised, but the metadata lives past the bytes we were given. */
    | 'NEED_MORE_BYTES'
    /** No valid MPEG frame in the head — not an MP3, or the file is damaged. */
    | 'NO_FRAME'
    /** Header parsed but the numbers are nonsense (0 Hz, 40 h, negative…). */
    | 'IMPLAUSIBLE';

export interface ProbeSuccess {
    ok: true;
    seconds: number;
    method: ProbeMethod;
    exact: boolean;
}

export interface ProbeFailure {
    ok: false;
    reason: ProbeFailureReason;
    detail?: string;
}

export type ProbeResult = ProbeSuccess | ProbeFailure;

/** Anything outside this is a parse gone wrong, not a real track. */
const MIN_PLAUSIBLE_SECONDS = 0.05;
const MAX_PLAUSIBLE_SECONDS = 24 * 3600;

const fail = (reason: ProbeFailureReason, detail?: string): ProbeFailure => ({
    ok: false,
    reason,
    detail,
});

function ok(seconds: number, method: ProbeMethod, exact: boolean): ProbeResult {
    if (
        !Number.isFinite(seconds) ||
        seconds < MIN_PLAUSIBLE_SECONDS ||
        seconds > MAX_PLAUSIBLE_SECONDS
    ) {
        return fail('IMPLAUSIBLE', `${method}: ${seconds}s`);
    }
    return { ok: true, seconds, method, exact };
}

// --- byte helpers ----------------------------------------------------------

const u32be = (b: Uint8Array, o: number) =>
    ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32le = (b: Uint8Array, o: number) =>
    (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** ASCII tag comparison — every magic string in these containers is ASCII. */
function tagAt(b: Uint8Array, o: number, tag: string): boolean {
    if (o < 0 || o + tag.length > b.length) return false;
    for (let i = 0; i < tag.length; i++) {
        if (b[o + i] !== tag.charCodeAt(i)) return false;
    }
    return true;
}

function indexOfTag(b: Uint8Array, tag: string, from = 0): number {
    const first = tag.charCodeAt(0);
    for (let i = from; i <= b.length - tag.length; i++) {
        if (b[i] === first && tagAt(b, i, tag)) return i;
    }
    return -1;
}

// --- MPEG audio (MP3) ------------------------------------------------------

/** kbps by [versionGroup][layer][index]. versionGroup 0 = MPEG1, 1 = MPEG2/2.5. */
const BITRATES: number[][][] = [
    [
        // MPEG1: Layer I, II, III
        [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
        [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
        [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    ],
    [
        // MPEG2 / MPEG2.5: Layer I, then II and III share a table
        [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
        [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
        [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    ],
];

/** Hz by [version][index]; version 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5. */
const SAMPLE_RATES: Record<number, number[]> = {
    3: [44100, 48000, 32000],
    2: [22050, 24000, 16000],
    0: [11025, 12000, 8000],
};

interface FrameHeader {
    /** 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5. */
    version: number;
    /** 1 = Layer I, 2 = Layer II, 3 = Layer III. */
    layer: number;
    bitrateKbps: number;
    sampleRate: number;
    samplesPerFrame: number;
    frameLength: number;
    mono: boolean;
}

function parseFrameHeader(b: Uint8Array, o: number): FrameHeader | null {
    if (o + 4 > b.length) return null;
    // 11-bit sync.
    if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;

    const version = (b[o + 1] >> 3) & 0x03; // 01 is reserved
    const layerBits = (b[o + 1] >> 1) & 0x03; // 00 is reserved
    if (version === 1 || layerBits === 0) return null;

    const layer = 4 - layerBits; // 11→I, 10→II, 01→III
    const bitrateIndex = (b[o + 2] >> 4) & 0x0f;
    const sampleIndex = (b[o + 2] >> 2) & 0x03;
    if (bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return null;

    const bitrateKbps = BITRATES[version === 3 ? 0 : 1][layer - 1][bitrateIndex];
    const sampleRate = SAMPLE_RATES[version][sampleIndex];
    if (!bitrateKbps || !sampleRate) return null;

    const padding = (b[o + 2] >> 1) & 0x01;
    const mono = ((b[o + 3] >> 6) & 0x03) === 3;

    // Layer I counts 384 samples per frame and measures its length in 4-byte
    // slots; Layer III drops to 576 samples on MPEG2/2.5, which is what makes
    // its frames half the length at the same bitrate.
    const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : version === 3 ? 1152 : 576;
    const frameLength =
        layer === 1
            ? (Math.floor((12 * bitrateKbps * 1000) / sampleRate) + padding) * 4
            : Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate) + padding;
    if (frameLength < 8) return null;

    return { version, layer, bitrateKbps, sampleRate, samplesPerFrame, frameLength, mono };
}

/**
 * Total size of the ID3v2 block at the start, or 0 if there isn't one.
 *
 * The size field is "syncsafe": seven bits per byte, so the value can never
 * contain a 0xFF byte that a frame scanner would mistake for a sync word.
 */
function id3v2Length(b: Uint8Array): number {
    if (!tagAt(b, 0, 'ID3') || b.length < 10) return 0;
    const size =
        ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    const footer = (b[5] & 0x10) !== 0 ? 10 : 0;
    return 10 + size + footer;
}

/**
 * First real frame at or after `from`.
 *
 * A lone sync word proves nothing — 0xFFE is a common byte pair in cover art and
 * in audio data alike. A header is accepted only once the frame it describes is
 * followed by another valid header at exactly the length it announced, twice
 * over. That is what separates the start of the stream from a coincidence inside
 * an ID3 picture frame.
 */
function findFirstFrame(b: Uint8Array, from: number): { offset: number; header: FrameHeader } | null {
    const limit = Math.min(b.length - 4, from + 256 * 1024);
    for (let i = Math.max(0, from); i <= limit; i++) {
        if (b[i] !== 0xff) continue;
        const h = parseFrameHeader(b, i);
        if (!h) continue;

        let at = i;
        let confirmed = true;
        for (let n = 0; n < 2; n++) {
            const next = at + parseFrameHeader(b, at)!.frameLength;
            // Ran off the end of the buffer before we could confirm: accept the
            // candidate rather than reject a valid file for being sampled short.
            if (next + 4 > b.length) break;
            const nh = parseFrameHeader(b, next);
            if (!nh || nh.sampleRate !== h.sampleRate || nh.version !== h.version) {
                confirmed = false;
                break;
            }
            at = next;
        }
        if (confirmed) return { offset: i, header: h };
    }
    return null;
}

/** What the first frame of an MPEG stream declares, plus any VBR tag riding in it. */
export interface MpegSummary {
    bitrateKbps: number;
    sampleRate: number;
    samplesPerFrame: number;
    /** Where the audio starts — past any ID3v2 block. */
    frameOffset: number;
    /** Exact frame count from a VBR tag, when the encoder wrote one. */
    vbrFrames: number | null;
    vbrTag: 'XING' | 'VBRI' | null;
}

/**
 * Describe the MPEG stream starting somewhere in `buf`.
 *
 * Exported because the honest question about this parser is not "does it return
 * a number" but "how wrong is the number when there is no frame count to read".
 * Answering that needs the bitrate on its own, at arbitrary offsets in the file
 * — which is exactly what the probe script's CBR audit does.
 */
export function summariseMpeg(buf: Uint8Array): MpegSummary | null {
    const found = findFirstFrame(buf, id3v2Length(buf));
    if (!found) return null;

    const { offset, header } = found;
    const base: MpegSummary = {
        bitrateKbps: header.bitrateKbps,
        sampleRate: header.sampleRate,
        samplesPerFrame: header.samplesPerFrame,
        frameOffset: offset,
        vbrFrames: null,
        vbrTag: null,
    };

    // Xing/Info: the encoder's own frame count, written into the first frame.
    // Its offset from the frame start is the size of the side-information block,
    // which depends on version and channel mode — hence the four cases.
    const xingOff =
        offset + (header.version === 3 ? (header.mono ? 21 : 36) : header.mono ? 13 : 21);
    if (tagAt(buf, xingOff, 'Xing') || tagAt(buf, xingOff, 'Info')) {
        const flags = u32be(buf, xingOff + 4);
        if (flags & 0x01 && xingOff + 12 <= buf.length) {
            const frames = u32be(buf, xingOff + 8);
            if (frames > 0) return { ...base, vbrFrames: frames, vbrTag: 'XING' };
        }
    }

    // VBRI: same idea, Fraunhofer's variant, always 32 bytes past the header.
    const vbriOff = offset + 36;
    if (tagAt(buf, vbriOff, 'VBRI') && vbriOff + 18 <= buf.length) {
        const frames = u32be(buf, vbriOff + 14);
        if (frames > 0) return { ...base, vbrFrames: frames, vbrTag: 'VBRI' };
    }

    return base;
}

function probeMpeg(head: Uint8Array, totalBytes: number): ProbeResult {
    const s = summariseMpeg(head);
    if (!s) return fail('NO_FRAME', 'aucune trame MPEG valide dans l’en-tête');

    if (s.vbrFrames !== null) {
        return ok((s.vbrFrames * s.samplesPerFrame) / s.sampleRate, s.vbrTag!, true);
    }

    // No VBR tag. Divide what is left of the file by the announced bitrate.
    //
    // Exact for CBR, which is what a fixed-bitrate recording chain produces, and
    // an approximation for anything else — flagged as such rather than hidden.
    const audioBytes = totalBytes - s.frameOffset;
    if (audioBytes <= 0) return fail('IMPLAUSIBLE', 'taille inférieure à l’en-tête');
    return ok((audioBytes * 8) / (s.bitrateKbps * 1000), 'MPEG_CBR', false);
}

// --- MP4 / M4A / M4B -------------------------------------------------------

/**
 * duration ÷ timescale out of the `mvhd` box.
 *
 * Found by signature rather than by walking the box tree, because in a
 * non-faststart file — which is what most tagging tools produce — `moov` sits at
 * the END, so the caller hands us the tail of the object and there is no box
 * tree to walk from offset 0. The sanity check on the result is what makes the
 * shortcut safe: four ASCII bytes plus a plausible timescale and duration is not
 * something that occurs by accident.
 */
function probeMp4(buf: Uint8Array): ProbeResult {
    let at = 0;
    for (;;) {
        const i = indexOfTag(buf, 'mvhd', at);
        if (i < 0) return fail('NEED_MORE_BYTES', 'mvhd absent des octets fournis');
        at = i + 4;

        const v = buf[i + 4];
        // version 0 packs creation/modification into 32 bits, version 1 into 64.
        const base = i + 8;
        let timescale: number;
        let duration: number;
        if (v === 0 && base + 12 <= buf.length) {
            timescale = u32be(buf, base + 8);
            duration = u32be(buf, base + 12);
        } else if (v === 1 && base + 28 <= buf.length) {
            timescale = u32be(buf, base + 16);
            // 64-bit duration: the high word is zero for anything under 2^32
            // ticks, which at any real timescale is centuries.
            duration = u32be(buf, base + 20) * 2 ** 32 + u32be(buf, base + 24);
        } else {
            continue;
        }

        if (timescale > 0 && timescale <= 1_000_000 && duration > 0) {
            return ok(duration / timescale, 'MP4', true);
        }
    }
}

// --- WAV -------------------------------------------------------------------

function probeWav(head: Uint8Array): ProbeResult {
    if (!tagAt(head, 0, 'RIFF') || !tagAt(head, 8, 'WAVE')) {
        return fail('NO_FRAME', 'en-tête RIFF/WAVE absent');
    }

    let byteRate = 0;
    let at = 12;
    while (at + 8 <= head.length) {
        const size = u32le(head, at + 4);
        const body = at + 8;
        if (tagAt(head, at, 'fmt ') && body + 16 <= head.length) {
            byteRate = u32le(head, body + 8);
        } else if (tagAt(head, at, 'data')) {
            if (!byteRate) return fail('IMPLAUSIBLE', 'data avant fmt');
            return ok(size / byteRate, 'WAV', true);
        }
        // Chunks are word-aligned; an odd size carries a pad byte.
        at = body + size + (size % 2);
        if (size === 0) break;
    }
    return fail('NEED_MORE_BYTES', 'chunk data hors des octets fournis');
}

// --- FLAC ------------------------------------------------------------------

function probeFlac(head: Uint8Array): ProbeResult {
    if (!tagAt(head, 0, 'fLaC')) return fail('NO_FRAME', 'signature fLaC absente');
    // STREAMINFO is mandated to be the first metadata block, so its body starts
    // at 4 (magic) + 4 (block header).
    const o = 8;
    if (o + 18 > head.length) return fail('NEED_MORE_BYTES', 'STREAMINFO tronqué');

    // 20 bits sample rate, 3 channels, 5 bits per sample, 36 bits total samples,
    // packed across bytes 10..17 of the block.
    const sampleRate = (head[o + 10] << 12) | (head[o + 11] << 4) | (head[o + 12] >> 4);
    const totalSamples =
        (head[o + 13] & 0x0f) * 2 ** 32 +
        head[o + 14] * 2 ** 24 +
        (head[o + 15] << 16) +
        (head[o + 16] << 8) +
        head[o + 17];
    if (!sampleRate) return fail('IMPLAUSIBLE', 'fréquence nulle');
    if (!totalSamples) return fail('IMPLAUSIBLE', 'nombre d’échantillons non renseigné');
    return ok(totalSamples / sampleRate, 'FLAC', true);
}

// --- entry point -----------------------------------------------------------

const EXT = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

/** Formats whose metadata can sit at either end of the file. */
export function mayNeedTail(filename: string): boolean {
    const e = EXT(filename);
    return e === 'm4a' || e === 'm4b' || e === 'mp4';
}

/**
 * Measure one track.
 *
 * @param filename  used only to pick a parser — the bytes decide everything else
 * @param head      the first N bytes of the object
 * @param totalBytes the object's full size, from the bucket listing
 * @param tail      the last N bytes, when the caller has them. Only MP4 uses it,
 *                  and only when `moov` was not in the head.
 */
export function probeAudioDuration(
    filename: string,
    head: Uint8Array,
    totalBytes: number,
    tail?: Uint8Array,
): ProbeResult {
    switch (EXT(filename)) {
        case 'mp3':
            return probeMpeg(head, totalBytes);
        case 'm4a':
        case 'm4b':
        case 'mp4': {
            const fromHead = probeMp4(head);
            if (fromHead.ok || !tail) return fromHead;
            return probeMp4(tail);
        }
        case 'wav':
            return probeWav(head);
        case 'flac':
            return probeFlac(head);
        default:
            return fail('UNSUPPORTED_FORMAT', EXT(filename) || 'sans extension');
    }
}
