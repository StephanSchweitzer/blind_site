import Link from 'next/link';
import { HelpCircle } from 'lucide-react';

interface AideLinkProps {
    /** Le slug de la section — l'en-tête YAML de `content/aide/<n>-<slug>.md`. */
    section: string;
    /** Une sous-section précise : l'ancre d'un titre `##`, sans le `#`. */
    anchor?: string;
    /** Le libellé, quand « Aide » n'est pas assez précis. */
    label?: string;
    className?: string;
}

/**
 * Le bouton « Aide » d'une page d'administration.
 *
 * Il pointe vers /admin/aide/<section>, JAMAIS vers une page d'un PDF : une
 * ancre de titre survit à une modification du texte, un numéro de page non —
 * il glisse en silence et envoie le permanent sur la mauvaise consigne.
 *
 * `pnpm aide:check` vérifie que chaque `section` d'ici correspond à un fichier
 * existant, pour qu'un lien mort casse la compilation plutôt que la confiance.
 */
export function AideLink({ section, anchor, label = 'Aide', className }: AideLinkProps) {
    return (
        <Link
            href={`/admin/aide/${section}${anchor ? `#${anchor}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className={
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                (className ?? '')
            }
        >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            {label}
            <span className="sr-only"> — mode d&apos;emploi de cette page</span>
        </Link>
    );
}
