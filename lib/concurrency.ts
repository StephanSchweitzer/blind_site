/**
 * Run `worker` over `items` with a bounded number in flight.
 *
 * Every bulk operation against the bucket is latency-bound rather than
 * bandwidth-bound — a 26-track folder measured 14.7 s serially, 3.7 s six-wide,
 * 2.9 s sixteen-wide — so some concurrency is the difference between an
 * operation that fits in a request and one that does not. The bound is what
 * stops a large folder opening a socket per file.
 *
 * Results come back in the order of `items`, not in completion order.
 */
export async function pool<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
            for (;;) {
                const i = next++;
                if (i >= items.length) return;
                out[i] = await worker(items[i]);
            }
        }),
    );
    return out;
}
