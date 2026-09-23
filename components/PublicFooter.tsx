import Link from 'next/link';

/**
 * Pied de page du site public.
 *
 * Surtout là pour le lien « Accessibilité » : c'est en pied de page que les
 * visiteurs, et les lecteurs d'écran (repère « informations sur le site »),
 * cherchent la déclaration d'accessibilité. Rien de plus, pour ne pas faire
 * doublon avec la barre de navigation.
 */
export function PublicFooter() {
    const lien =
        'rounded text-gray-800 underline underline-offset-2 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-300';

    return (
        <footer className="relative border-t border-gray-300 bg-white/80 dark:border-gray-700 dark:bg-gray-900/80">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-6 sm:px-6">
                <p className="text-gray-800 dark:text-gray-100">
                    ECA — Enregistrements à la Carte pour les Aveugles
                </p>
                <nav aria-label="Pied de page">
                    <ul className="flex flex-wrap gap-x-6 gap-y-2">
                        <li>
                            <Link href="/accessibilite" className={lien}>
                                Accessibilité
                            </Link>
                        </li>
                        <li>
                            <Link href="/contact" className={lien}>
                                Coordonnées
                            </Link>
                        </li>
                    </ul>
                </nav>
            </div>
        </footer>
    );
}
