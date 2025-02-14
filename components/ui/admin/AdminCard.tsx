// components/ui/admin/AdminCard.tsx
import { Card } from "@/components/ui/card";
import React from "react";

export function AdminCard({ children, className = "" }: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <Card className={`border-gray-800 bg-gray-900/50 backdrop-blur-sm ${className}`}>
            {children}
        </Card>
    );
}