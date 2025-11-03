import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {AssignmentUpdateData, assignmentUpdateSchema} from "@/lib/zodSchemas";

// -------------------------
// GET /api/assignments/[id]
// -------------------------
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const assignment = await prisma.assignment.findUnique({
            where: { id: parseInt(id) },
            include: {
                reader: true,
                catalogue: true,
                order: true,
                status: true,
            },
        });

        if (!assignment) {
            return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        return NextResponse.json(assignment);
    } catch (error) {
        console.error("Error fetching assignment:", error);
        return NextResponse.json({ error: "Failed to fetch assignment" }, { status: 500 });
    }
}

// -------------------------
// PATCH /api/assignments/[id]
// -------------------------
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // ✅ Validate request body with Zod
        const json = await request.json();
        const body = assignmentUpdateSchema.parse(json);

        // ✅ Typed, flexible object (no any)
        const updateData = {} as Partial<AssignmentUpdateData>;

        if (body.readerId !== undefined) updateData.readerId = body.readerId;
        if (body.catalogueId !== undefined) updateData.catalogueId = body.catalogueId;
        if (body.orderId !== undefined) updateData.orderId = body.orderId ?? null;

        if (body.receptionDate !== undefined)
            updateData.receptionDate = body.receptionDate
                ? new Date(body.receptionDate).toISOString()
                : null;

        if (body.sentToReaderDate !== undefined)
            updateData.sentToReaderDate = body.sentToReaderDate
                ? new Date(body.sentToReaderDate).toISOString()
                : null;

        if (body.returnedToECADate !== undefined)
            updateData.returnedToECADate = body.returnedToECADate
                ? new Date(body.returnedToECADate).toISOString()
                : null;

        if (body.statusId !== undefined) updateData.statusId = body.statusId;
        if (body.notes !== undefined) updateData.notes = body.notes ?? null;

        const assignment = await prisma.assignment.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                reader: true,
                catalogue: true,
                order: true,
                status: true,
            },
        });

        return NextResponse.json(assignment);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ errors: error.issues }, { status: 400 });
        }

        console.error("Error updating assignment:", error);
        return NextResponse.json(
            { error: "Failed to update assignment" },
            { status: 500 }
        );
    }
}

// -------------------------
// DELETE /api/assignments/[id]
// -------------------------
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.assignment.delete({
            where: { id: parseInt(id) },
        });

        return NextResponse.json({ message: "Assignment deleted successfully" });
    } catch (error) {
        console.error("Error deleting assignment:", error);
        return NextResponse.json({ error: "Failed to delete assignment" }, { status: 500 });
    }
}