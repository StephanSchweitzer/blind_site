// app/admin/stats/page.tsx
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminDashboard from './AdminDashboard';

export default async function AdminStatsPage() {
    // Server-side authentication check
    const session = await getServerSession(authOptions);

    if (!session?.user?.role || session.user.role !== 'super_admin') {
        redirect('/');
    }

    // Fetch initial admin list on the server
    const response = await fetch(`${process.env.NEXTAUTH_URL}/api/admin/stats`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    let adminUsers = [];
    if (response.ok) {
        const data = await response.json();
        adminUsers = data.admins || [];
    }

    return (
        <div className="container mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Admin Activity Dashboard</h1>
                <p className="text-muted-foreground mt-2">
                    Monitor content creation activity across all administrators
                </p>
            </div>

            {/* Client component for interactive dashboard */}
            <AdminDashboard initialAdmins={adminUsers} />
        </div>
    );
}