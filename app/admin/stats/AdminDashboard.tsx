// app/admin/stats/AdminDashboard.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Book, Newspaper, Heart, TrendingUp, Users, Calendar } from 'lucide-react';
import AdminActivityChart from './AdminActivityChart';

interface Admin {
    id: number;
    name: string | null;
    email: string;
}

interface AdminDashboardProps {
    initialAdmins: Admin[];
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ initialAdmins }) => {
    const [activeTab, setActiveTab] = useState<'books' | 'news' | 'coupsdecoeur'>('books');
    const [selectedAdmins, setSelectedAdmins] = useState<number[]>([]);
    const [timeRange, setTimeRange] = useState<string>('3');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null);
    const [admins] = useState<Admin[]>(initialAdmins);

    // Fetch data based on current filters
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                type: activeTab,
                months: timeRange,
            });

            if (selectedAdmins.length > 0) {
                params.append('adminIds', selectedAdmins.join(','));
            }

            const response = await fetch(`/api/admin/stats?${params}`);

            if (!response.ok) {
                throw new Error('Failed to fetch statistics');
            }

            const result = await response.json();
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }, [activeTab, selectedAdmins, timeRange]);

    // Fetch data when filters change
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Toggle admin selection
    const toggleAdmin = (adminId: number) => {
        setSelectedAdmins(prev =>
            prev.includes(adminId)
                ? prev.filter(id => id !== adminId)
                : [...prev, adminId]
        );
    };

    // Select/deselect all admins
    const toggleAllAdmins = () => {
        if (selectedAdmins.length === admins.length) {
            setSelectedAdmins([]);
        } else {
            setSelectedAdmins(admins.map(a => a.id));
        }
    };

    // Get stats for display
    const getStats = () => {
        if (!data?.admins) return { total: 0, thisWeek: 0, active: 0 };

        let total = 0;
        let thisWeek = 0;
        const activeAdmins = new Set();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.admins.forEach((admin: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const adminTotal = admin.weeks.reduce((sum: number, week: any) => sum + week.count, 0);
            total += adminTotal;

            if (admin.weeks.length > 0) {
                thisWeek += admin.weeks[admin.weeks.length - 1].count;
            }

            if (adminTotal > 0) {
                activeAdmins.add(admin.userId);
            }
        });

        return { total, thisWeek, active: activeAdmins.size };
    };

    const stats = getStats();

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Published</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <p className="text-xs text-muted-foreground">
                            In the last {timeRange} month{timeRange !== '1' ? 's' : ''}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">This Week</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.thisWeek}</div>
                        <p className="text-xs text-muted-foreground">
                            Current week activity
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Admins</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.active}</div>
                        <p className="text-xs text-muted-foreground">
                            With published content
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Area */}
            <div className="grid gap-6 lg:grid-cols-4">
                {/* Filters Sidebar */}
                <Card className="lg:col-span-1 h-fit">
                    <CardHeader>
                        <CardTitle>Filters</CardTitle>
                        <CardDescription>Customize your view</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Time Range */}
                        <div className="space-y-2">
                            <Label>Time Range</Label>
                            <Select value={timeRange} onValueChange={setTimeRange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Last Month</SelectItem>
                                    <SelectItem value="2">Last 2 Months</SelectItem>
                                    <SelectItem value="3">Last 3 Months</SelectItem>
                                    <SelectItem value="6">Last 6 Months</SelectItem>
                                    <SelectItem value="12">Last Year</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Admin Selection */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Administrators</Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleAllAdmins}
                                    className="h-auto p-0 text-xs"
                                >
                                    {selectedAdmins.length === admins.length ? 'Deselect All' : 'Select All'}
                                </Button>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {admins.map(admin => (
                                    <div key={admin.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`admin-${admin.id}`}
                                            checked={selectedAdmins.includes(admin.id)}
                                            onCheckedChange={() => toggleAdmin(admin.id)}
                                        />
                                        <Label
                                            htmlFor={`admin-${admin.id}`}
                                            className="text-sm font-normal cursor-pointer flex-1 truncate"
                                        >
                                            {admin.name || admin.email}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Refresh Button */}
                        <Button
                            onClick={fetchData}
                            className="w-full"
                            size="sm"
                            disabled={loading}
                        >
                            {loading ? 'Loading...' : 'Refresh Data'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Chart Area */}
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>Activity Timeline</CardTitle>
                        <CardDescription>
                            Track content publication over time
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs value={activeTab} onValueChange={
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (v) => setActiveTab(v as any)}>
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="books" className="flex items-center gap-2">
                                    <Book className="h-4 w-4" />
                                    Books
                                </TabsTrigger>
                                <TabsTrigger value="news" className="flex items-center gap-2">
                                    <Newspaper className="h-4 w-4" />
                                    News
                                </TabsTrigger>
                                <TabsTrigger value="coupsdecoeur" className="flex items-center gap-2">
                                    <Heart className="h-4 w-4" />
                                    Book Lists
                                </TabsTrigger>
                            </TabsList>

                            {error && (
                                <Alert className="mt-4">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            {loading ? (
                                <div className="mt-6 space-y-2">
                                    <Skeleton className="h-[400px] w-full" />
                                </div>
                            ) : data ? (
                                <>
                                    <TabsContent value="books" className="mt-6">
                                        <AdminActivityChart
                                            data={{ ...data, type: 'books' }}
                                            selectedAdmins={selectedAdmins}
                                        />
                                    </TabsContent>
                                    <TabsContent value="news" className="mt-6">
                                        <AdminActivityChart
                                            data={{ ...data, type: 'news' }}
                                            selectedAdmins={selectedAdmins}
                                        />
                                    </TabsContent>
                                    <TabsContent value="coupsdecoeur" className="mt-6">
                                        <AdminActivityChart
                                            data={{ ...data, type: 'coupsdecoeur' }}
                                            selectedAdmins={selectedAdmins}
                                        />
                                    </TabsContent>
                                </>
                            ) : (
                                <div className="mt-6 text-center text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </Tabs>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AdminDashboard;