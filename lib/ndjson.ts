/**
 * Lit un corps de réponse NDJSON (une valeur JSON par ligne) et appelle
 * `onMessage` pour chacune, au fur et à mesure qu'elle arrive.
 *
 * Sert aux suppressions audio qui annoncent leur avancement (voir
 * DELETE /api/books/[id]/audio/tracks et DELETE /api/books/[id]).
 */
export async function readNdjson<T>(
    body: ReadableStream<Uint8Array>,
    onMessage: (message: T) => void,
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const flush = (line: string) => {
        if (line.trim()) onMessage(JSON.parse(line) as T);
    };
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(flush);
    }
    flush(buffer);
}
