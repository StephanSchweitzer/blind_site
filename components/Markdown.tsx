import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders admin-authored markdown with the site's existing prose styling, so
 * DB-driven body text keeps inline bold, links and lists without a global
 * typography plugin.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
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
                    h3: (props) => <h3 className="font-semibold text-gray-900 dark:text-white mb-2" {...props} />,
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
