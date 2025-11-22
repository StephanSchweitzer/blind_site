// ============================================================================
// Shared Frontend Interface Types
// These are commonly used across React components and pages
// ============================================================================

// Simple user representation used in dropdowns, lists, etc.
export interface SimpleUser {
    id: number;
    name: string | null;
    email: string;
}

// Simple book representation used in dropdowns, lists, etc.
export interface SimpleBook {
    id: number;
    title: string;
    author: string;
}

// Simple status representation
export interface SimpleStatus {
    id: number;
    name: string;
}

// Simple genre representation
export interface SimpleGenre {
    id: number;
    name: string;
}

// Order representation for lists
export interface OrderListItem {
    id: number;
    requestReceivedDate?: string;
    aveugle?: {
        name: string | null;
        email: string;
    };
    catalogue?: {
        id: number;
        title: string;
        author: string;
    };
    status?: {
        name: string;
    };
}

// Assignment representation for lists
export interface AssignmentListItem {
    id: number;
    catalogueId: number;
    orderId: number | null;
    receptionDate: string | null;
    sentToReaderDate: string | null;
    returnedToECADate: string | null;
    statusId: number;
    notes: string | null;
    currentReader: {
        id: number;
        name: string | null;
        email: string;
    } | null;
    catalogue: {
        id: number;
        title: string;
        author: string;
    };
    order: {
        id: number;
    } | null;
    status: {
        id: number;
        name: string;
    };
}

// Assignment reader history item
export interface AssignmentReaderHistoryItem {
    id: number;
    readerId: number;
    assignedDate: string;
    notes: string | null;
    reader: {
        id: number;
        name: string | null;
        email: string;
    };
}

// Form data types for creating/editing

export interface OrderFormData {
    aveugleId: number | null;
    catalogueId: number | null;
    requestReceivedDate: Date | null;
    statusId: number | null;
    isDuplication: boolean;
    mediaFormatId: number | null;
    deliveryMethod: string;
    processedByStaffId: number | null;
    cost: number | null;
    billingStatus: string;
    lentPhysicalBook: boolean;
    notes: string;
}

export interface BookFormData {
    title: string;
    author: string;
    subtitle: string;
    description: string;
    publishedDate: Date | null;
    isbn: string;
    publisher: string;
    pageCount: number | null;
    readingDurationMinutes: number | null;
    available: boolean;
    genreIds: number[];
}

export interface UserFormData {
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    homePhone: string;
    cellPhone: string;
    isActive: boolean;
    isAvailable: boolean;
    specialization: string;
    maxConcurrentAssignments: number | null;
    notes: string;
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationParams {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiSuccessResponse<T> {
    success: true;
    data: T;
    message?: string;
}

export interface ApiErrorResponse {
    success: false;
    error: string;
    message: string;
    details?: unknown;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Filter Types
// ============================================================================

export interface DateRangeFilter {
    dateFrom?: string;
    dateTo?: string;
}

export interface SearchFilter {
    search?: string;
    searchFields?: string[];
}