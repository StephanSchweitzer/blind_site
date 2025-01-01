import React from 'react';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import BackendNavbar from '../../../components/Backend-Navbar';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import SearchBar from './components/search-bar';
import { Suspense } from 'react';

type CoupsDeCoeurWithUser = Prisma.CoupsDeCoeurGetPayload<{
    include: {
        addedBy: true;
        books: {
            include: {
                book: true;
            };
        };
    };
}>;

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

export default async function CoupsDeCoeur({ searchParams }: PageProps) {
    const params = await searchParams;

    const pageParam = typeof params.page === 'string' ? params.page :
        Array.isArray(params.page) ? params.page[0] : '1';
    const searchParam = typeof params.search === 'string' ? params.search :
        Array.isArray(params.search) ? params.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;
    const itemsPerPage = 10;

    const whereClause: Prisma.CoupsDeCoeurWhereInput = searchTerm
        ? {
            OR: [
                {
                    title: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive
                    }
                },
                {
                    description: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive
                    }
                },
                {
                    addedBy: {
                        name: {
                            contains: searchTerm,
                            mode: Prisma.QueryMode.insensitive
                        }
                    }
                }
            ]
        }
        : {};

    const [items, totalItems] = await Promise.all([
        prisma.coupsDeCoeur.findMany({
            where: whereClause,
            include: {
                addedBy: true,
                books: {
                    include: {
                        book: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip: (page - 1) * itemsPerPage,
            take: itemsPerPage,
        }),
        prisma.coupsDeCoeur.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(totalItems / itemsPerPage);

    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <CardTitle>Manage Coups de Coeur</CardTitle>
                        <Link href="/admin/manage_coups_de_coeur/new">
                            <Button>Add New Coup de Coeur</Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={<div>Loading...</div>}>
                            <SearchBar />
                        </Suspense>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Added By</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Books</TableHead>
                                        <TableHead>Created At</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item: CoupsDeCoeurWithUser) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.title}</TableCell>
                                            <TableCell>{item.addedBy?.name || 'Unknown'}</TableCell>
                                            <TableCell>{item.active ? 'Active' : 'Inactive'}</TableCell>
                                            <TableCell>{item.books.length} books</TableCell>
                                            <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                                            <TableCell>
                                                <Link href={`/admin/manage_coups_de_coeur/${item.id}`}>
                                                    <Button variant="outline" size="sm">
                                                        Edit
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex justify-center items-center gap-2 mt-4">
                            {Array.from({ length: totalPages }, (_, index) => (
                                <Link
                                    key={index + 1}
                                    href={`/admin/manage_coups_de_coeur?page=${index + 1}&search=${searchTerm}`}
                                >
                                    <Button
                                        variant={page === index + 1 ? "default" : "outline"}
                                        size="sm"
                                    >
                                        {index + 1}
                                    </Button>
                                </Link>
                            ))}
                        </div>
                        <p className="text-center text-sm text-muted-foreground mt-2">
                            Page {page} of {totalPages}
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}