'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SearchBar } from '@/listes-de-livres/SearchBar';
import { CoupDeCoeurList } from '@/listes-de-livres/CoupDeCoeurList';
import { BookModal } from '@/components/BookModal';
import FrontendNavbar from '@/components/Frontend-Navbar';
import { PublicPaginatedList } from '@/components/ui/public-pagination';
import { outOfRangePage, pageInfo, parsePageParam } from '@/lib/pagination';
import { useListUrl } from '@/hooks/useListUrl';
import { PDFButton } from '@/listes-de-livres/PDFButton';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import type { PublicBook } from '@/lib/books/publicBook';
import { PageHeader } from "@/components/PageHeader";

type ListPage = { items: CoupDeCoeur[]; total: number };

/** `?page=N` ; la page 1 n'en porte pas. */
function pageParams(page: number): URLSearchParams {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    return params;
}

interface CoupsDeCoeurClientProps {
    /** La page 1, rendue dans le HTML statique. */
    initialContent: CoupDeCoeur[];
    /** Nombre de listes : une par page (COUPS_DE_COEUR_PAGE_SIZE). */
    initialTotal: number;
}

/**
 * La page est servie en statique : la page 1 arrive avec le HTML, et la
 * navigation depuis le reste du site est instantanée (préchargée par les
 * liens). Les autres pages se chargent ici, par /api/listes-de-livres/page, et
 * restent en mémoire — revenir à une liste déjà vue ne recharge rien, et la
 * suivante est préchargée pendant qu'on lit celle-ci.
 *
 * La page vit dans l'URL (hooks/useListUrl.ts) : un lien `?page=3`, un retour
 * arrière, un rechargement retombent sur la même liste.
 */
export default function CoupsDeCoeurClient({
                                               initialContent,
                                               initialTotal,
                                           }: CoupsDeCoeurClientProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pages, setPages] = useState<Record<number, ListPage>>({
        1: { items: initialContent, total: initialTotal },
    });
    // La dernière page affichée : elle reste à l'écran, estompée, pendant que
    // la demandée arrive — plutôt qu'un blanc.
    const [displayedPage, setDisplayedPage] = useState(1);
    const [failedPage, setFailedPage] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBook, setSelectedBook] = useState<PublicBook | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const requests = useRef(new Map<number, Promise<ListPage>>());

    if (pages[currentPage] && displayedPage !== currentPage) {
        setDisplayedPage(currentPage);
    }

    const writeUrl = useListUrl((params) => {
        setCurrentPage(parsePageParam(params.get('page')));
    });

    // Une seule requête par page, partagée entre le préchargement et le clic.
    const loadPage = useCallback((page: number) => {
        let request = requests.current.get(page);
        if (!request) {
            request = fetch(`/api/listes-de-livres/page?page=${page}`).then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<ListPage>;
            });
            // Un échec n'est pas gardé : revenir sur la page refait la requête.
            request.catch(() => requests.current.delete(page));
            requests.current.set(page, request);
        }
        return request;
    }, []);

    useEffect(() => {
        if (pages[currentPage]) return;
        const page = currentPage;
        let cancelled = false;
        loadPage(page).then(
            (data) => {
                if (cancelled) return;
                // Un lien vers une page qui n'existe plus : la dernière, en
                // remplaçant l'entrée d'historique qui y ramènerait.
                const lastPage = outOfRangePage(pageInfo(page, 1, data.total), data.items.length);
                if (lastPage) {
                    writeUrl(pageParams(lastPage), { replace: true });
                    setCurrentPage(lastPage);
                    return;
                }
                setFailedPage(null);
                setPages((prev) => ({ ...prev, [page]: data }));
            },
            () => {
                if (!cancelled) setFailedPage(page);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [currentPage, pages, loadPage, writeUrl]);

    // La liste suivante, préchargée pendant qu'on lit celle-ci : « Suivant »
    // l'affiche sans attente. Un échec ici ne dit rien — le clic réessaiera.
    const total = pages[displayedPage].total;
    useEffect(() => {
        const next = displayedPage + 1;
        if (next > total || pages[next]) return;
        let cancelled = false;
        loadPage(next).then(
            (data) => {
                if (!cancelled) setPages((prev) => ({ ...prev, [next]: data }));
            },
            () => {},
        );
        return () => {
            cancelled = true;
        };
    }, [displayedPage, total, pages, loadPage]);

    const content = pages[displayedPage].items;
    const failed = failedPage === currentPage && !pages[currentPage];
    const isLoading = !pages[currentPage] && !failed;

    const goToPage = (page: number) => {
        setCurrentPage(page);
        writeUrl(pageParams(page));
    };

    const handleResultSelect = async (id: number) => {
        try {
            const response = await fetch(`/api/listes-de-livres/position?id=${id}`);
            if (response.ok) {
                const { page } = await response.json();
                goToPage(page);
            }
        } catch (error) {
            console.error('Error finding coup de coeur position:', error);
        }
    };

    const handleBookClick = (book: PublicBook) => {
        setSelectedBook(book);
        setIsModalOpen(true);
    };

    return (
        <div className="flex min-h-screen flex-col">
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-8">
                <PageHeader title="Listes de livres">
                    <p>
                        À demander au{' '}
                        {/* Both numbers in full and as tel: links: « ou 48 », read aloud
                            or tapped, leads nowhere. */}
                        <a href="tel:+33188323147" className="font-semibold whitespace-nowrap text-primary dark:text-blue-300 underline underline-offset-2">01 88 32 31 47</a>{' '}
                        ou{' '}
                        <a href="tel:+33188323148" className="font-semibold whitespace-nowrap text-primary dark:text-blue-300 underline underline-offset-2">01 88 32 31 48</a>{' '}
                        ou par courriel à{' '}
                        <a href="mailto:ecapermanence@gmail.com" className="font-semibold whitespace-nowrap text-primary dark:text-blue-300 underline underline-offset-2">ecapermanence@gmail.com</a>
                    </p>
                </PageHeader>

                <div className="space-y-8">
                    <div className="mb-8" style={{ animationDelay: '100ms' }}>
                        <SearchBar
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            onResultSelect={handleResultSelect}
                        />
                    </div>

                    <PublicPaginatedList
                        info={pageInfo(currentPage, 1, total)}
                        noun={{ one: 'liste', many: 'listes', feminine: true }}
                        label="Pages des listes de livres"
                        onPageChange={goToPage}
                        pending={isLoading}
                        announce={isLoading ? 'Chargement de la liste…' : failed ? '' : undefined}
                    >
                        {failed ? (
                            <div role="alert" className="text-center py-12 rounded-2xl bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50">
                                <p className="text-red-800 dark:text-red-300 font-medium">
                                    Cette liste n&apos;a pas pu être chargée. Vérifiez votre connexion, puis réessayez.
                                </p>
                            </div>
                        ) : content.length === 0 ? (
                            <div className="text-center py-12 glass-card">
                                <div className="max-w-md mx-auto">
                                    <div aria-hidden="true" className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg aria-hidden="true" focusable="false" className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-700 dark:text-gray-300 font-medium">Aucun résultat trouvé</p>
                                </div>
                            </div>
                        ) : (
                            <CoupDeCoeurList
                                content={content}
                                onBookClick={handleBookClick}
                                isTransitioning={isLoading}
                            />
                        )}
                    </PublicPaginatedList>

                    <BookModal
                        book={selectedBook}
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                    />
                </div>
            </div>

            {content.length > 0 && (
                <PDFButton content={content} />
            )}
        </main>
        </div>
    );
}