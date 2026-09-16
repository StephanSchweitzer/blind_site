import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

/**
 * Nightly refresh of `search_vocabulary`, the word list behind the search
 * bars' « Vouliez-vous dire … ? » (lib/search-suggest.ts). Scheduled by
 * vercel.json.
 *
 * The view is a snapshot: a name or title entered today is SEARCHABLE at once,
 * but only proposed as a spelling correction after this has run. Refreshed
 * CONCURRENTLY, so suggestions keep working while it rebuilds (a few seconds
 * on ~15 000 books).
 *
 * Same two ways in as the other cron routes: Vercel's scheduler with
 * `Authorization: Bearer <CRON_SECRET>` — refusing when no secret is
 * configured — or a signed-in super admin, to force it after an import.
 */
export const dynamic = 'force-dynamic';

async function isAuthorized(request: NextRequest): Promise<boolean> {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true;

    const me = await getCurrentUser();
    return me !== null && isSuperAdmin(me.accessLevel);
}

async function run(request: NextRequest) {
    if (!(await isAuthorized(request))) {
        return NextResponse.json({ message: 'Non autorisé' }, { status: 401 });
    }

    try {
        const started = Date.now();
        await prisma.$executeRawUnsafe('SELECT refresh_search_vocabulary()');
        const [{ words }] = await prisma.$queryRawUnsafe<{ words: bigint }[]>(
            'SELECT count(*) AS words FROM search_vocabulary',
        );
        const result = { words: Number(words), milliseconds: Date.now() - started };
        console.log(`[cron] refresh-search-vocabulary: ${result.words} mots en ${result.milliseconds} ms`);
        return NextResponse.json(result);
    } catch (error) {
        console.error('[cron] refresh-search-vocabulary failed:', error);
        return NextResponse.json({ message: 'Le rafraîchissement a échoué' }, { status: 500 });
    }
}

export const GET = run;
export const POST = run;
