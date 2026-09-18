// app/api/news/search/route.ts
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { listAdminNews, parseAdminNewsQuery } from '@/lib/news/newsList';

/**
 * La recherche des dernières infos du back-office, pendant la frappe.
 *
 * Cette route existait sans garde et sans appelant — une autocomplétion que plus
 * rien n'utilisait. Elle sert désormais la table de /admin/news, qui la
 * rappelle à chaque changement de recherche, de champ, de type ou de page au
 * lieu de refaire le rendu serveur de la page : voir lib/news/newsList.ts pour
 * le moteur, partagé avec ce premier rendu.
 *
 * Admin : elle cherche aussi par auteur, c'est-à-dire par permanent. Le site
 * public lit /api/news.
 */
export const GET = withAdmin(async (req) => {
    try {
        const params = req.nextUrl.searchParams;
        const result = await listAdminNews(parseAdminNewsQuery((key) => params.get(key)));
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error searching news:', error);
        return NextResponse.json(
            { error: 'Failed to search news', message: 'La recherche des dernières infos a échoué' },
            { status: 500 }
        );
    }
});
