// app/admin/stats/AdminActivityChart.tsx
'use client';

import React, { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Book, Newspaper, Heart } from 'lucide-react';

interface ActivityItem {
    id: number;
    title: string;
    createdAt: string;
    type: 'book' | 'news' | 'coupsdecoeur';
}

interface WeeklyActivity {
    week: string;
    weekStart: string;
    weekEnd: string;
    count: number;
    items: ActivityItem[];
}

interface AdminActivity {
    userId: number;
    userName: string;
    email: string;
    weeks: WeeklyActivity[];
}

interface ChartData {
    week: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

interface AdminActivityChartProps {
    data: {
        admins: AdminActivity[];
        type: string;
    };
    selectedAdmins: number[];
}

// Color palette for different admins
const COLORS = [
    '#8b5cf6', // violet
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#ec4899', // pink
    '#14b8a6', // teal
    '#6366f1', // indigo
];

const AdminActivityChart: React.FC<AdminActivityChartProps> = ({ data, selectedAdmins }) => {

    // Transform data for Recharts
    const chartData = useMemo(() => {
        if (!data.admins.length) return [];

        // Get all unique weeks
        const weeks = data.admins[0].weeks.map(w => w.week);

        // Build chart data
        return weeks.map((week, weekIndex) => {
            const weekData: ChartData = { week };

            // Add data for each admin
            data.admins.forEach(admin => {
                if (selectedAdmins.length === 0 || selectedAdmins.includes(admin.userId)) {
                    const weekInfo = admin.weeks[weekIndex];
                    weekData[admin.userName] = weekInfo.count;
                    weekData[`${admin.userName}_items`] = weekInfo.items;
                }
            });

            return weekData;
        });
    }, [data, selectedAdmins]);

    // Filter admins based on selection
    const visibleAdmins = useMemo(() => {
        return data.admins.filter(admin =>
            selectedAdmins.length === 0 || selectedAdmins.includes(admin.userId)
        );
    }, [data.admins, selectedAdmins]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CustomDot = (props: any) => {
        const { cx, cy, payload, dataKey } = props;
        const items = payload[`${dataKey}_items`];

        if (!items || items.length === 0) return null;

        return (
            <Popover>
                <PopoverTrigger asChild>
                    <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={props.fill}
                        stroke="#fff"
                        strokeWidth={2}
                        style={{ cursor: 'pointer' }}
                        className="hover:r-8 transition-all"
                    />
                </PopoverTrigger>
                <PopoverContent className="w-96" align="center">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{dataKey}</h4>
                            <Badge variant="secondary">{payload.week}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {items.length} {data.type === 'books' ? 'book' : data.type === 'news' ? 'article' : 'coup de coeur'}
                            {items.length !== 1 ? 's' : ''} published
                        </div>
                        <ScrollArea className="h-64 w-full rounded-md border p-4">
                            <div className="space-y-3">
                                {items.map((item: ActivityItem) => (
                                    <div key={item.id} className="flex items-start space-x-2">
                                        <div className="mt-1">
                                            {item.type === 'book' ? (
                                                <Book className="h-4 w-4 text-blue-500" />
                                            ) : item.type === 'news' ? (
                                                <Newspaper className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <Heart className="h-4 w-4 text-red-500" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium leading-tight">{item.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(item.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </PopoverContent>
            </Popover>
        );
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-background border rounded-lg shadow-lg p-4">
                    <p className="font-semibold mb-2">{label}</p>
                    {// eslint-disable-next-line @typescript-eslint/no-explicit-any
                        payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center justify-between space-x-4">
              <span className="text-sm" style={{ color: entry.color }}>
                {entry.dataKey}:
              </span>
                            <span className="text-sm font-medium">{entry.value}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                        dataKey="week"
                        className="text-xs"
                        tick={{ fill: 'currentColor' }}
                    />
                    <YAxis
                        className="text-xs"
                        tick={{ fill: 'currentColor' }}
                        label={{
                            value: `Number of ${data.type === 'books' ? 'Books' : data.type === 'news' ? 'Articles' : 'Coups de Coeur'}`,
                            angle: -90,
                            position: 'insideLeft',
                            style: { textAnchor: 'middle', fill: 'currentColor' }
                        }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {visibleAdmins.map((admin, index) => (
                        <Line
                            key={admin.userId}
                            type="monotone"
                            dataKey={admin.userName}
                            stroke={COLORS[index % COLORS.length]}
                            strokeWidth={2}
                            dot={<CustomDot fill={COLORS[index % COLORS.length]} />}
                            activeDot={{ r: 8 }}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default AdminActivityChart;