import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

// Pas de GET ici. Il y en avait un, ouvert sans session et sans plus aucun
// appelant depuis que /listes-de-livres est un composant serveur
// (app/listes-de-livres/data.ts) : la page publique lit par data.ts, sa
// recherche par ./preview, son lien profond par ./position, et le back-office
// par ./[id]. Une route publique que personne n'appelle n'est qu'une surface à
// garder étanche pour rien — c'est elle qui a laissé passer livres masqués et
// noms de permanents avant f3faa02.

export const POST = withAdmin(async (req, { me }) => {
    revalidateAdmin();
    try {
        const body = await req.json();
        const { title, description, audioPath, bookIds, active } = body;

        if (!title || !Array.isArray(bookIds) || bookIds.length === 0) {
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
                    create: bookIds.map((bookId: number) => ({
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