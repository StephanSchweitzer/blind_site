// types/admin-stats.ts

export interface ActivityItem {
    id: number;
    title: string;
    createdAt: Date | string;
    type: 'book' | 'news' | 'coupsdecoeur';
}

export interface WeeklyActivity {
    week: string;
    weekStart: Date | string;
    weekEnd: Date | string;
    count: number;
    items: ActivityItem[];
}

export interface AdminActivity {
    userId: number;
    userName: string;
    email: string;
    weeks: WeeklyActivity[];
}

export interface AdminStatsResponse {
    admins: AdminActivity[];
    startDate: Date | string;
    endDate: Date | string;
    type: 'books' | 'news' | 'coupsdecoeur';
}

export interface AdminUser {
    id: number;
    name: string | null;
    email: string;
}

export interface AdminListResponse {
    admins: AdminUser[];
}

export interface ChartDataPoint {
    week: string;
    [adminName: string]: number | ActivityItem[] | string;
}

export interface StatsCardData {
    total: number;
    thisWeek: number;
    active: number;
}