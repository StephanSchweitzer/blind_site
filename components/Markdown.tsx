import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { slugifyHeading } from '@/lib/aide-slug';

/** Le texte brut d'un titre, pour en dériver l'ancre. */
function headingText(children: React.ReactNode): string {
    if (typeof children === 'string') return children;
    if (Array.isArray(children)) return children.map(headingText).join('');
    if (children && typeof children === 'object' && 'props' in children) {
        return headingText((children as { props: { children?: React.ReactNode } }).props.children);
    }
    return '';
}

interface MarkdownProps {
    children: string;
    className?: string;
    /**
     * Pose une ancre sur chaque titre (`id="modification-des-factures"`), pour
     * que les boutons « Aide » puissent pointer une sous-section précise. Le
     * mode d'emploi s'en sert ; la copie saisie en base, non.
     */
    headingIds?: boolean;
}

/**
 * Renders admin-authored markdown with the site's existing prose styling, so
 * DB-driven body text keeps inline bold, links and lists without a global
 * typography plugin.
 *
 * Sert aussi au mode d'emploi (`content/aide/*.md`), qui apporte des titres,
 * des captures d'écran et des ancres — d'où les rendus ajoutés plus bas. Les
 * anciens appels ne changent pas de comportement : ils n'écrivent ni titres de
 * niveau 1-2, ni images.
 */
export function Markdown({ children, className, headingIds = false }: MarkdownProps) {
    const anchor = (children: React.ReactNode) =>
        headingIds ? slugifyHeading(headingText(children)) : undefined;

    return (
        <div className={className}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: (props) => <p className="text-gray-700 dark:text-gray-100 leading-relaxed mb-4 last:mb-0" {...props} />,
                    a: (props) => <a className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-medium" {...props} />,
                    strong: (props) => <strong className="font-semibold text-gray-900 dark:text-white" {...props} />,
                    ul: (props) => <ul className="list-disc list-inside space-y-1 mb-4 last:mb-0 text-gray-700 dark:text-gray-100" {...props} />,
                    ol: (props) => <ol className="list-decimal list-inside space-y-1 mb-4 last:mb-0 text-gray-700 dark:text-gray-100" {...props} />,
                    li: (props) => <li className="text-gray-700 dark:text-gray-100" {...props} />,
                    h1: ({ children, ...props }) => (
                        <h1 id={anchor(children)} className="scroll-mt-24 text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-3 first:mt-0" {...props}>{children}</h1>
                    ),
                    h2: ({ children, ...props }) => (
                        <h2 id={anchor(children)} className="scroll-mt-24 text-xl font-semibold text-gray-900 dark:text-white mt-10 mb-3 pb-2 border-b border-border first:mt-0" {...props}>{children}</h2>
                    ),
                    h3: ({ children, ...props }) => (
                        <h3 id={anchor(children)} className="scroll-mt-24 font-semibold text-gray-900 dark:text-white mt-6 mb-2" {...props}>{children}</h3>
                    ),
                    h4: ({ children, ...props }) => (
                        <h4 id={anchor(children)} className="scroll-mt-24 font-semibold text-gray-800 dark:text-gray-100 mt-4 mb-2" {...props}>{children}</h4>
                    ),
                    hr: (props) => <hr className="my-8 border-border" {...props} />,
                    blockquote: (props) => (
                        <blockquote className="border-l-4 border-border pl-4 italic text-gray-600 dark:text-gray-300 mb-4" {...props} />
                    ),
                    code: (props) => (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground" {...props} />
                    ),
                    // Les captures du mode d'emploi sont des fichiers statiques de
                    // public/aide, de dimensions inconnues à la compilation : next/image
                    // exigerait une largeur et une hauteur par capture. Un <img> paresseux
                    // fait le travail, et le cadre rappelle qu'on regarde une capture.
                    img: ({ src, alt }) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={typeof src === 'string' ? src : ''}
                            alt={alt ?? ''}
                            loading="lazy"
                            className="my-4 w-full rounded-lg border border-border shadow-sm"
                        />
                    ),
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
