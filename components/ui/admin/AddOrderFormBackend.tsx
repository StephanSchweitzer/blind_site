import React, { useState, useRef } from 'react';
import { useReferenceData } from '@/components/admin/ReferenceDataProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { DatePickerField, todayLocal, toDayString } from '@/components/ui/admin/DatePickerField';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AddBookFormBackend } from '@/admin/BookFormBackendBase';
import { useFormToast } from '@/hooks/useFormToast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useInvalidField } from '@/hooks/useInvalidField';
import { useRecordingAdvice } from '@/hooks/useRecordingAdvice';
import { RecordingAdviceNotice, recordingConflictConfirmText } from '@/components/ui/admin/RecordingAdviceNotice';
import type { RecordingContext } from '@/lib/orders/recordingAdvice';
import { useUserActivityGuard } from '@/hooks/useUserActivityGuard';
import { UserActivityGuardDialog } from '@/components/ui/admin/UserActivityGuardDialog';
import { BillPrintNoticeDialog } from '@/components/ui/admin/BillPrintNoticeDialog';
import { UserSearchCombobox } from '@/admin/UserSearchCombobox';
import { BookSearchCombobox } from '@/admin/BookSearchCombobox';
import {
    sanitizeDecimal,
    formatEuro2,
    type User,
    type Book,
} from '@/admin/OrderFormBackendBase';
import { STATUS } from '@/lib/statusSync';
import { costSuggestion } from '@/lib/pricing';
import { PagePricingFields } from '@/admin/PagePricingFields';
import {
    type PagePricingForm,
    emptyPagePricing,
    pagePricingToPayload,
    pagePricingError,
} from '@/lib/orders/pagePricingForm';
import type { OrderLineType, OrderTypeReason } from '@/lib/orders/orderTypeSuggestion';

// N3 — required fields, visual top→bottom. Per-line media format fields are
// appended dynamically at validation time (one per open line).
const CREATE_FIELD_ORDER = ['aveugleId', 'deliveryMethod', 'lines'];

// ---------------------------------------------------------------------------
// Multi-book order creation (fan-out: one order is created per book)
// ---------------------------------------------------------------------------

interface OrderBookLine {
    key: string;
    book: Book | null;
    type: OrderLineType;
    /**
     * Pourquoi `type` a été choisi à la place de l'utilisateur, au choix du livre
     * (lib/orders/orderTypeSuggestion.ts). `null` dès qu'il clique lui-même un
     * type : la note d'explication n'a alors plus lieu d'être.
     */
    typeReason: OrderTypeReason | null;
    cost: string;
    /**
     * Seulement pour un enregistrement : une duplication n'a pas de lecture à
     * compter. Conservée en mémoire quand la ligne passe en duplication (masquée,
     * jamais envoyée), pour que la saisie revienne si on repasse en enregistrement.
     */
    pagePricing: PagePricingForm;
    mediaFormatId: number | null; // required per line at submit; null until chosen
    /**
     * Duplication déjà faite et envoyée pendant la saisie : la ligne naît
     * « Terminé », à `closureDate`. Seulement si le livre a déjà son audio (voir
     * canCloseNow) — une duplication qui attend un enregistrement n'a rien à
     * envoyer. Comme la tarification à la page, gardée en mémoire mais ignorée à
     * l'envoi quand la ligne cesse d'y avoir droit.
     */
    closeNow: boolean;
    closureDate: Date | null;
}

const canCloseNow = (l: OrderBookLine): boolean =>
    l.type === 'DUPLICATION' && Boolean(l.book?.audio_filepath);
const closesNow = (l: OrderBookLine): boolean => l.closeNow && canCloseNow(l);

let lineKeySeq = 0;
const makeLine = (cost: string): OrderBookLine => ({
    key: `line-${++lineKeySeq}-${Date.now()}`,
    book: null,
    // « Enregistrement » tant qu'aucun livre n'est choisi : c'est le cas d'un
    // livre inconnu du corpus. Choisir le livre corrige ensuite s'il y a lieu.
    type: 'ENREGISTREMENT',
    typeReason: null,
    cost,
    pagePricing: emptyPagePricing(),
    mediaFormatId: null,
    closeNow: false,
    closureDate: null,
});

// Cap a displayed string so long titles don't blow out the layout
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);

