import React from 'react';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import BackendNavbar from '@/components/Backend-Navbar';
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
import SearchBar from './search-bar';
import { Suspense } from 'react';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

export default async function Genres({ searchParams }: PageProps) {
    const params = await searchParams;

    const pageParam = typeof params.page === 'string' ? params.page :
        Array.isArray(params.page) ? params.page[0] : '1';
    const searchParam = typeof params.search === 'string' ? params.search :
        Array.isArray(params.search) ? params.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;
    const genresPerPage = 10;

    const whereClause: Prisma.GenreWhereInput = {
        OR: [
            {
                name: {
                    contains: searchTerm,
                    mode: Prisma.QueryMode.insensitive
                }
            },
            {
                description: {
                    contains: searchTerm,
                    mode: Prisma.QueryMode.insensitive
                }
            }
        ]
    };

    const [genres, totalGenres] = await Promise.all([
        prisma.genre.findMany({
            where: whereClause,
            orderBy: { name: 'asc' },
            skip: (page - 1) * genresPerPage,
            take: genresPerPage,
        }),
        prisma.genre.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(totalGenres / genresPerPage);

    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <CardTitle>Manage Genres</CardTitle>
                        <Link href="/admin/genres/new">
                            <Button>Add New Genre</Button>
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
                                        <TableHead>Name</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {genres.map((genre) => (
                                        <TableRow key={genre.id}>
                                            <TableCell>{genre.name}</TableCell>
                                            <TableCell>{genre.description || 'N/A'}</TableCell>
                                            <TableCell>
                                                <Link href={`/app/admin/genres/${genre.id}`}>
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
                                    href={`/admin/genres?page=${index + 1}&search=${searchTerm}`}
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