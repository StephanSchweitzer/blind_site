import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q) {
        return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const key = process.env.GOOGLE_BOOKS_API_KEY;
    if (!key) {
        console.error('GOOGLE_BOOKS_API_KEY is not set');
        return NextResponse.json({ error: 'Google Books API key not configured' }, { status: 500 });
    }

    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', `intitle:${q}`);
    url.searchParams.set('maxResults', '5');
    url.searchParams.set('langRestrict', 'fr');
    url.searchParams.set('country', 'FR');
    url.searchParams.set('key', key);

    try {
        const res = await fetch(url.toString());
        const data = await res.json();
        if (!res.ok) {
            return NextResponse.json(
                { error: data?.error?.message || 'Google Books request failed' },
                { status: res.status }
            );
        }
        return NextResponse.json(data);
    } catch (error) {
        console.error('Google Books proxy error:', error);
        return NextResponse.json({ error: 'Failed to reach Google Books' }, { status: 502 });
    }
}