import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { buildPublicCoupsDeCoeurSearchWhere } from '@/lib/search';
import { rescueEmptySearch, RESCUE_CANDIDATES } from '@/lib/search-rescue';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';

        // Tokenisé et insensible aux apostrophes comme le catalogue public —
        // voir buildPublicCoupsDeCoeurSearchWhere.
        const tokenClauses = buildPublicCoupsDeCoeurSearchWhere(search);
        if (!tokenClauses) {
            return NextResponse.json(
                searchParams.get('suggest') === '1' ? { results: [], searchSuggestions: [] } : [],
            );
        }

        // `?suggest=1` : la réponse devient { results, searchSuggestions }, avec
        // les « Vouliez-vous dire … ? » quand rien n'est trouvé. Sans lui, le
        // tableau nu d'avant, pour tout appelant qui l'attend encore.
        const suggest = searchParams.get('suggest') === '1';
        const whereFor = (term: string) => ({
            active: true,
            AND: buildPublicCoupsDeCoeurSearchWhere(term) ?? [],
        });

        const results = await prisma.coupsDeCoeur.findMany({
            where: {
                // `active: false` retire une liste du site — c'est le geste par
                // lequel un permanent la dépublie. Sans ce filtre, la recherche
                // publique continuait d'en proposer le titre et la description,
                // et le clic menait vers une page qui ne la contient pas : le
                // reste du site (app/(public)/listes-de-livres/data.ts, et jusqu'à la
                // route d'administration) ne lit QUE les listes actives.
                active: true,
                AND: tokenClauses,
            },
            select: {
                id: true,
                title: true,
                description: true
            },
            take: 5,
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!suggest) return NextResponse.json(results);

        // Vérifiées sous le même filtre public (listes actives, livres visibles) :
        // un mot tiré d'une liste dépubliée ne peut pas ressortir par ici.
        const searchSuggestions =
            results.length === 0
                ? await rescueEmptySearch({
                    search,
                    domains: ['listes', 'books'],
                    count: (q) => prisma.coupsDeCoeur.count({ where: whereFor(q.query) }),
                    // Only what `results` already shows a visitor: the title and
                    // the description, of active lists.
                    find: (q) =>
                        prisma.coupsDeCoeur.findMany({
                            where: whereFor(q.query),
                            orderBy: { createdAt: 'desc' },
                            take: RESCUE_CANDIDATES,
                            select: { id: true, title: true, description: true },
                        }),
                    rankText: (l) => l.title,
                    toRow: (l) => ({ id: l.id, title: l.title, description: l.description }),
                })
                : [];
        return NextResponse.json({ results, searchSuggestions });
    } catch (error) {
        console.error('Failed to fetch preview results:', error);
        return NextResponse.json({ error: 'Failed to fetch preview results' }, { status: 500 });
    }
}