import {
    Table,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import React from "react";

export function AdminTable({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-md border border-border">
            <Table>
                {children}
            </Table>
        </div>
    );
}

export function AdminTableHeader({ children }: { children: React.ReactNode }) {
    return (
        <TableHeader>
            <TableRow className="border-border hover:bg-muted/50">
                {children}
            </TableRow>
        </TableHeader>
    );
}

export function AdminTableRow({ children }: { children: React.ReactNode }) {
    return (
        <TableRow className="border-border hover:bg-muted/50">
            {children}
        </TableRow>
    );
}
