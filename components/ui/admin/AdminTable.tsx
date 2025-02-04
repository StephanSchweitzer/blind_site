import {
    Table,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import React from "react";

export function AdminTable({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-md border border-gray-800">
            <Table>
                {children}
            </Table>
        </div>
    );
}

export function AdminTableHeader({ children }: { children: React.ReactNode }) {
    return (
        <TableHeader>
            <TableRow className="border-gray-800 hover:bg-gray-800/50">
                {children}
            </TableRow>
        </TableHeader>
    );
}

export function AdminTableRow({ children }: { children: React.ReactNode }) {
    return (
        <TableRow className="border-gray-800 hover:bg-gray-800/50">
            {children}
        </TableRow>
    );
}
