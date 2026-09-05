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

const PATH = '/nous-connaitre/informations-pratiques';

export const PUT = withSuperAdmin(async (req, { params }) => {
    try {
        const { id } = await params!;
        const infoId = parseRecordId(id);
        if (infoId === null) return invalidIdResponse();

        const { iconKey, colorTheme, question, body, active } = await req.json();
        const item = await prisma.practicalInfo.update({
            where: { id: infoId },
            data: {
                ...(iconKey !== undefined && { iconKey }),
                ...(colorTheme !== undefined && { colorTheme }),
                ...(question !== undefined && { question }),
                ...(body !== undefined && { body }),
                ...(active !== undefined && { active }),
            },
        });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.informationsPratiques, PATH);
        return NextResponse.json(item);
    } catch (error) {
        if (isRecordNotFound(error)) return notFoundResponse('Information introuvable');
        console.error('Error updating practical info:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
});

export const DELETE = withSuperAdmin(async (_req, { params }) => {
    try {
        const { id } = await params!;
        const infoId = parseRecordId(id);
        if (infoId === null) return invalidIdResponse();

        await prisma.practicalInfo.delete({ where: { id: infoId } });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.informationsPratiques, PATH);
        return NextResponse.json({ success: true });
    } catch (error) {
        if (isRecordNotFound(error)) return notFoundResponse('Information introuvable');
        console.error('Error deleting practical info:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
});
