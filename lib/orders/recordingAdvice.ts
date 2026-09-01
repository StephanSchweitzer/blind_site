/**
 * Quand une mise en garde sur l'enregistrement a le droit d'exister.
 *
 * Les trois avertissements « enregistrement » (audio déjà présent, demande
 * d'enregistrement active déjà là, et le confirm à l'enregistrement du
 * formulaire) portent tous sur une décision qu'on est en train de PRENDRE :
 * « faut-il vraiment faire enregistrer ce livre ? ». Sur une demande qui
 * existe déjà, la décision a été prise il y a longtemps — et 99 fois sur 100
 * le formulaire ouvert EST la demande d'enregistrement d'origine. L'avertir
 * d'elle-même n'apprend rien à personne : c'est du bruit, et du bruit qu'on
 * finit par ne plus lire.
 *
 * D'où la règle, tenue ici et nulle part ailleurs : une demande enregistrée
 * ne déclenche aucun avertissement tant que sa décision d'enregistrement n'a
 * pas changé dans la session en cours.
 *
 * Elle est dérivée, jamais mémorisée : on compare l'état saisi à l'état
 * enregistré, plutôt que de lever un drapeau « l'utilisateur a touché à la
 * case ». Un drapeau se désynchronise (cocher puis décocher laissait
 * l'avertissement à l'écran) et se perd au premier refactoring de la vue ;
 * une comparaison, non. C'est aussi pour ça que la règle vit dans une
 * fonction pure importée par le hook — la vue ne voit jamais la donnée brute
 * et n'a donc aucune condition à oublier (voir `hooks/useRecordingAdvice`).
 */

/** Ce qu'une demande décide en matière d'enregistrement — rien d'autre. */
export interface RecordingDecision {
    catalogueId: number | null;
    lentPhysicalBook: boolean;
    isDuplication: boolean;
}

/** La décision, plus ce que le livre possède déjà de son côté. */
export interface RecordingContext extends RecordingDecision {
    /** Le livre a déjà un fichier audio (`Book.audio_filepath`). */
    bookHasAudio: boolean;
}

/** Ce qu'il y a à dire à l'utilisateur — jamais construit si la porte est fermée. */
export interface RecordingAdvice {
    /** Un audio existe déjà : c'est peut-être une duplication qui s'ignore. */
    audioAlreadyExists: boolean;
    /** Autres demandes d'enregistrement actives pour ce livre (0 = aucune). */
    activeRecordingCount: number;
    /** L'auditeur de la première d'entre elles, cité en exemple. */
    otherAuditeurName: string | null;
}

/**
 * La décision d'enregistrement est-elle en train d'être prise ?
 *
 * - `saved === null` → formulaire de création : tout est à décider.
 * - sinon → seulement si la case « Enregistrement » est cochée ET que quelque
 *   chose de cette décision (le livre, ou l'un des deux types) diffère de ce
 *   qui est enregistré.
 *
 * Le statut de la demande n'entre pas dans la comparaison, volontairement :
 * passer une demande à « Terminé » ne rouvre pas la question de savoir s'il
 * fallait l'enregistrer, et le compte des autres demandes actives (qui exclut
 * déjà celle-ci) n'en dépend pas.
 */
export function recordingDecisionIsOpen(
    saved: RecordingDecision | null,
    current: RecordingDecision,
): boolean {
    // Une mise en garde sur l'enregistrement ne concerne que les demandes
    // d'enregistrement : décocher la case ne pose plus la question.
    if (!current.lentPhysicalBook) return false;
    if (!saved) return true;
    return (
        saved.lentPhysicalBook !== current.lentPhysicalBook ||
        saved.isDuplication !== current.isDuplication ||
        saved.catalogueId !== current.catalogueId
    );
}

/**
 * Construit l'avis, ou `null` s'il n'y a rien à dire — porte fermée, ou porte
 * ouverte mais ni audio existant ni demande concurrente. Renvoyer `null`
 * plutôt qu'un objet vide est ce qui permet à la vue de se contenter de
 * `{advice && …}` : il n'y a aucune autre condition à écrire, donc aucune à
 * supprimer par mégarde.
 */
export function buildRecordingAdvice(
    saved: RecordingDecision | null,
    current: RecordingContext,
    activeRecordings: { activeRecordingCount: number; otherAuditeurName: string | null } | null,
): RecordingAdvice | null {
    if (!recordingDecisionIsOpen(saved, current)) return null;

    const activeRecordingCount = activeRecordings?.activeRecordingCount ?? 0;
    if (!current.bookHasAudio && activeRecordingCount === 0) return null;

    return {
        audioAlreadyExists: current.bookHasAudio,
        activeRecordingCount,
        otherAuditeurName: activeRecordings?.otherAuditeurName ?? null,
    };
}
