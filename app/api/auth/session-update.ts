// /api/auth/session-update.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Always return JSON for all responses
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Method not allowed'
        });
    }

    try {
        // Get current session
        const session = await getServerSession(req, res, authOptions);

        if (!session || !session.user?.email) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        // Verify the user exists in the database
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, email: true, name: true, role: true }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Return success without modifying the session - our enhanced
        // session callback will refresh it on the next request
        return res.status(200).json({
            success: true,
            message: 'Session will be updated on next request',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Session update error:', error);

        // Ensure we still return valid JSON even when an error occurs
        return res.status(500).json({
            success: false,
            message: 'An error occurred while updating the session',
            timestamp: new Date().toISOString()
        });
    }
}