import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Calendar, Plus, Trash2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AddBookFormBackend } from '@/admin/BookFormBackendBase';
import { useFormToast } from '@/hooks/useFormToast';
import { useInvalidField } from '@/hooks/useInvalidField';
import { useRecordingCheck } from '@/hooks/useRecordingCheck';
import { useUserActivityGuard } from '@/hooks/useUserActivityGuard';
import { UserActivityGuardDialog } from '@/components/ui/admin/UserActivityGuardDialog';
import { UserSearchCombobox } from '@/admin/UserSearchCombobox';
import { BookSearchCombobox } from '@/admin/BookSearchCombobox';
import {
    sanitizeDecimal,
    formatEuro2,
    type User,
    type Book,
    type MediaFormat,
} from '@/admin/OrderFormBackendBase';
import { STATUS } from '@/lib/statusSync';
import { costSuggestion } from '@/lib/pricing';

// N3 — required fields, visual top→bottom. Per-line media format fields are
// appended dynamically at validation time (one per open line).
const CREATE_FIELD_ORDER = ['aveugleId', 'deliveryMethod', 'lines'];

// ---------------------------------------------------------------------------
// Multi-book order creation (fan-out: one order is created per book)
// ---------------------------------------------------------------------------

type OrderLineType = 'DUPLICATION' | 'ENREGISTREMENT';

interface OrderBookLine {
    key: string;
    book: Book | null;
    type: OrderLineType;
    cost: string;
    mediaFormatId: number | null; // required per line at submit; null until chosen
}

