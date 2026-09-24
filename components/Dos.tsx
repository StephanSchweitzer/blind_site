/**
 * Une rangée de dos de livres — les sept couleurs des livres du logo, debout
 * côte à côte comme sur une étagère. C'est la signature du site : elle ouvre
 * chaque page publique à la place de l'ancien trait en dégradé.
 *
 * Purement décorative : cachée aux lecteurs d'écran, et elle ne bouge pas.
 */
const DOS = [
    { couleur: 'bg-dos-bleu', hauteur: 'h-7' },
    { couleur: 'bg-dos-violet', hauteur: 'h-6' },
    { couleur: 'bg-dos-rose', hauteur: 'h-8' },
    { couleur: 'bg-dos-rouge', hauteur: 'h-[1.6rem]' },
    { couleur: 'bg-dos-orange', hauteur: 'h-7' },
    { couleur: 'bg-dos-jaune', hauteur: 'h-[1.4rem]' },
    { couleur: 'bg-dos-turquoise', hauteur: 'h-[1.9rem]' },
];

export function Dos({ className = '' }: { className?: string }) {
    return (
        <div aria-hidden="true" className={`flex items-end gap-[3px] ${className}`}>
            {DOS.map(({ couleur, hauteur }) => (
                <span key={couleur} className={`block w-2 rounded-[2px] ${couleur} ${hauteur}`} />
            ))}
        </div>
    );
}