// Create-a-new-book modal that returns the created book to the calling line
function CreateBookDialog({ onCreated }: { onCreated: (book: Book) => void }) {
    const [open, setOpen] = useState(false);

    const handleSuccess = async (bookId: number) => {
        try {
            const res = await fetch(`/api/books/${bookId}`);
            if (res.ok) {
                const book = await res.json();
                onCreated({ id: book.id, title: book.title, author: book.author });
            } else {
                onCreated({ id: bookId, title: 'Nouveau livre', author: '' });
            }
        } catch {
            onCreated({ id: bookId, title: 'Nouveau livre', author: '' });
        }
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline"
                        className="bg-field border-border text-foreground hover:bg-muted whitespace-nowrap">
                    <Plus className="h-4 w-4 mr-2" /> Nouveau livre
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="text-foreground">Créer un nouveau livre</DialogTitle>
                </DialogHeader>
                <AddBookFormBackend onSuccess={handleSuccess} />
            </DialogContent>
        </Dialog>
    );
}

// Add Order Form — multiple books, one order created per book
export function AddOrderFormBackend({
    onSuccess,
    initialClient,
    initialBook,
}: {
    onSuccess?: (orderId: number) => void;
    initialClient?: User | null;
    /**
     * Pré-remplit l'ouvrage de la première ligne. Utilisé par
     * MissingDemandeNotice, qui ouvre ce formulaire depuis la fenêtre audio d'un
     * livre rattaché à aucune demande : le livre est le seul élément que
     * l'appelant connaisse avec certitude. L'auditeur et le type de ligne
     * restent à saisir — ce sont des décisions, pas des déductions.
     */
    initialBook?: Book | null;
}) {
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const { toastError, toastFailure } = useFormToast();
    const confirm = useConfirm();
    const { registerField, focusFirstInvalid } = useInvalidField();
    const {
        blocked: activityBlocked,
        role: activityRole,
        requireActive,
        resolveAndClose: closeActivityGuard,
    } = useUserActivityGuard();

    // Options
    const { mediaFormats } = useReferenceData();

    // Le lot vient de faire franchir le seuil à un brouillon : l'avis d'émission
    // retient la fermeture du modal, sinon la boîte partirait avec lui.
    const [autoBill, setAutoBill] = useState<{ billId: number; total: string } | null>(null);
    const pendingOrderIdRef = useRef<number | null>(null);

    const acknowledgeAutoBill = () => {
        const orderId = pendingOrderIdRef.current;
        pendingOrderIdRef.current = null;
        setAutoBill(null);
        if (onSuccess && orderId != null) onSuccess(orderId);
    };

    // Header (shared across every book)
    const [aveugleId, setAveugleId] = useState<number | null>(initialClient?.id ?? null);
    const [selectedUser, setSelectedUser] = useState<User | null>(initialClient ?? null);
    const [requestReceivedDate, setRequestReceivedDate] = useState<Date>(new Date());
    const [deliveryMethod, setDeliveryMethod] = useState<'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null>(null);
    const [billingStatus, setBillingStatus] = useState<'UNBILLED' | 'BILLED' | 'UNBILLABLE'>('UNBILLED');
    const [notes, setNotes] = useState('');

    // Book lines — each carries its own media format and cost, seeded from the
    // auditeur's preference / the book's tarif conseillé when known but always
    // overridable per ouvrage. Cost is a per-demande value, not shared metadata.
    const [lines, setLines] = useState<OrderBookLine[]>([
        {
            ...makeLine(
                // Même tarif conseillé que la sélection manuelle d'un ouvrage
                // (voir selectBookForLine) : sans ça une demande pré-remplie
                // partirait au plancher pour un enregistrement lourd.
                costSuggestion(initialBook?.audioSizeKb)?.value ?? '3.00',
            ),
            book: initialBook ?? null,
            mediaFormatId: initialClient?.preferredMediaFormatId ?? null,
        },
    ]);

    // Une décision d'enregistrement par ligne. `saved` est absent : ici tout est
    // en train d'être décidé, donc la porte de lib/orders/recordingAdvice.ts est
    // grande ouverte — c'est le formulaire de modification qu'elle referme, pas
    // celui-ci. Le hook interroge de lui-même, ligne par ligne.
    const recordingLines = React.useMemo<RecordingContext[]>(
        () =>
            lines.map((l) => ({
                catalogueId: l.book?.id ?? null,
                lentPhysicalBook: l.type === 'ENREGISTREMENT',
                isDuplication: l.type === 'DUPLICATION',
                bookHasAudio: Boolean(l.book?.audio_filepath),
            })),
        [lines]
    );
    const {
        adviceFor: recordingAdviceFor,
        conflicts: recordingConflicts,
        recordingUnderWayFor,
        suggestTypeFor,
    } = useRecordingAdvice({
        current: recordingLines,
    });

    const handleUserSelect = async (user: User) => {
        // Vetoed selections return false so the picker stays open.
        const proceed = await requireActive(user.id, 'aveugle');
        if (!proceed) return false;

        setSelectedUser(user);
        setAveugleId(user.id);
        // Seed every line still without a format from the person's preference —
        // lines the user already set explicitly are left alone.
        if (user.preferredMediaFormatId != null) {
            setLines((prev) => prev.map((l) => (l.mediaFormatId == null ? { ...l, mediaFormatId: user.preferredMediaFormatId! } : l)));
        }
        // Seed delivery method too (NON_APPLICABLE is no longer a valid option).
        if (user.preferredDeliveryMethod === 'RETRAIT' || user.preferredDeliveryMethod === 'ENVOI') {
            setDeliveryMethod((prev) => (prev == null ? user.preferredDeliveryMethod! : prev));
        }
    };

    // Derive a line's status from its type (same rule as the single-order form).
    // A duplication is « À faire »: it never goes to a lecteur, so the recording
    // statuses say nothing true about it — « En cours », which this used to pick,
    // read as though the book were being recorded. See guardDuplicationStatus.
    const statusForType = (type: OrderLineType): number =>
        type === 'DUPLICATION' ? STATUS.A_FAIRE : STATUS.ATTENTE;

    const updateLine = (key: string, patch: Partial<OrderBookLine>) =>
        setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
    const removeLine = (key: string) =>
        setLines(prev => (prev.length > 1 ? prev.filter(l => l.key !== key) : prev));
    const addLine = () => setLines(prev => [
        ...prev,
        { ...makeLine('3.00'), mediaFormatId: selectedUser?.preferredMediaFormatId ?? null },
    ]);

    // Picking a book also sets that line's tarif from the weight of its recording
    // (lib/pricing.ts). This is where adjustments go missing: ten ouvrages saisis
    // d'affilée, un seul coût recopié partout. Le champ « Coût » de la ligne reste
    // libre juste en dessous, et un livre au poids inconnu garde le coût en place.
    //
    // Le type de la ligne suit le livre de la même façon (lib/orders/orderTypeSuggestion.ts).
    // On l'attend AVANT de remplir la ligne : le sélecteur garde sa liste ouverte,
    // avec un indicateur sur la ligne choisie, tant que ce callback n'a pas rendu
    // la main — la ligne n'apparaît donc jamais avec un type qui change sous les yeux.
    const selectBookForLine = async (key: string, book: Book | null) => {
        const suggested = book ? costSuggestion(book.audioSizeKb) : null;
        const typeSuggestion = book
            ? await suggestTypeFor(book.id, Boolean(book.audio_filepath))
            : null;
        updateLine(key, {
            book,
            // Clore une demande la facture : une case cochée pour un autre livre ne
            // doit pas passer en silence sur celui-ci.
            closeNow: false,
            ...(suggested ? { cost: suggested.value } : {}),
            ...(typeSuggestion
                ? {
                    type: typeSuggestion.type,
                    typeReason: typeSuggestion.reason,
                    // La tarification à la page n'est PAS remise à zéro, même pour une
                    // duplication : choisir un livre ne doit pas effacer ce qui a été
                    // saisi. Elle reste dans la ligne, masquée, et l'envoi l'ignore
                    // tant que la ligne est une duplication (voir handleSubmit).
                }
                : {}),
        });
    };

    // Counted over the lines that carry a book only. A fresh line has a type but
    // no book, so counting every line announced « 14 demandes » / « Créer 14
    // demandes » over 11 books chosen — three forgotten empty lines — and the
    // submit then refused the lot.
    const filledLines = lines.filter(l => l.book);
    const filledCount = filledLines.length;
    const emptyCount = lines.length - filledCount;
    const closedCount = filledLines.filter(closesNow).length;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // N3 — collect failing required fields in visual order. Media format is
        // required per line now, so each open line contributes its own field name.
        const invalid: string[] = [];
        if (!aveugleId) invalid.push('aveugleId');
        if (!deliveryMethod) invalid.push('deliveryMethod');
        const firstLineMissingBook = lines.findIndex((l) => !l.book);
        if (lines.length === 0 || firstLineMissingBook !== -1) invalid.push('lines');
        for (const l of lines) {
            if (l.mediaFormatId == null) invalid.push(`mediaFormatId-${l.key}`);
        }

        if (invalid.length) {
            let msg: string;
            const fieldOrder = [...CREATE_FIELD_ORDER, ...lines.map((l) => `mediaFormatId-${l.key}`)];
            const firstName = fieldOrder.find((n) => invalid.includes(n)) ?? invalid[0];
            if (firstName === 'aveugleId') msg = 'Veuillez sélectionner un auditeur';
            else if (firstName === 'deliveryMethod') msg = 'Veuillez sélectionner une méthode de livraison';
            else if (firstName === 'lines') msg = lines.length === 0 ? 'Ajoutez au moins un ouvrage' : `La ligne ${firstLineMissingBook + 1} doit comporter un livre`;
            else {
                const idx = lines.findIndex((l) => `mediaFormatId-${l.key}` === firstName);
                msg = `La ligne ${idx + 1} doit avoir un format média`;
            }
            toastError(msg);
            focusFirstInvalid(fieldOrder, new Set(invalid));
            setIsLoading(false);
            return;
        }

        const pageErrorLine = lines.findIndex(
            (l) => l.type === 'ENREGISTREMENT' && pagePricingError(l.pagePricing) !== null
        );
        if (pageErrorLine !== -1) {
            const msg = `Ligne ${pageErrorLine + 1} : ${pagePricingError(lines[pageErrorLine].pagePricing)}`;
            toastError(msg);
            setIsLoading(false);
            return;
        }

        const closureErrorLine = lines.findIndex(
            (l) => closesNow(l) && (!l.closureDate || toDayString(l.closureDate) < toDayString(requestReceivedDate))
        );
        if (closureErrorLine !== -1) {
            const msg = lines[closureErrorLine].closureDate
                ? `Ligne ${closureErrorLine + 1} : la date de clôture ne peut pas précéder la date de réception`
                : `Ligne ${closureErrorLine + 1} : indiquez la date de clôture`;
            toastError(msg);
            setIsLoading(false);
            return;
        }

        const books = lines.map(l => ({
            catalogueId: l.book!.id,
            isDuplication: l.type === 'DUPLICATION',
            lentPhysicalBook: l.type === 'ENREGISTREMENT',
            statusId: closesNow(l) ? STATUS.TERMINE : statusForType(l.type),
            ...(closesNow(l) ? { closureDate: l.closureDate } : {}),
            mediaFormatId: l.mediaFormatId!,
            cost: l.cost || '3.00',
            // Le coût ci-dessus est ignoré du serveur quand les pages sont renseignées.
            ...(l.type === 'ENREGISTREMENT' && l.pagePricing.pageBased ? pagePricingToPayload(l.pagePricing) : {}),
        }));

        // Warn before creating recording demande(s) for book(s) that already have
        // an active one. One confirm covers all offending lines.
        const conflicts = await recordingConflicts();
        if (conflicts.length > 0) {
            const titles = conflicts.map(
                (c) => lines.find((l) => l.book?.id === c.catalogueId)?.book?.title ?? ''
            );
            if (!(await confirm({
                title: 'Une demande d’enregistrement est déjà en cours',
                description: recordingConflictConfirmText(conflicts, titles),
            }))) {
                setIsLoading(false);
                return;
            }
        }

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aveugleId, requestReceivedDate, deliveryMethod, billingStatus, notes, books }),
            });
            const data = await res.json();

            if (!res.ok) {
                const msg = data?.message || 'Échec de la création des demandes';
                toast({
                    variant: "destructive",
                    title: "Création impossible",
                    description: msg
                });
                return;
            }

            const ids: number[] = data.orderIds || [];
            toast({
                title: ids.length > 1 ? `${ids.length} demandes créées` : 'Demande créée',
                description: ids.length ? `#${ids.join(', #')}` : undefined,
                className: "bg-green-100 border-green-500 text-green-900"
            });
            // Une facture vient de partir en émission : le dire dans un toast, qui
            // s'efface tout seul, c'est risquer que personne n'imprime jamais le
            // document. On retient donc onSuccess (qui ferme le modal, et donc
            // démonterait la boîte) le temps que l'avis soit acquitté.
            if (data.autoBill) {
                setAutoBill({
                    billId: data.autoBill.billId,
                    total: formatEuro2(String(data.autoBill.total)),
                });
                pendingOrderIdRef.current = ids.length ? ids[0] : null;
                return;
            }
            if (onSuccess && ids.length) onSuccess(ids[0]);
        } catch (err) {
            console.error('Batch submit error:', err);
            toastFailure(err, 'Création impossible');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
        <div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Auditeur */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Auditeur <span className="text-red-500">*</span>
                        </label>
                        <UserSearchCombobox<User>
                            value={selectedUser}
                            onSelect={handleUserSelect}
                            triggerRef={registerField('aveugleId')}
                            viewHref={(user) => `/admin/users/dossier/${user.id}`}
                        />
                    </div>

                    {/* Shared header fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Date de réception <span className="text-red-500">*</span></label>
                            <DatePickerField
                                value={requestReceivedDate}
                                onChange={(d) => d && setRequestReceivedDate(d)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Méthode de livraison <span className="text-red-500">*</span></label>
                            <Select value={deliveryMethod || ''} onValueChange={(v) => setDeliveryMethod(v as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE')}>
                                <SelectTrigger ref={registerField('deliveryMethod')} className="bg-field border-border text-foreground"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="RETRAIT" className="text-foreground">Retrait</SelectItem>
                                    <SelectItem value="ENVOI" className="text-foreground">Envoi</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Book lines */}
                    <div className="space-y-3 pt-4 border-t border-border">
                        {/* Le nombre de lignes se lit sur le bouton « Créer N demandes » :
                            ni compteur ici, ni récapitulatif en bas. */}
                        <h3 ref={registerField('lines')} tabIndex={-1} className="text-sm font-medium text-muted-foreground uppercase tracking-wide outline-none">Ouvrages</h3>

                        {lines.map((line, idx) => (
                            <div key={line.key} className="bg-card/50 p-4 rounded-lg border border-border space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">{lines.length > 1 ? `Ouvrage ${idx + 1}` : 'Ouvrage'}</span>
                                    {lines.length > 1 && (
                                        <button type="button" onClick={() => removeLine(line.key)}
                                                className="text-muted-foreground hover:text-red-400 transition-colors" aria-label="Retirer l'ouvrage">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <div className="flex-1 min-w-0">
                                        <BookSearchCombobox<Book>
                                            value={line.book}
                                            onSelect={(b) => selectBookForLine(line.key, b)}
                                            placeholder="Rechercher un livre existant ..."
                                            renderValue={(b) => clip(`${b.title} — ${b.author}`)}
                                            viewHref={(b) => `/admin/books?book=${b.id}`}
                                        />
                                    </div>
                                    <CreateBookDialog onCreated={(b) => void selectBookForLine(line.key, b)} />
                                </div>

                                {/* Type — per book. Proposé au choix du livre ; un clic ici l'emporte. */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => updateLine(line.key, { type: 'ENREGISTREMENT', typeReason: null })}
                                            className={`p-3 rounded-md border text-sm font-medium transition-colors ${line.type === 'ENREGISTREMENT' ? 'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-700/30 dark:border-amber-600 dark:text-amber-200' : 'bg-field border-border text-foreground hover:bg-muted'}`}>
                                        Enregistrement
                                    </button>
                                    <button type="button" onClick={() => updateLine(line.key, { type: 'DUPLICATION', typeReason: null })}
                                            className={`p-3 rounded-md border text-sm font-medium transition-colors ${line.type === 'DUPLICATION' ? 'bg-green-100 border-green-400 text-green-900 dark:bg-green-700/30 dark:border-green-600 dark:text-green-200' : 'bg-field border-border text-foreground hover:bg-muted'}`}>
                                        Duplication
                                    </button>
                                </div>

                                {/* Pourquoi « Duplication » a été choisi à sa place. Rien pour
                                    « Enregistrement » : c'est le type de départ, l'annoncer
                                    à chaque livre ne serait que du bruit. */}
                                {line.type === 'DUPLICATION' && line.typeReason === 'audio' && (
                                    <p className="text-sm text-muted-foreground">
                                        Un fichier audio existe déjà pour ce livre : « Duplication » a été
                                        choisi automatiquement. Choisissez « Enregistrement » s&apos;il faut
                                        le faire relire.
                                    </p>
                                )}
                                {line.type === 'DUPLICATION' && line.typeReason === 'recording-under-way' && (
                                    <p className="text-sm text-muted-foreground">
                                        Ce livre est déjà en cours d&apos;enregistrement : « Duplication » a été
                                        choisi automatiquement. Elle pourra être faite au retour de
                                        l&apos;enregistrement.
                                    </p>
                                )}
                                {/* Le cas que l'ancien défaut produisait sans bruit : une duplication
                                    d'un livre qui n'a rien à copier et que personne n'enregistre.
                                    Seulement une fois la vérification revenue (`false`, pas `null`). */}
                                {line.type === 'DUPLICATION' &&
                                    line.book &&
                                    !line.book.audio_filepath &&
                                    recordingUnderWayFor(line.book.id) === false && (
                                    <p className="text-sm text-amber-700 dark:text-amber-400">
                                        Ce livre n&apos;a pas encore de fichier audio et aucun enregistrement
                                        n&apos;est en cours : il n&apos;y a rien à dupliquer. S&apos;il doit être
                                        lu, choisissez « Enregistrement ».
                                    </p>
                                )}

                                {/* Duplication faite sur-le-champ : la clore ici évite de devoir
                                    rouvrir sa fenêtre de modification juste après pour lui donner sa date. Absente quand le
                                    livre n'a pas encore d'audio — il n'y a rien à envoyer. */}
                                {canCloseNow(line) && (
                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            id={`close-${line.key}`}
                                            checked={line.closeNow}
                                            onCheckedChange={(checked) => updateLine(line.key, {
                                                closeNow: checked === true,
                                                closureDate: line.closureDate ?? todayLocal(),
                                            })}
                                            className="mt-0.5"
                                        />
                                        <div className="space-y-2 min-w-0">
                                            <label htmlFor={`close-${line.key}`} className="text-sm font-medium text-foreground cursor-pointer">
                                                Déjà envoyée à l&apos;auditeur — clôturer la demande
                                            </label>
                                            {line.closeNow && (
                                                <>
                                                    <div className="space-y-1">
                                                        <span className="text-xs text-muted-foreground">Date de clôture (envoi à l&apos;auditeur)</span>
                                                        <DatePickerField
                                                            value={line.closureDate}
                                                            // Champ obligatoire : recliquer le jour choisi ne le vide pas.
                                                            onChange={(d) => d && updateLine(line.key, { closureDate: d })}
                                                        />
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {billingStatus === 'UNBILLABLE'
                                                            ? 'La demande sera créée « Terminé ».'
                                                            : 'La demande sera créée « Terminé » et ajoutée au brouillon de facture de l’auditeur.'}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* #2 — audio déjà présent / demande d'enregistrement concurrente */}
                                <RecordingAdviceNotice advice={recordingAdviceFor(recordingLines[idx])} />

                                {/* Tarification à la page — un enregistrement seulement */}
                                {line.type === 'ENREGISTREMENT' && (
                                    <PagePricingFields
                                        compact
                                        value={line.pagePricing}
                                        onChange={(pagePricing) => updateLine(line.key, { pagePricing })}
                                    />
                                )}

                                {/* Per-ouvrage format — required per line, seeded from the auditeur's préférence */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Format média <span className="text-red-500">*</span></label>
                                        <Select value={line.mediaFormatId?.toString() || ''}
                                                onValueChange={(v) => updateLine(line.key, { mediaFormatId: v ? parseInt(v) : null })}>
                                            <SelectTrigger ref={registerField(`mediaFormatId-${line.key}`)} className="bg-card border-border text-foreground h-9"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                                            <SelectContent className="bg-card border-border max-h-[240px] overflow-y-auto">
                                                {mediaFormats.map((f) => (
                                                    <SelectItem key={f.id} value={f.id.toString()} className="text-foreground">{f.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {!(line.type === 'ENREGISTREMENT' && line.pagePricing.pageBased) && (
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Coût</label>
                                        <div className="relative">
                                            <Input type="text" inputMode="decimal" value={line.cost}
                                                   onChange={(e) => updateLine(line.key, { cost: sanitizeDecimal(e.target.value) })}
                                                   onBlur={() => updateLine(line.key, { cost: formatEuro2(line.cost) })}
                                                   className="bg-card border-border text-foreground h-9 pr-8" placeholder="0.00" />
                                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">€</span>
                                        </div>
                                        {(() => {
                                            const tarif = costSuggestion(line.book?.audioSizeKb);
                                            if (!tarif) return null;
                                            const differs = formatEuro2(line.cost) !== tarif.value;
                                            return (
                                                <p className="text-xs text-muted-foreground">
                                                    Conseillé : {tarif.value} € ({tarif.label})
                                                    {differs && (
                                                        <button
                                                            type="button"
                                                            onClick={() => updateLine(line.key, { cost: tarif.value })}
                                                            className="ml-2 font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                                                        >
                                                            Appliquer
                                                        </button>
                                                    )}
                                                </p>
                                            );
                                        })()}
                                    </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        <Button type="button" variant="outline" onClick={addLine}
                                className="w-full bg-field border-border text-foreground hover:bg-muted">
                            <Plus className="h-4 w-4 mr-2" /> Ajouter un ouvrage
                        </Button>
                    </div>

                    {/* Facturation — rarement changée : sous les ouvrages, avec les notes,
                        plutôt qu'en troisième case d'une rangée de deux. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">État de facturation</label>
                            <Select value={billingStatus} onValueChange={(v) => setBillingStatus(v as 'UNBILLED' | 'BILLED' | 'UNBILLABLE')}>
                                <SelectTrigger className="bg-field border-border text-foreground"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="UNBILLED" className="text-foreground">Non facturé</SelectItem>
                                    <SelectItem value="UNBILLABLE" className="text-foreground">Non facturable</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Shared notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Notes (communes)</label>
                        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                                  className="bg-card border-border text-foreground min-h-[100px]"
                                  />
                    </div>

                    {/* Seulement ce que le bouton ne dit pas : les duplications closes
                        d'office, et les lignes encore sans livre — pas sur la seule
                        ligne d'un formulaire qu'on vient d'ouvrir, que le bouton
                        signalera s'il le faut. */}
                    {(closedCount > 0 || (emptyCount > 0 && lines.length > 1)) && (
                        <div className="rounded-md bg-card/50 border border-border p-3 text-sm text-foreground space-y-1">
                            {closedCount > 0 && (
                                <p>
                                    {closedCount === 1
                                        ? '1 duplication sera créée « Terminé »'
                                        : `${closedCount} duplications seront créées « Terminé »`}
                                    {billingStatus === 'UNBILLABLE'
                                        ? '.'
                                        : closedCount === 1 ? ' et facturée à l’auditeur.' : ' et facturées à l’auditeur.'}
                                </p>
                            )}
                            {emptyCount > 0 && lines.length > 1 && (
                                <p className="text-amber-700 dark:text-amber-300">
                                    {emptyCount === 1
                                        ? '1 ligne sans livre : choisissez un livre ou retirez-la avant de valider.'
                                        : `${emptyCount} lignes sans livre : choisissez un livre ou retirez-les avant de valider.`}
                                </p>
                            )}
                        </div>
                    )}

                    <Button type="submit" disabled={isLoading}
                            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
                        {isLoading
                            ? 'Création en cours...'
                            : filledCount === 0
                                ? 'Créer la demande'
                                : `Créer ${filledCount} ${filledCount === 1 ? 'demande' : 'demandes'}`}
                    </Button>
                </form>
            </div>
        <UserActivityGuardDialog
            blocked={activityBlocked}
            role={activityRole}
            onClose={closeActivityGuard}
        />
        <BillPrintNoticeDialog
            notice={
                autoBill && {
                    billId: autoBill.billId,
                    title: `Facture #${autoBill.billId} émise`,
                    description: (
                        <>
                            Le seuil de facturation du client est atteint : la facture #{autoBill.billId}
                            vient d&apos;être émise (total : {autoBill.total} €).
                        </>
                    ),
                    footnote: (
                        <>
                            Elle est à imprimer et à envoyer au client. Rien n&apos;est perdu si vous fermez :
                            elle vous attend dans les factures, au statut « Émise ».
                        </>
                    ),
                }
            }
            onClose={acknowledgeAutoBill}
        />
        </>
    );
}