let lineKeySeq = 0;
const makeLine = (cost: string): OrderBookLine => ({
    key: `line-${++lineKeySeq}-${Date.now()}`,
    book: null,
    type: 'DUPLICATION',
    cost,
    mediaFormatId: null,
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
export function AddOrderFormBackend({ onSuccess, initialClient }: { onSuccess?: (orderId: number) => void; initialClient?: User | null }) {
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toastError } = useFormToast();
    const { registerField, focusFirstInvalid } = useInvalidField();
    const { check: checkRecording, getFor: getRecordingFor } = useRecordingCheck();
    const {
        blocked: activityBlocked,
        role: activityRole,
        requireActive,
        resolveAndClose: closeActivityGuard,
    } = useUserActivityGuard();

    // Options
    const [mediaFormats, setMediaFormats] = useState<MediaFormat[]>([]);

    // Header (shared across every book)
    const [aveugleId, setAveugleId] = useState<number | null>(initialClient?.id ?? null);
    const [selectedUser, setSelectedUser] = useState<User | null>(initialClient ?? null);
    const [requestReceivedDate, setRequestReceivedDate] = useState<Date>(new Date());
    const [deliveryMethod, setDeliveryMethod] = useState<'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null>(null);
    const [billingStatus, setBillingStatus] = useState<'UNBILLED' | 'BILLED' | 'UNBILLABLE'>('UNBILLED');
    const [defaultCost, setDefaultCost] = useState('3.00');
    const [notes, setNotes] = useState('');

    // Book lines — each carries its own media format, seeded from the auditeur's
    // preference when known but always overridable per ouvrage.
    const [lines, setLines] = useState<OrderBookLine[]>([
        { ...makeLine('3.00'), mediaFormatId: initialClient?.preferredMediaFormatId ?? null },
    ]);

    // For each ENREGISTREMENT line with a book, look up whether the book already
    // has an active recording demande (drives the per-line warning + submit confirm).
    useEffect(() => {
        for (const l of lines) {
            if (l.type === 'ENREGISTREMENT' && l.book) {
                void checkRecording(l.book.id);
            }
        }
    }, [lines, checkRecording]);

    useEffect(() => {
        const fetchOptions = async () => {
            try {
                // Statuses aren't fetched: a line's statut is derived from its type
                // via the STATUS constants, not looked up by name.
                const formatsRes = await fetch('/api/media-formats');
                if (formatsRes.ok) setMediaFormats(await formatsRes.json());
            } catch (err) {
                console.error('Error fetching options:', err);
                setError('Échec du chargement des options du formulaire');
            }
        };
        fetchOptions();
    }, []);

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
        { ...makeLine(defaultCost), mediaFormatId: selectedUser?.preferredMediaFormatId ?? null },
    ]);

    // Picking a book also sets that line's tarif from the weight of its recording
    // (lib/pricing.ts). This is where adjustments go missing: ten ouvrages saisis
    // d'affilée, un seul coût recopié partout. Le champ « Coût » de la ligne reste
    // libre juste en dessous, et un livre au poids inconnu garde le coût en place.
    const selectBookForLine = (key: string, book: Book | null) => {
        const suggested = book ? costSuggestion(book.audioSizeKb) : null;
        updateLine(key, { book, ...(suggested ? { cost: suggested.value } : {}) });
    };
    const handleDefaultCostChange = (value: string) => {
        setDefaultCost(value);
        setLines(prev => prev.map(l => ({ ...l, cost: value })));
    };

    const dupCount = lines.filter(l => l.type === 'DUPLICATION').length;
    const recCount = lines.length - dupCount;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

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
            setError(msg);
            toastError(msg);
            focusFirstInvalid(fieldOrder, new Set(invalid));
            setIsLoading(false);
            return;
        }

        const books = lines.map(l => ({
            catalogueId: l.book!.id,
            isDuplication: l.type === 'DUPLICATION',
            lentPhysicalBook: l.type === 'ENREGISTREMENT',
            statusId: statusForType(l.type),
            mediaFormatId: l.mediaFormatId!,
            cost: l.cost || defaultCost,
        }));

        // Guard: warn before creating recording demande(s) for book(s) that already
        // have an active recording demande. One confirm covers all offending lines.
        const recordingLines = lines.filter((l) => l.type === 'ENREGISTREMENT' && l.book);
        const dupTitles: string[] = [];
        for (const l of recordingLines) {
            const r = await checkRecording(l.book!.id);
            if (r && r.activeRecordingCount > 0) dupTitles.push(l.book!.title);
        }
        if (dupTitles.length > 0) {
            const confirmed = window.confirm(
                `Une demande d’enregistrement active existe déjà pour : ${dupTitles.join(', ')}.\n\n` +
                `Voulez-vous vraiment créer ${dupTitles.length > 1 ? 'ces nouvelles demandes' : 'cette nouvelle demande'} d’enregistrement ?`
            );
            if (!confirmed) {
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
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <span className="text-xl mt-2">{msg}</span>,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });
                setError(msg);
                return;
            }

            const ids: number[] = data.orderIds || [];
            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">{ids.length} demande(s) créée(s){ids.length ? ` : #${ids.join(', #')}` : ''}</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });
            if (data.autoBill) {
                toast({
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Facture en brouillon créée</span>,
                    description: <span className="text-xl mt-2">Le seuil de paiement du client est atteint : une facture en brouillon (#{data.autoBill.billId}) regroupant {data.autoBill.orderCount} demande(s) a été créée.</span>,
                    className: "bg-blue-100 border-2 border-blue-500 text-blue-900 shadow-lg p-6"
                });
            }
            if (onSuccess && ids.length) onSuccess(ids[0]);
        } catch (err) {
            console.error('Batch submit error:', err);
            const msg = 'Échec de la création des demandes';
            setError(msg);
            toastError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-foreground">Créer une ou plusieurs demandes</CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-200">{error}</AlertDescription>
                    </Alert>
                )}

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
                        />
                    </div>

                    {/* Shared header fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Date de réception <span className="text-red-500">*</span></label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button type="button" variant="outline"
                                            className="w-full justify-start text-left bg-field border-border text-foreground hover:bg-muted">
                                        <Calendar className="mr-2 h-4 w-4" />
                                        {format(requestReceivedDate, 'PPP', { locale: fr })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-card border-border">
                                    <CalendarComponent mode="single" selected={requestReceivedDate}
                                                       onSelect={(d) => d && setRequestReceivedDate(d)} initialFocus className="bg-card text-foreground" />
                                </PopoverContent>
                            </Popover>
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

                    {/* Default cost */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Coût par défaut</label>
                        <div className="relative">
                            <Input type="text" inputMode="decimal" value={defaultCost}
                                   onChange={(e) => handleDefaultCostChange(sanitizeDecimal(e.target.value))}
                                   onBlur={() => handleDefaultCostChange(formatEuro2(defaultCost))}
                                   className="bg-card border-border text-foreground pr-8" placeholder="0.00" />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">€</span>
                        </div>
                    </div>

                    {/* Book lines */}
                    <div className="space-y-3 pt-4 border-t border-border">
                        <div className="flex items-center justify-between">
                            <h3 ref={registerField('lines')} tabIndex={-1} className="text-sm font-medium text-muted-foreground uppercase tracking-wide outline-none">Ouvrages ({lines.length})</h3>
                            <span className="text-xs text-muted-foreground">{dupCount} duplication(s) · {recCount} enregistrement(s)</span>
                        </div>

                        {lines.map((line, idx) => (
                            <div key={line.key} className="bg-card/50 p-4 rounded-lg border border-border space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">Ouvrage {idx + 1}</span>
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
                                        />
                                    </div>
                                    <CreateBookDialog onCreated={(b) => selectBookForLine(line.key, b)} />
                                </div>

                                {/* Type — per book */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => updateLine(line.key, { type: 'ENREGISTREMENT' })}
                                            className={`p-3 rounded-md border text-sm font-medium transition-colors ${line.type === 'ENREGISTREMENT' ? 'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-700/30 dark:border-amber-600 dark:text-amber-200' : 'bg-field border-border text-foreground hover:bg-muted'}`}>
                                        Enregistrement
                                    </button>
                                    <button type="button" onClick={() => updateLine(line.key, { type: 'DUPLICATION' })}
                                            className={`p-3 rounded-md border text-sm font-medium transition-colors ${line.type === 'DUPLICATION' ? 'bg-green-100 border-green-400 text-green-900 dark:bg-green-700/30 dark:border-green-600 dark:text-green-200' : 'bg-field border-border text-foreground hover:bg-muted'}`}>
                                        Duplication
                                    </button>
                                </div>

                                {/* #2 — audio already exists for this book */}
                                {line.type === 'ENREGISTREMENT' && line.book?.audio_filepath && (
                                    <p className="text-sm text-amber-700 dark:text-amber-400">
                                        Attention : un enregistrement audio existe déjà pour cet ouvrage.
                                        Vérifiez qu&apos;un nouvel enregistrement est réellement nécessaire — il
                                        s&apos;agit peut-être plutôt d&apos;une duplication.
                                    </p>
                                )}
                                {/* Active recording demande already exists for this book */}
                                {line.type === 'ENREGISTREMENT' && line.book &&
                                    (getRecordingFor(line.book.id)?.activeRecordingCount ?? 0) > 0 && (
                                    <p className="text-sm text-amber-700 dark:text-amber-400">
                                        Il existe déjà une demande d&apos;enregistrement active pour cet
                                        ouvrage{getRecordingFor(line.book.id)!.orders[0]?.aveugle?.name
                                            ? ` (ex. ${getRecordingFor(line.book.id)!.orders[0].aveugle!.name})`
                                            : ''}. Êtes-vous sûr de vouloir en créer une nouvelle&nbsp;?
                                    </p>
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
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Coût</label>
                                        <div className="relative">
                                            <Input type="text" inputMode="decimal" value={line.cost}
                                                   onChange={(e) => updateLine(line.key, { cost: sanitizeDecimal(e.target.value) })}
                                                   onBlur={() => updateLine(line.key, { cost: formatEuro2(line.cost) })}
                                                   className="bg-card border-border text-foreground h-9 pr-8" placeholder={defaultCost} />
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
                                </div>
                            </div>
                        ))}

                        <Button type="button" variant="outline" onClick={addLine}
                                className="w-full bg-field border-border text-foreground hover:bg-muted">
                            <Plus className="h-4 w-4 mr-2" /> Ajouter un ouvrage
                        </Button>
                    </div>

                    {/* Shared notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Notes (communes)</label>
                        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                                  className="bg-card border-border text-foreground min-h-[100px]"
                                  placeholder="Ajouter des notes supplémentaires..." />
                    </div>

                    <div className="rounded-md bg-card/50 border border-border p-3 text-sm text-foreground">
                        {lines.length === 1
                            ? '1 ouvrage → 1 demande sera créée. Le numéro sera attribué lors de la soumission.'
                            : `${lines.length} ouvrages → ${lines.length} demandes seront créées. Les numéros seront attribués lors de la soumission.`}
                    </div>

                    <Button type="submit" disabled={isLoading}
                            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
                        {isLoading ? 'Création en cours...' : `Créer ${lines.length} ${lines.length === 1 ? 'demande' : 'demandes'}`}
                    </Button>
                </form>
            </CardContent>
        </Card>
        <UserActivityGuardDialog
            blocked={activityBlocked}
            role={activityRole}
            onClose={closeActivityGuard}
        />
        </>
    );
}
