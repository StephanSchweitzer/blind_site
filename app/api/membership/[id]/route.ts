import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { withSuperAdmin } from '@/lib/auth/guards';
import {
    parseRecordId,
    invalidIdResponse,
    isRecordNotFound,
    notFoundResponse,
} from '@/lib/api-errors';

const PATH = '/nous-rejoindre';

export const PUT = withSuperAdmin(async (req, { params }) => {
    try {
        const { id } = await params!;
        const optionId = parseRecordId(id);
        if (optionId === null) return invalidIdResponse();

        const b = await req.json();
        const item = await prisma.membershipOption.update({
            where: { id: optionId },
            data: {
                ...(b.iconKey !== undefined && { iconKey: b.iconKey }),
                ...(b.colorTheme !== undefined && { colorTheme: b.colorTheme }),
                ...(b.title !== undefined && { title: b.title }),
                ...(b.body !== undefined && { body: b.body }),
                ...(b.highlightLabel !== undefined && { highlightLabel: b.highlightLabel || null }),
                ...(b.highlightValue !== undefined && { highlightValue: b.highlightValue || null }),
                ...(b.bullets !== undefined && { bullets: b.bullets || null }),
                ...(b.ctaLabel !== undefined && { ctaLabel: b.ctaLabel || null }),
                ...(b.ctaHref !== undefined && { ctaHref: b.ctaHref || null }),
                ...(b.active !== undefined && { active: b.active }),
            },
        });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.nousRejoindre, PATH);
        return NextResponse.json(item);
    } catch (error) {
        if (isRecordNotFound(error)) return notFoundResponse('Option introuvable');
        console.error('Error updating membership option:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
});

export const DELETE = withSuperAdmin(async (_req, { params }) => {
    try {
        const { id } = await params!;
        const optionId = parseRecordId(id);
        if (optionId === null) return invalidIdResponse();

        await prisma.membershipOption.delete({ where: { id: optionId } });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.nousRejoindre, PATH);
        return NextResponse.json({ success: true });
    } catch (error) {
        if (isRecordNotFound(error)) return notFoundResponse('Option introuvable');
        console.error('Error deleting membership option:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
});
