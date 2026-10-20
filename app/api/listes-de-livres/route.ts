import { NextResponse } from 'next/server';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { parseListEntries } from '@/lib/books/listEntries';

// Pas de GET ici. Il y en avait un, ouvert sans session et sans plus aucun
// appelant depuis que /listes-de-livres est un composant serveur
// (app/(public)/listes-de-livres/data.ts) : la page publique lit par data.ts, sa
// recherche par ./preview, son lien profond par ./position, et le back-office
// par ./[id]. Une route publique que personne n'appelle n'est qu'une surface à
// garder étanche pour rien — c'est elle qui a laissé passer livres masqués et
// noms de permanents avant f3faa02.

export const POST = withAdmin(async (req, { me }) => {
    try {
        const body = await req.json();
        const { title, description, audioPath, active } = body;
        const entries = parseListEntries(body);

        if (!title || !entries || entries.length === 0) {
            return NextResponse.json(
                { error: 'Title and at least one book are required' },
                { status: 400 }
            );
        }

        const newCoupDeCoeur = await prisma.coupsDeCoeur.create({
            data: {
                title,
                description: description || null,
                audioPath: audioPath || null,
                active: active ?? true,
                addedById: me.id,
                books: {
                    create: entries.map(({ bookId, note, position }) => ({
                        note: note ?? null,
                        position: position ?? null,
                        book: { connect: { id: bookId } }
                    }))
                }
            },
            include: {
                books: {
                    include: {
                        book: true
                    }
                }
            }
        });

        revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');

        return NextResponse.json(newCoupDeCoeur, { status: 201 });
    } catch (error) {
        console.error('Error creating coup de coeur:', error);
        return NextResponse.json(
            { error: 'Failed to create coup de coeur' },
            { status: 500 }
        );
    }
});