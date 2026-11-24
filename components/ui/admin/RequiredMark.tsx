/**
 * The « * » after a required field's label.
 *
 * Each form wrote its own `<span className="text-red-500">*</span>`: a red at
 * 3.8:1 on white, under the 4.5:1 small text needs, and a bare « étoile » to a
 * screen reader, which never said the field was required. The star stays for
 * the eye (darker red, readable in both themes) and « obligatoire » is what
 * is heard.
 */
export function RequiredMark() {
    return (
        <>
            <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span>
            <span className="sr-only">(obligatoire)</span>
        </>
    );
}
