import React, { useState, useEffect } from 'react';
import { useReferenceData } from '@/components/admin/ReferenceDataProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertCircle, Calendar, ExternalLink } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Link from 'next/link';
import { getBillingStatusLabel } from '@/lib/billing-enums';
import { DELIVERY_METHOD_VALUES, getDeliveryMethodLabel } from '@/lib/user-enums';
import { isLegacyValue } from '@/lib/select-options';
import type { BillingStatus } from '@prisma/client';
import { useFormToast } from '@/hooks/useFormToast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useInvalidField } from '@/hooks/useInvalidField';
import { useRecordingAdvice } from '@/hooks/useRecordingAdvice';
import { RecordingAdviceNotice, recordingConflictConfirmText } from '@/components/ui/admin/RecordingAdviceNotice';
import type { RecordingContext, RecordingDecision } from '@/lib/orders/recordingAdvice';
import { useUserActivityGuard } from '@/hooks/useUserActivityGuard';
import { UserActivityGuardDialog } from '@/components/ui/admin/UserActivityGuardDialog';
import { MailingLabelButton } from '@/components/ui/admin/MailingLabelButton';

import { UserSearchCombobox } from '@/admin/UserSearchCombobox';
import { BookSearchCombobox } from '@/admin/BookSearchCombobox';
import { BookAudioButton } from '@/admin/BookAudioButton';
import { BookUsageLinks } from '@/admin/BookUsageLinks';
import { getUserDisplayName } from '@/lib/users/displayName';
// Le statut n'est plus choisi dans un menu : deriveOrderStatus le tire de la date
// de clôture et de l'attribution, comme l'attribution tire le sien de ses dates.
// Avant, c'était l'inverse : on choisissait « Terminé » et la date se remplissait.
import { STATUS, deriveOrderStatus } from '@/lib/statusSync';
import { costSuggestion } from '@/lib/pricing';
import { parisDate, parisDateDisplay } from '@/lib/paris-day';
import { PagePricingFields } from '@/admin/PagePricingFields';
import { type PagePricingForm, emptyPagePricing, pagePricingError } from '@/lib/orders/pagePricingForm';

// N3 — required fields, visual top→bottom.
const EDIT_FIELD_ORDER = ['aveugleId', 'catalogueId', 'deliveryMethod', 'mediaFormatId'];

export interface User {
    id: number;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    civility?: { name: string } | string | null;
    preferredMediaFormatId?: number | null;
    preferredDeliveryMethod?: 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null;
}

export interface Book {
    id: number;
    title: string;
    author: string;
    audio_filepath?: string | null;
    /** Weight of the recording in Kio — drives the tarif conseillé. */
    audioSizeKb?: number | null;
}

export interface Status {
    id: number;
    name: string;
}

export interface MediaFormat {
    id: number;
    name: string;
}

export interface OrderFormData {
    aveugleId: number | null;
    catalogueId: number | null;
    requestReceivedDate: Date;
    statusId: number | null;
    isDuplication: boolean;
    mediaFormatId: number | null;
    deliveryMethod: 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null;
    processedByStaffId: number | null;
    // createdDate: Date | null;
    closureDate: Date | null;
    cost: string;
    /** Tarification à la page ; décochée, la demande se tarife au poids et `cost` reste saisi. */
    pagePricing: PagePricingForm;
    billingStatus: 'UNBILLED' | 'BILLED' | 'UNBILLABLE';
    lentPhysicalBook: boolean;
    notes: string;
    /** Case « Facturer cette demande à … » — envoyée seulement quand elle est proposée. */
    billToNewClient?: boolean;
}

// Read-only context for the affectation linked to this order (if any).
// statusName comes straight from the Status table; reader is the current
// reader (most recent entry in the assignment's reader history).
export interface OrderAssignment {
    id: number;
    statusId: number;
    statusName: string;
    reader?: { id: number; name: string | null } | null;
    sentToReaderDate?: string | null;
    returnedToECADate?: string | null;
}

interface OrderFormBackendBaseProps {
    initialData?: OrderFormData;
    /** Order id when editing — lets the recording-duplicate check ignore self. */
    currentOrderId?: number;
    onSubmit: (formData: OrderFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (orderId: number, isDeleted?: boolean) => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
    // Pre-fetched selections to avoid additional API calls
    initialSelectedUser?: User | null;
    initialSelectedBook?: Book | null;
    initialSelectedStaff?: User | null;
    // Linked bill (read-only context)
    initialBill?: { id: number; state: string } | null;
    // Linked attribution (read-only context). `null` = none; `undefined` = not
    // known yet (still loading, or creating) — the derived statut then falls back
    // to the saved one rather than flashing « Attente envoi vers lecteur ».
    initialAssignment?: OrderAssignment | null;
    /** Greys out and disables every field/button — set when the demande is soft-deleted. */
    readOnly?: boolean;
}

// Euro display helpers: keep only digits + one decimal separator while typing,
// then pad to 2 decimals on blur. The € sign is a visual adornment, never stored.
export const sanitizeDecimal = (v: string): string => {
    const raw = (v ?? '').replace(/[^0-9.,]/g, '').replace(',', '.');
    const parts = raw.split('.');
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : raw;
};
export const formatEuro2 = (v: string | null | undefined): string => {
    if (v == null || String(v).trim() === '') return '';
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(n) ? '' : n.toFixed(2);
};

/** Minuit local, comme toutes les dates que produit le sélecteur de calendrier. */
function today(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// La facture citée dans une note du formulaire, ouverte dans un nouvel onglet comme
// « Voir la facture » plus bas : la demande en cours de saisie ne se perd pas.
function BillLink({ billId, children }: { billId: number; children: React.ReactNode }) {
    return (
        <Link
            href={`/admin/bills?bill=${billId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2 hover:opacity-80"
        >
            {children}
        </Link>
    );
}

export function OrderFormBackendBase({
                                         initialData,
                                         currentOrderId,
                                         onSubmit,
                                         submitButtonText,
                                         loadingText,
                                         title,
                                         onSuccess,
                                         onDelete,
                                         showDelete,
                                         initialSelectedUser,
                                         initialSelectedBook,
                                         initialSelectedStaff,
                                         initialBill,
                                         initialAssignment,
                                         readOnly = false,
                                     }: OrderFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toastError } = useFormToast();
    const confirm = useConfirm();
    const { registerField, focusFirstInvalid } = useInvalidField();
    const {
        blocked: activityBlocked,
        role: activityRole,
        requireActive,
        resolveAndClose: closeActivityGuard,
    } = useUserActivityGuard();

    // ── Ce que la facture liée verrouille ───────────────────────────────
    // Le verrou suit l'ÉTAT de la facture, pas le rattachement. Une demande
    // rejoint le brouillon de son auditeur toute seule dès qu'un permanent la
    // passe « Terminé », et un brouillon n'a jamais quitté ECA : verrouiller au
    // rattachement figerait la demande à l'instant même où on la termine. La
    // frontière est l'émission — sauf pour deux champs qui ne rendent pas le
    // document périmé mais FAUX sur qui doit quoi, et qui sont donc verrouillés
    // dès le brouillon : l'auditeur (il décide de quelle facture la demande
    // relève) et « Non facturable » (le montant resterait compté dans le total).
    //
    // Les mêmes règles sont appliquées côté serveur (lib/billing.ts), qui refuse
    // de toute façon. Ceci n'en est que le rappel de tous les jours — grisé plutôt
    // qu'annoncé après coup, parce que la règle est connue avant que le permanent
    // ne remplisse quoi que ce soit.
    const hasBill = !!initialBill;
    const billIssued = hasBill && initialBill!.state !== 'DRAFT';
    // Cost is locked while the linked bill is finalized (payée/soldée); reopen to edit.
    const costLocked = initialBill?.state === 'PAID' || initialBill?.state === 'SOLDE';
    // Le statut ENREGISTRÉ, pas celui en cours de saisie : c'est lui qui dit si la
    // demande est déjà partie sur une facture en tant que prestation rendue.
    const savedStatusIsTermine = initialData?.statusId === STATUS.TERMINE;
    // Revenir en arrière depuis « Terminé » : refusé sur une facture émise…
    const statusRollbackLocked = savedStatusIsTermine && billIssued;
    // …et permis sur un brouillon, mais la demande en sort — annoncé avant, pas après.
    const statusRollbackDetaches = savedStatusIsTermine && hasBill && !billIssued;

    // True only right after picking a book that already has audio auto-checks the
    // « Duplication » box — drives the "cochée automatiquement" banner. Reset once
    // the admin touches the checkboxes, and never set when merely opening an existing
    // order, so the banner doesn't nag on every (already-duplication) order.
    const [dupAutoChecked, setDupAutoChecked] = useState(false);

    // Cochée par défaut : voir offerBillToNewClient plus bas.
    const [billToNewClient, setBillToNewClient] = useState(true);

    // Form data state
    const [formData, setFormData] = useState<OrderFormData>(() =>
        initialData
            ? { ...initialData, cost: formatEuro2(initialData.cost) }
            : {
                aveugleId: initialSelectedUser?.id ?? null,
                catalogueId: null,
                requestReceivedDate: new Date(),
                statusId: null,
                isDuplication: false,
                mediaFormatId: null,
                deliveryMethod: null,
                processedByStaffId: null,
                //createdDate: new Date(),
                closureDate: null,
                cost: '3.00',
                pagePricing: emptyPagePricing(),
                billingStatus: 'UNBILLED',
                lentPhysicalBook: false,
                notes: '',
            }
    );

    // ── Statut dérivé (voir deriveOrderStatus) ──────────────────────────────
    // L'attribution arrive par un fetch séparé (EditOrderFormBackend) : tant
    // qu'elle n'est pas connue, une demande d'enregistrement sans date garde son
    // statut enregistré plutôt que d'afficher un instant « Attente envoi vers
    // lecteur ». Une création n'a pas d'attribution, par définition.
    const assignmentUnknown = !!initialData && initialAssignment === undefined;
    const assignmentStatusId = initialAssignment?.statusId ?? null;
    // Une fonction et non une simple valeur : la réouverture envoie un état qui
    // n'est pas encore celui du formulaire (date effacée), voir submitForm.
    const statusFor = (data: OrderFormData): number =>
        assignmentUnknown && !data.isDuplication && !data.closureDate
            ? (initialData!.statusId ?? STATUS.ATTENTE)
            : deriveOrderStatus({
                isDuplication: data.isDuplication,
                hasClosureDate: !!data.closureDate,
                assignmentStatusId,
            });
    const derivedStatusId = statusFor(formData);

    // « Rouvrir la demande » : le pendant de « Rouvrir l'attribution ». Rouvrir =
    // effacer la date de clôture, donc le statut retombe sur ce que dit
    // l'attribution ; la raison, facultative, rejoint les notes — OrderEvent n'a
    // pas de champ texte, et c'est là que le prochain permanent la lira.
    const [reopenOpen, setReopenOpen] = useState(false);
    const [reopenReason, setReopenReason] = useState('');

    // ── Auditeur changé sur une demande déjà terminée, hors facture ─────────
    // Elle ne rejoindra plus de brouillon toute seule (l'accrual ne réagit qu'au
    // PASSAGE à « Terminé »), donc on propose de la facturer au nouvel auditeur —
    // case cochée, parce que c'est le cas courant : la demande était au mauvais
    // nom, on l'a retirée de sa facture pour la corriger. Décochable, parce qu'une
    // demande « Terminé » sans facture peut aussi être un reliquat d'Access déjà
    // réglé, qu'une correction d'historique ne doit pas refacturer. Le serveur
    // applique la même condition (billToNewClient, PUT /api/orders/[id]).
    const offerBillToNewClient =
        !!initialData &&
        !hasBill &&
        savedStatusIsTermine &&
        derivedStatusId === STATUS.TERMINE &&
        formData.aveugleId != null &&
        formData.aveugleId !== initialData.aveugleId &&
        formData.billingStatus !== 'UNBILLABLE';

    // Options data
    const { statuses, mediaFormats } = useReferenceData();

    // Selected display values
    const [selectedUser, setSelectedUser] = useState<User | null>(initialSelectedUser || null);
    const [selectedBook, setSelectedBook] = useState<Book | null>(initialSelectedBook || null);
    const [selectedStaff, setSelectedStaff] = useState<User | null>(initialSelectedStaff || null);

    const audioAlreadyExists = Boolean(selectedBook?.audio_filepath);

    // ── Mises en garde « enregistrement » ───────────────────────────────
    // On ne décide plus ici de les montrer ou non : on donne au hook la décision
    // saisie et la décision ENREGISTRÉE, et il ne fabrique un avis que tant que
    // la première s'écarte de la seconde. Ouvrir une demande d'enregistrement
    // pour la modifier ne produit donc aucun avis — c'est elle, l'enregistrement
    // dont on l'avertirait. Le raisonnement complet est dans
    // lib/orders/recordingAdvice.ts ; la règle n'existe qu'à cet endroit-là,
    // pour qu'elle ne puisse plus disparaître d'un coup de ménage dans le JSX.
    const recordingContext = React.useMemo<RecordingContext>(
        () => ({
            catalogueId: formData.catalogueId,
            lentPhysicalBook: formData.lentPhysicalBook,
            isDuplication: formData.isDuplication,
            bookHasAudio: audioAlreadyExists,
        }),
        [formData.catalogueId, formData.lentPhysicalBook, formData.isDuplication, audioAlreadyExists]
    );
    const savedRecordingDecision = React.useMemo<RecordingDecision | null>(
        () =>
            initialData
                ? {
                    catalogueId: initialData.catalogueId,
                    lentPhysicalBook: initialData.lentPhysicalBook,
                    isDuplication: initialData.isDuplication,
                }
                : null,
        [initialData]
    );
    const recordingCurrent = React.useMemo(() => [recordingContext], [recordingContext]);
    const {
        adviceFor: recordingAdviceFor,
        conflicts: recordingConflicts,
        blockingRecordingFor,
    } = useRecordingAdvice({
        current: recordingCurrent,
        saved: savedRecordingDecision,
        excludeOrderId: currentOrderId,
    });
    const recordingAdvice = recordingAdviceFor(recordingContext);

    // Load initial selections if editing (only if not pre-fetched)
    useEffect(() => {
        if (initialData) {
            // Fetch selected user info only if not pre-fetched
            if (initialData.aveugleId && !initialSelectedUser) {
                fetch(`/api/user/${initialData.aveugleId}`)
                    .then(res => res.json())
                    .then(user => {
                        setSelectedUser(user);
                        // Default-only seed: in edit mode the demande already has a
                        // format, so this only fires for genuinely empty values.
                        if (user?.preferredMediaFormatId != null) {
                            setFormData(prev =>
                                prev.mediaFormatId
                                    ? prev
                                    : { ...prev, mediaFormatId: user.preferredMediaFormatId }
                            );
                        }
                        if (user?.preferredDeliveryMethod === 'RETRAIT' || user?.preferredDeliveryMethod === 'ENVOI') {
                            setFormData(prev =>
                                prev.deliveryMethod
                                    ? prev
                                    : { ...prev, deliveryMethod: user.preferredDeliveryMethod }
                            );
                        }
                    })
                    .catch(err => console.error('Error fetching user:', err));
            }
            // Fetch selected book info only if not pre-fetched
            if (initialData.catalogueId && !initialSelectedBook) {
                fetch(`/api/books/${initialData.catalogueId}`)
                    .then(res => res.json())
                    .then(book => setSelectedBook(book))
                    .catch(err => console.error('Error fetching book:', err));
            }
            // Fetch selected staff info only if not pre-fetched
            if (initialData.processedByStaffId && !initialSelectedStaff) {
                fetch(`/api/user/${initialData.processedByStaffId}`)
                    .then(res => res.json())
                    .then(user => setSelectedStaff(user))
                    .catch(err => console.error('Error fetching staff:', err));
            }
        }
    }, [initialData, initialSelectedUser, initialSelectedBook, initialSelectedStaff]);

    const handleUserSelect = async (user: User) => {
        // Vetoed selections return false so the picker stays open (N.B. the
        // activity-guard dialog takes over the screen in that case).
        const proceed = await requireActive(user.id, 'aveugle');
        if (!proceed) return false;

        setSelectedUser(user);
        setFormData((prev) => ({
            ...prev,
            aveugleId: user.id,
            // Seed the demande's media format from the person's preference, but
            // only as a default: don't clobber a format the admin already chose.
            mediaFormatId:
                user.preferredMediaFormatId != null && !prev.mediaFormatId
                    ? user.preferredMediaFormatId
                    : prev.mediaFormatId,
            // Same idea for delivery method. NON_APPLICABLE is no longer a valid
            // demande option, so only seed RETRAIT/ENVOI.
            deliveryMethod:
                (user.preferredDeliveryMethod === 'RETRAIT' || user.preferredDeliveryMethod === 'ENVOI') && !prev.deliveryMethod
                    ? user.preferredDeliveryMethod
                    : prev.deliveryMethod,
        }));
    };

    const handleBookSelect = async (book: Book) => {
        // The search results are lightweight; fetch the full book so we know
        // whether it already has an audio file.
        let full: Book = book;
        try {
            const res = await fetch(`/api/books/${book.id}`);
            if (res.ok) full = await res.json();
        } catch (err) {
            console.error('Error fetching book details:', err);
        }

        setSelectedBook(full);

        // Une demande qui a déjà une attribution est un enregistrement, et le serveur
        // refuse de la basculer en duplication (guardDuplicationFlip). Corriger son
        // livre vers un titre déjà enregistré ne doit donc pas cocher la case — sinon
        // la correction elle-même serait refusée.
        const autoDuplication = Boolean(full.audio_filepath) && !initialAssignment;
        // Only when we actually auto-check duplication here should the
        // "cochée automatiquement" banner show.
        setDupAutoChecked(autoDuplication);
        // Le tarif dépend du poids de l'enregistrement : en changeant de livre on
        // l'aligne sur le nouveau, sinon le coût du livre précédent resterait là
        // sans que personne le remarque. Ça reste une proposition — le champ est
        // libre juste en dessous.
        //
        // Jamais sur une facture émise, payée ou soldée : le montant est parti chez
        // l'auditeur, et changer de livre après coup corrige une erreur des ECA —
        // l'auditeur n'a pas à la payer. Le coût facturé reste, et le formulaire le dit.
        const suggested = costSuggestion(full.audioSizeKb);
        setFormData(prev => ({
            ...prev,
            catalogueId: full.id,
            // Audio already exists -> default this to a duplication (not forced;
            // the admin can uncheck it, e.g. for a re-recording / re-read).
            ...(autoDuplication ? { isDuplication: true, lentPhysicalBook: false } : {}),
            ...(suggested && !billIssued ? { cost: suggested.value } : {}),
        }));
    };


    const handleDuplicationChange = (checked: boolean) => {
        // The admin is now deciding manually — the auto-check banner no longer applies.
        setDupAutoChecked(false);
        // Le statut suit tout seul (deriveOrderStatus) : une duplication sans date
        // est « À faire », un enregistrement repart de son attribution.
        setFormData(prev => ({
            ...prev,
            isDuplication: checked,
            lentPhysicalBook: checked ? false : prev.lentPhysicalBook,
        }));
    };

    const handleRecordingChange = (checked: boolean) => {
        // The admin is now deciding manually — the auto-check banner no longer applies.
        setDupAutoChecked(false);
        setFormData(prev => ({
            ...prev,
            lentPhysicalBook: checked,
            isDuplication: checked ? false : prev.isDuplication,
        }));
    };

    // Sur une demande enregistrée « Terminé », la date se corrige d'un jour mais ne
    // s'efface pas d'ici : rouvrir passe par « Rouvrir la demande », qui dit ce que
    // la réouverture entraîne (facture) et en garde la raison. Sur une facture émise
    // elle ne s'efface pas du tout — guardOrderLeavingTermineOnBill le refuse côté
    // serveur. Le calendrier rend `undefined` quand on reclique le jour choisi : on
    // l'ignore dans ces cas-là.
    const setClosureDate = (date: Date | null) => {
        if (!date && savedStatusIsTermine) return;
        setFormData(prev => ({ ...prev, closureDate: date }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        // N3 — collect failing required fields in visual order.
        const invalid: string[] = [];
        if (!formData.aveugleId) invalid.push('aveugleId');
        if (!formData.catalogueId) invalid.push('catalogueId');
        if (!formData.mediaFormatId) invalid.push('mediaFormatId');
        if (!formData.deliveryMethod) invalid.push('deliveryMethod');

        if (invalid.length) {
            const messages: Record<string, string> = {
                aveugleId: 'Veuillez sélectionner un auditeur',
                catalogueId: 'Veuillez sélectionner un livre',
                mediaFormatId: 'Veuillez sélectionner un format média',
                deliveryMethod: 'Veuillez sélectionner une méthode de livraison',
            };
            const firstName = EDIT_FIELD_ORDER.find((n) => invalid.includes(n)) ?? invalid[0];
            const msg = messages[firstName];
            setError(msg);
            toastError(msg);
            focusFirstInvalid(EDIT_FIELD_ORDER, new Set(invalid));
            setIsLoading(false);
            return;
        }

        // guardOrderCompletion (lib/statusSync.ts) : la date ferait passer la demande
        // « Terminé » alors que l'enregistrement n'est pas revenu. Dit ici plutôt
        // qu'en 409 générique — même principe que readerBlocksAdvance côté attribution.
        if (closureBlocksSave) {
            setError(closureBlockedMessage);
            toastError(closureBlockedMessage);
            setIsLoading(false);
            return;
        }

        // Warn before creating a SECOND active recording demande for this book.
        // Même porte que l'avis affiché dans le formulaire : modifier une demande
        // sans toucher à sa décision d'enregistrement ne demande rien à personne.
        const conflicts = await recordingConflicts();
        if (conflicts.length > 0) {
            if (!(await confirm({
                title: 'Une demande d’enregistrement est déjà en cours',
                description: recordingConflictConfirmText(conflicts, []),
            }))) {
                setIsLoading(false);
                return;
            }
        }

        // Une duplication n'a pas de lecture : sa saisie de pages, gardée en mémoire,
        // ne la concerne pas et ne doit ni la bloquer ni partir au serveur.
        const pageError = formData.isDuplication ? null : pagePricingError(formData.pagePricing);
        if (pageError) {
            setError(pageError);
            toastError(pageError);
            setIsLoading(false);
            return;
        }

        await submitForm();
    };

    // `overrides` : des champs posés par un geste plutôt que saisis — la
    // réouverture (handleReopenConfirm) efface la date dans le même envoi que le
    // reste du formulaire, sans attendre un re-rendu. Comme submitForm côté
    // attribution.
    const submitForm = async (overrides?: Partial<OrderFormData>) => {
        setIsLoading(true);
        try {
            const data: OrderFormData = { ...formData, ...overrides };
            // statusId n'est jamais saisi : c'est toujours la valeur que
            // deriveOrderStatus tire de ces mêmes données.
            const submitted: OrderFormData = { ...data, statusId: statusFor(data) };
            const newOrderId = await onSubmit(
                offerBillToNewClient ? { ...submitted, billToNewClient } : submitted
            );
            if (onSuccess) {
                onSuccess(newOrderId);
            }
        } catch (err) {
            // The onSubmit wrapper already shows a detailed error toast; keep only a
            // quiet inline fallback here so we never mask it (one toast at a time).
            const msg = err instanceof Error && err.message ? err.message : 'Échec du traitement de la demande';
            setError(msg);
            return;
        } finally {
            setIsLoading(false);
        }
    };

    const handleReopenConfirm = () => {
        setReopenOpen(false);
        const reason = reopenReason.trim();
        const reopenNote = `Rouverte le ${parisDateDisplay(new Date())}${reason ? ` : ${reason}` : ''}`;
        void submitForm({
            closureDate: null,
            notes: formData.notes ? `${formData.notes}\n${reopenNote}` : reopenNote,
        });
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;

        if (await confirm({
            title: 'Supprimer cette demande ?',
            confirmLabel: 'Supprimer',
            destructive: true,
        })) {
            setIsLoading(true);
            try {
                await onDelete();
            } catch (err) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('Échec de la suppression de la demande');
                }
            } finally {
                setIsLoading(false);
            }
        }
    };

    // Tarif conseillé : 3 € par tranche de 700 Mio entamée (lib/pricing.ts). Null
    // tant que le poids du livre est inconnu — mieux vaut ne rien annoncer qu'un
    // tarif fondé sur un dossier jamais synchronisé.
    const tarif = costSuggestion(selectedBook?.audioSizeKb);
    // On ne signale l'écart que s'il est réel : le champ est saisi à la main, donc
    // « 6 » et « 6.00 » sont le même montant et ne doivent pas déclencher l'alerte.
    const costDiffersFromTarif =
        tarif != null && !costLocked && formatEuro2(formData.cost) !== tarif.value;

    // Livre corrigé sur une demande existante. Rien n'est bloqué — c'est un geste de
    // correction — mais deux conséquences se voient mal depuis ce formulaire :
    // l'attribution suit (le serveur la réaligne), et une facture déjà partie garde
    // son coût tout en étant à réimprimer.
    const bookChanged = !!initialData && formData.catalogueId !== initialData.catalogueId;
    // Le lecteur a le livre en main, ou l'a déjà rendu enregistré : l'enregistrement
    // porte sur l'ancien titre.
    const assignmentUnderway =
        !!initialAssignment &&
        (!!initialAssignment.reader || !!initialAssignment.sentToReaderDate || !!initialAssignment.returnedToECADate);

    // A duplication is normally « À faire » — do it now. The exception is a book
    // with no audio yet because a lecteur is still recording it: nothing can be
    // copied until that comes back. A closed demande is excluded — it waits for
    // nothing. Same rule as the list badge (lib/orders/duplicationBlocked.ts);
    // derived, never stored.
    const demandeIsClosed = derivedStatusId === STATUS.TERMINE;

    // La saisie « à la page » survit au passage en duplication (cochée par le choix
    // d'un livre déjà enregistré, par exemple) : elle reste dans formData, mais n'est
    // ni affichée ni envoyée tant que la demande est une duplication.
    const pagePricingActive = formData.pagePricing.pageBased && !formData.isDuplication;

    // ── La date de clôture : le seul champ qui fait bouger le statut ici ─────
    // Une duplication peut être close à tout moment. Un enregistrement seulement
    // une fois l'attribution « Terminé » — l'enregistrement est revenu aux ECA —,
    // ce que guardOrderCompletion exige de toute façon. Une date déjà présente
    // reste modifiable (et effaçable) même hors de ce cas : une demande reprise
    // d'Access peut porter n'importe quelle paire, et c'est ici qu'on la corrige.
    const recordingIsBack = assignmentStatusId === STATUS.TERMINE;
    const closureDateEnabled =
        formData.isDuplication || recordingIsBack || !!formData.closureDate;
    // La date est là, mais l'enregistrement, lui, n'est pas revenu.
    const closureBlocked =
        !formData.isDuplication && !!formData.closureDate && !assignmentUnknown && !recordingIsBack;
    // Refusé seulement si l'enregistrement CHANGERAIT le statut, comme le serveur
    // (guardOrderCompletion n'y regarde que sur un vrai changement) : une demande
    // déjà « Terminé » reprise d'Access reste modifiable pour ses notes.
    const closureBlocksSave = closureBlocked && derivedStatusId !== initialData?.statusId;
    const closureBlockedMessage = assignmentStatusId === null
        ? "Cette demande d'enregistrement n'a pas d'attribution : créez-la et terminez-la (date de retour aux ECA) avant de renseigner la date de clôture."
        : "L'attribution n'est pas terminée : l'enregistrement doit être revenu aux ECA (date de retour sur l'attribution) avant que la demande puisse être close.";

    const statusName = (id: number | null | undefined) =>
        statuses.find((s) => s.id === id)?.name ?? '—';
    // Le statut enregistré ne correspond plus à ce que dit la demande : soit on
    // vient de toucher la date ou le type, soit c'est une ancienne demande dont la
    // paire statut/date n'a jamais été cohérente. Dans les deux cas, dire ce que
    // l'enregistrement va changer.
    const statusWillChange =
        !!initialData && !assignmentUnknown && derivedStatusId !== initialData.statusId;

    // Offert sur une demande ENREGISTRÉE « Terminé » qui porte encore sa date —
    // comme « Rouvrir l'attribution » sur une attribution terminée. Une date saisie
    // dans cette session, elle, s'efface par « Effacer » à côté du champ.
    const canReopen = !!initialData && !readOnly && savedStatusIsTermine && !!formData.closureDate;
    // Ce que la demande redeviendra une fois la date effacée.
    const reopenedStatusId = statusFor({ ...formData, closureDate: null });

    const blockingRecording =
        formData.isDuplication && !audioAlreadyExists && !demandeIsClosed
            ? blockingRecordingFor(formData.catalogueId)
            : null;

    return (
        <>
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-foreground">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-800 dark:text-red-200">{error}</AlertDescription>
                    </Alert>
                )}

                {/* Un seul bandeau pour dire pourquoi le formulaire n'est pas tout à fait
                    le même aujourd'hui ; le détail de chaque verrou reste sous le champ
                    concerné. Rien pour un brouillon : il n'est jamais sorti d'ECA, et
                    l'annoncer ferait passer pour une contrainte ce qui n'est qu'un cumul
                    en cours. */}
                {billIssued && initialBill && (
                    <Alert className="mb-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                        <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                        <AlertDescription className="text-amber-800 dark:text-amber-300">
                            Cette demande figure sur la{' '}
                            <BillLink billId={initialBill.id}>facture #{initialBill.id}</BillLink> (
                            {getBillingStatusLabel(initialBill.state as BillingStatus).toLowerCase()}), déjà
                            imprimée et envoyée à l&apos;auditeur. Le livre, la date et le coût restent
                            modifiables — le document devra alors être réimprimé. L&apos;auditeur est
                            verrouillé et la date de clôture ne peut plus être effacée : rouvrez la
                            facture et retirez-en la demande pour y toucher.
                        </AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit}>
                    {/* min-w-0 : un fieldset a par défaut `min-width: min-content` — le
                        champ le plus large du formulaire l'élargissait au-delà du modal
                        sur un téléphone, et tout le formulaire défilait de côté. */}
                    <fieldset disabled={readOnly} className="min-w-0 space-y-4 disabled:opacity-60">
                    {/* User Search (Aveugle) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Auditeur <span className="text-red-500">*</span>
                        </label>
                        <UserSearchCombobox<User>
                            value={selectedUser}
                            onSelect={handleUserSelect}
                            disabled={hasBill}
                            triggerRef={registerField('aveugleId')}
                            viewHref={(user) => `/admin/users/dossier/${user.id}`}
                        />
                        {hasBill && initialBill && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                Auditeur verrouillé : la demande figure sur la{' '}
                                <BillLink billId={initialBill.id}>facture #{initialBill.id}</BillLink>, qui
                                appartient à cet auditeur.{' '}
                                {billIssued
                                    ? 'Rouvrez la facture et retirez-en la demande pour le modifier.'
                                    : 'Retirez-la de la facture pour le modifier.'}{' '}
                                <BillLink billId={initialBill.id}>
                                    Vous pouvez la voir ici
                                    <ExternalLink className="inline h-3 w-3 ml-1 align-[-1px]" aria-hidden="true" />
                                </BillLink>
                            </p>
                        )}
                        {offerBillToNewClient && selectedUser && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        id="billToNewClient"
                                        checked={billToNewClient}
                                        onCheckedChange={(checked) => setBillToNewClient(checked === true)}
                                        className="mt-0.5 border-2 border-muted-foreground/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                    />
                                    <label htmlFor="billToNewClient" className="text-sm text-foreground cursor-pointer leading-snug flex-1">
                                        <span className="font-medium">
                                            Facturer cette demande à {getUserDisplayName(selectedUser)}
                                        </span>
                                        <span className="block text-xs text-muted-foreground mt-1">
                                            {pagePricingActive
                                                ? 'Elle est terminée et ne figure sur aucune facture : sa facture pro-forma sera créée et émise à l’enregistrement.'
                                                : 'Elle est terminée et ne figure sur aucune facture : elle sera ajoutée à son brouillon, ou un brouillon sera ouvert.'}{' '}
                                            Décochez si elle ne doit pas être facturée (ancienne demande déjà réglée,
                                            correction d&apos;historique) : elle restera « Terminé » sans facture.
                                        </span>
                                    </label>
                                </div>
                            </div>
                        )}
                        {/* The envelope this demande will go back in. Sits under the
                            auditeur — the person being written to — the same way the
                            audio button sits under the livre. */}
                        {selectedUser && (
                            <MailingLabelButton
                                userId={selectedUser.id}
                                shipment={
                                    currentOrderId
                                        ? {
                                            orderId: currentOrderId,
                                            title: selectedBook?.title,
                                            isDuplication: formData.isDuplication,
                                            mediaFormat: mediaFormats.find(
                                                (m) => m.id === formData.mediaFormatId
                                            )?.name,
                                        }
                                        : null
                                }
                                className="h-8 px-2.5 text-xs"
                            />
                        )}
                    </div>

                    {/* Request Received Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Date de réception <span className="text-red-500">*</span>
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left bg-field border-border text-foreground hover:bg-muted"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {formData.requestReceivedDate ? (
                                        format(formData.requestReceivedDate, 'PPP', { locale: fr })
                                    ) : (
                                        <span>Sélectionner une date</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-card border-border">
                                <CalendarComponent
                                    mode="single"
                                    selected={formData.requestReceivedDate}
                                    onSelect={(date) => date && setFormData({ ...formData, requestReceivedDate: date })}
                                    initialFocus
                                    className="bg-card text-foreground"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Book Search */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Livre <span className="text-red-500">*</span>
                        </label>
                        <BookSearchCombobox<Book>
                            value={selectedBook}
                            onSelect={handleBookSelect}
                            triggerRef={registerField('catalogueId')}
                            viewHref={(b) => `/admin/books?book=${b.id}`}
                        />
                        {/* The recordings of the book this demande is about, without
                            leaving the form. */}
                        {selectedBook && (
                            <BookAudioButton
                                bookId={selectedBook.id}
                                bookTitle={selectedBook.title}
                                size="sm"
                            />
                        )}
                        {/* Sur une demande existante seulement : les autres demandes et
                            attributions de ce livre, pour démêler un doublon de saisie.
                            Pas en création — ce n'est pas une mise en garde
                            d'enregistrement, et celles-là passent par RecordingAdvice
                            (.claude/rules/order-recording-warnings.md). */}
                        {currentOrderId && selectedBook && <BookUsageLinks bookId={selectedBook.id} />}
                        {bookChanged && (initialAssignment || billIssued) && (
                            <div className="bg-amber-50 border border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200 p-3 rounded-lg text-sm space-y-2">
                                {initialAssignment && (
                                    <p>
                                        L&apos;attribution liée sera mise à jour avec ce livre.
                                        {assignmentUnderway && (
                                            <>
                                                {' '}Elle est déjà « {initialAssignment.statusName} »
                                                {initialAssignment.reader ? ` (lecteur : ${initialAssignment.reader.name || 'sans nom'})` : ''} :
                                                ce qui a été lu ou enregistré porte sur l&apos;ancien livre.
                                                Vérifiez que l&apos;enregistrement se trouve bien dans le dossier audio de ce livre-ci.
                                            </>
                                        )}
                                    </p>
                                )}
                                {billIssued && initialBill && (
                                    <p>
                                        La facture #{initialBill.id} est déjà{' '}
                                        {getBillingStatusLabel(initialBill.state as BillingStatus).toLowerCase()} : le
                                        coût facturé n&apos;est pas recalculé — l&apos;auditeur n&apos;a pas à payer une
                                        erreur de saisie. Pensez à réimprimer la facture pour que le livre corresponde.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Type de la demande */}
                    <div className="space-y-2 pt-4 border-t border-border">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                            Type de la demande
                        </h3>
                        <div className="space-y-4">
                            {dupAutoChecked && formData.isDuplication && (
                                <div className="bg-amber-50 border border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200 p-3 rounded-lg text-sm">
                                    Un fichier audio existe déjà pour ce livre. La case
                                    « Duplication » a été cochée automatiquement — décochez-la
                                    s&apos;il s&apos;agit d&apos;une réécoute / nouvel enregistrement.
                                </div>
                            )}
                            {/* Côte à côte, comme les deux boutons du formulaire de création. */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                <div className="bg-card/50 p-4 rounded-lg border border-border">
                                    <div className="flex items-center space-x-3">
                                        <Checkbox
                                            id="isDuplication"
                                            checked={formData.isDuplication}
                                            onCheckedChange={handleDuplicationChange}
                                            className="border-2 border-muted-foreground/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary w-6 h-6"
                                        />
                                        <label htmlFor="isDuplication" className="text-base font-bold text-foreground cursor-pointer leading-tight flex-1">
                                            Duplication
                                        </label>
                                    </div>
                                    {blockingRecording && (
                                        <p className="mt-2 ml-9 text-sm text-amber-700 dark:text-amber-400">
                                            En attente d&apos;enregistrement : cet ouvrage n&apos;a pas encore
                                            de fichier audio et un enregistrement est en cours
                                            {blockingRecording.readerName ? ` (lecteur ${blockingRecording.readerName}` : ''}
                                            {blockingRecording.readerName && blockingRecording.sentToReaderDate
                                                ? `, envoyé le ${parisDate(blockingRecording.sentToReaderDate)}`
                                                : ''}
                                            {blockingRecording.readerName ? ')' : ''}. La duplication ne pourra
                                            être faite qu&apos;au retour de l&apos;enregistrement.
                                        </p>
                                    )}
                                </div>

                                <div className="bg-card/50 p-4 rounded-lg border border-border">
                                    <div className="flex items-center space-x-3">
                                        <Checkbox
                                            id="lentPhysicalBook"
                                            checked={formData.lentPhysicalBook}
                                            onCheckedChange={handleRecordingChange}
                                            className="border-2 border-muted-foreground/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary w-6 h-6"
                                        />
                                        <label htmlFor="lentPhysicalBook" className="text-base font-bold text-foreground cursor-pointer leading-tight flex-1">
                                            Enregistrement
                                        </label>
                                    </div>
                                    <RecordingAdviceNotice advice={recordingAdvice} className="mt-2 ml-9" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Attribution liée — read-only, au-dessus de la date de clôture et du
                        statut : c'est elle qui fait « En cours » puis « Attente envoi vers
                        auditeur ». Hidden for duplications: a duplication never has an
                        attribution, so showing it confuses the team. */}
                    {!formData.isDuplication && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Attribution</label>
                            {initialAssignment ? (
                                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-card border border-border rounded-md">
                                    <div className="text-sm text-foreground space-y-0.5">
                                        <div>
                                            <span className="text-foreground">{initialAssignment.statusName}</span>
                                            {initialAssignment.reader && (
                                                <span> — Lecteur : <span className="text-foreground">{initialAssignment.reader.name || 'Sans nom'}</span></span>
                                            )}
                                        </div>
                                        {initialAssignment.sentToReaderDate && (
                                            <div className="text-xs text-muted-foreground">
                                                Envoyé au lecteur le {format(new Date(initialAssignment.sentToReaderDate), 'dd/MM/yyyy', { locale: fr })}
                                            </div>
                                        )}
                                        {initialAssignment.returnedToECADate && (
                                            <div className="text-xs text-muted-foreground">
                                                Revenu aux ECA le {format(new Date(initialAssignment.returnedToECADate), 'dd/MM/yyyy', { locale: fr })}
                                            </div>
                                        )}
                                    </div>
                                    <Link
                                        href={`/admin/assignments?assignment=${initialAssignment.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2 whitespace-nowrap"
                                    >
                                        Voir l&apos;attribution
                                    </Link>
                                </div>
                            ) : (
                                <div className="px-3 py-2 bg-card border border-border rounded-md text-muted-foreground text-sm italic">
                                    {assignmentUnknown ? 'Chargement…' : 'Aucune attribution'}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Date de clôture et méthode de livraison côte à côte : l'une dit quand
                        la demande part chez l'auditeur, l'autre comment — comme « Date d'envoi
                        au lecteur » et sa méthode sur l'attribution. C'est la date, et non
                        plus un menu, qui fait passer la demande « Terminé » : le statut en
                        dessous en est déduit (deriveOrderStatus). */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Date de clôture (envoi à l&apos;auditeur)
                            </label>
                            <div className="flex items-stretch">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            disabled={!closureDateEnabled}
                                            className="min-w-0 flex-1 justify-start rounded-r-none text-left bg-field border-border text-foreground hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            <Calendar className="mr-2 h-4 w-4 shrink-0" />
                                            {formData.closureDate ? (
                                                <span className="truncate">{format(formData.closureDate, 'PPP', { locale: fr })}</span>
                                            ) : (
                                                <span className="truncate text-muted-foreground">Sélectionner une date</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 bg-card border-border">
                                        <CalendarComponent
                                            mode="single"
                                            selected={formData.closureDate || undefined}
                                            onSelect={(date) => setClosureDate(date || null)}
                                            initialFocus
                                            className="bg-card text-foreground"
                                        />
                                    </PopoverContent>
                                </Popover>
                                {/* Le cas courant — on expédie aujourd'hui — reste à un clic,
                                    comme quand choisir « Terminé » remplissait la date.
                                    « Effacer » seulement pour une date saisie dans cette
                                    session : une demande déjà close se rouvre par « Rouvrir la
                                    demande », sous le statut, comme une attribution. */}
                                {!formData.closureDate ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={!closureDateEnabled}
                                        onClick={() => setClosureDate(today())}
                                        className="shrink-0 -ml-px rounded-l-none bg-muted text-muted-foreground hover:text-foreground focus-visible:z-10"
                                    >
                                        Aujourd&apos;hui
                                    </Button>
                                ) : !savedStatusIsTermine && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setClosureDate(null)}
                                        className="shrink-0 -ml-px rounded-l-none bg-muted text-muted-foreground hover:text-foreground focus-visible:z-10"
                                    >
                                        Effacer
                                    </Button>
                                )}
                            </div>
                            {!closureDateEnabled && !assignmentUnknown && (
                                <p className="text-xs text-muted-foreground">
                                    {assignmentStatusId === null
                                        ? 'Renseignable une fois l’attribution créée et terminée (date de retour aux ECA).'
                                        : 'Renseignable une fois l’enregistrement revenu aux ECA (date de retour sur l’attribution).'}
                                </p>
                            )}
                            {closureBlocked && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    {closureBlockedMessage}
                                </p>
                            )}
                        </div>

                        {/* Delivery Method */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Méthode de livraison <span className="text-red-500">*</span>
                            </label>
                            <Select
                                value={formData.deliveryMethod || ''}
                                onValueChange={(value) => setFormData({ ...formData, deliveryMethod: value as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE'})}
                            >
                                <SelectTrigger ref={registerField('deliveryMethod')} className="bg-field border-border text-foreground hover:bg-muted transition-colors">
                                    <SelectValue placeholder="Sélectionner une méthode" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <div className="py-1">
                                        <SelectItem
                                            value="RETRAIT"
                                            className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer pl-8 pr-3 py-2.5 border-b border-border/50 transition-colors"
                                        >
                                            <span className="font-medium">Retrait</span>
                                        </SelectItem>
                                        <SelectItem
                                            value="ENVOI"
                                            className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer pl-8 pr-3 py-2.5 transition-colors"
                                        >
                                            <span className="font-medium">Envoi</span>
                                        </SelectItem>
                                        {/* An older demande saved as NON_APPLICABLE keeps its option, so
                                            editing it doesn't show an empty required field and force a rewrite. */}
                                        {isLegacyValue(DELIVERY_METHOD_VALUES, formData.deliveryMethod) && (
                                            <SelectItem
                                                value={formData.deliveryMethod!}
                                                className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer pl-8 pr-3 py-2.5 border-t border-border/50 transition-colors"
                                            >
                                                <span className="font-medium">{getDeliveryMethodLabel(formData.deliveryMethod!)}</span>
                                            </SelectItem>
                                        )}
                                    </div>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Statut — déduit, pas choisi : de la date de clôture et de l'attribution
                        (deriveOrderStatus). Affiché comme celui de l'attribution, avec le même
                        geste pour revenir en arrière. */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Statut</label>
                        <div
                            tabIndex={-1}
                            className="flex items-center w-full rounded-md bg-card/60 border border-border px-3 py-2 text-foreground cursor-not-allowed outline-none"
                            aria-readonly="true"
                            title="Le statut est déterminé automatiquement par l'attribution et la date de clôture."
                        >
                            {statusName(derivedStatusId)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {formData.isDuplication
                                ? 'Déterminé automatiquement par la date de clôture.'
                                : 'Déterminé automatiquement par l’attribution et la date de clôture.'}
                            {statusWillChange && (
                                <> Enregistré aujourd&apos;hui : « {statusName(initialData?.statusId)} » — il
                                deviendra « {statusName(derivedStatusId)} » à l&apos;enregistrement.</>
                            )}
                        </p>
                        {derivedStatusId === STATUS.ATTENTE && assignmentStatusId === null && !assignmentUnknown && (
                            <p className="text-xs text-muted-foreground">
                                La demande passera « En cours » dès que son attribution aura un lecteur
                                et une date d&apos;envoi.
                            </p>
                        )}
                        {derivedStatusId === STATUS.ATTENTE_AUDITEUR && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                L&apos;enregistrement est revenu du lecteur mais n&apos;a pas encore été
                                expédié à l&apos;auditeur. Renseignez la date de clôture le jour de
                                l&apos;expédition : la demande passera « Terminé »
                                {/* Le retour du lecteur ne facture rien : des permanents la
                                    cherchaient sur les factures dès ce moment-là. */}
                                {!hasBill && formData.billingStatus !== 'UNBILLABLE'
                                    ? <> et c&apos;est à ce moment qu&apos;elle sera facturée.</>
                                    : '.'}
                            </p>
                        )}
                        {statusRollbackLocked && initialBill && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                La demande ne peut plus être rouverte : la facture #{initialBill.id} annonce
                                cette prestation comme rendue et elle est déjà partie. Rouvrez-la et
                                retirez-en la demande d&apos;abord.
                            </p>
                        )}
                        {canReopen && (
                            <div className="pt-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isLoading || statusRollbackLocked}
                                    onClick={() => { setReopenReason(''); setReopenOpen(true); }}
                                    className="h-8 px-2.5 text-xs"
                                >
                                    Rouvrir la demande
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Media Format */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Format média <span className="text-red-500">*</span>
                        </label>
                        <Select
                            value={formData.mediaFormatId?.toString() || ''}
                            onValueChange={(value) => setFormData({ ...formData, mediaFormatId: parseInt(value) })}
                        >
                            <SelectTrigger ref={registerField('mediaFormatId')} className="bg-field border-border text-foreground hover:bg-muted transition-colors">
                                <SelectValue placeholder="Sélectionner un format" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border max-h-[280px] overflow-y-auto">
                                <div className="py-1">
                                    {mediaFormats.map((format) => (
                                        <SelectItem
                                            key={format.id}
                                            value={format.id.toString()}
                                            className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer pl-8 pr-3 py-2.5 border-b border-border/50 last:border-b-0 transition-colors"
                                        >
                                            <span className="font-medium">{format.name}</span>
                                        </SelectItem>
                                    ))}
                                </div>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                        {/* Billing Status */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">État de facturation</label>
                            {formData.billingStatus === 'BILLED' ? (
                                <div className="bg-card border border-border rounded-md px-3 py-2.5 text-foreground">
                                    Facturé <span className="text-xs text-muted-foreground">(géré par la facture liée)</span>
                                </div>
                            ) : (
                                <Select
                                    value={formData.billingStatus}
                                    onValueChange={(value) => setFormData({ ...formData, billingStatus: value as 'UNBILLED' | 'BILLED' | 'UNBILLABLE'})}
                                >
                                    <SelectTrigger className="bg-field border-border text-foreground hover:bg-muted transition-colors">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        <div className="py-1">
                                            <SelectItem
                                                value="UNBILLED"
                                                className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer pl-8 pr-3 py-2.5 border-b border-border/50 transition-colors"
                                            >
                                                <span className="font-medium">Non facturé</span>
                                            </SelectItem>
                                            <SelectItem
                                                value="UNBILLABLE"
                                                disabled={hasBill}
                                                className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer pl-8 pr-3 py-2.5 transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                                            >
                                                <span className="font-medium">Non facturable</span>
                                            </SelectItem>
                                        </div>
                                    </SelectContent>
                                </Select>
                            )}
                            {/* Le total d'une facture se calcule par billId, pas par état de
                                facturation : une ligne « Non facturable » resterait facturée
                                tout en se déclarant hors du cycle. */}
                            {hasBill && initialBill && formData.billingStatus !== 'BILLED' && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    « Non facturable » indisponible : la demande figure sur la{' '}
                                    <BillLink billId={initialBill.id}>facture #{initialBill.id}</BillLink> et son
                                    montant y est compté.{' '}
                                    {billIssued
                                        ? 'Rouvrez la facture et retirez-en la demande d’abord.'
                                        : 'Retirez-la de la facture d’abord.'}
                                </p>
                            )}
                        </div>

                        {/* Linked Bill — read-only */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Facture associée</label>
                            {initialBill ? (
                                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-card border border-border rounded-md">
                                    <span className="text-foreground text-sm">
                                        Facture #{initialBill.id} — {getBillingStatusLabel(initialBill.state as BillingStatus)}
                                    </span>
                                    <Link
                                        href={`/admin/bills?bill=${initialBill.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2 whitespace-nowrap"
                                    >
                                        Voir la facture
                                    </Link>
                                </div>
                            ) : (
                                <div className="px-3 py-2 bg-card border border-border rounded-md text-muted-foreground text-sm italic">
                                    Aucune facture associée
                                </div>
                            )}
                        </div>
                    </div>


                    {/* Tarification à la page. La case ne bouge plus une fois la demande
                        sur une facture (le serveur refuse : une pro-forma et une facture
                        standard ne portent pas les mêmes demandes), ni sur une duplication
                        (elle n'a pas de lecture à compter). Les champs se figent avec le
                        coût quand la facture est payée ou soldée. */}
                    <PagePricingFields
                        value={formData.isDuplication ? { ...formData.pagePricing, pageBased: false } : formData.pagePricing}
                        onChange={(pagePricing) => setFormData({ ...formData, pagePricing })}
                        toggleDisabledReason={
                            hasBill
                                ? `Modifiable seulement tant que la demande n'est pas rattachée à une facture (#${initialBill?.id}). Détachez-la d'abord.`
                                : formData.isDuplication
                                    ? "Une duplication n'a pas de lecture : elle ne se tarife pas à la page."
                                    : null
                        }
                        fieldsDisabledReason={
                            costLocked
                                ? `Tarif verrouillé : la facture #${initialBill?.id} est ${initialBill?.state === 'PAID' ? 'payée' : 'soldée'}. Rouvrez-la pour le modifier.`
                                : null
                        }
                    />

                    {/* Cost — dérivé des pages quand la demande est tarifée à la page */}
                    {!pagePricingActive && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Coût</label>
                        <div className="relative">
                            <Input
                                type="text"
                                inputMode="decimal"
                                value={formData.cost}
                                onChange={(e) => setFormData({ ...formData, cost: sanitizeDecimal(e.target.value) })}
                                onBlur={() => setFormData({ ...formData, cost: formatEuro2(formData.cost) })}
                                disabled={costLocked}
                                className={`bg-card border-border text-foreground pr-8 ${costLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                placeholder="0.00"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">€</span>
                        </div>
                        {costLocked && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                Coût verrouillé : la facture #{initialBill?.id} est {initialBill?.state === 'PAID' ? 'payée' : 'soldée'}. Rouvrez-la pour le modifier.
                            </p>
                        )}
                        {tarif && !costLocked && (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                <span className="text-muted-foreground">
                                    Tarif conseillé : <span className="font-medium text-foreground">{tarif.value} €</span>
                                    {' '}({tarif.label})
                                </span>
                                {costDiffersFromTarif && (
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, cost: tarif.value })}
                                        className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                                    >
                                        Appliquer
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Notes</label>
                        <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="bg-card border-border text-foreground min-h-[100px]"
                            placeholder="Ajouter des notes supplémentaires..."
                        />
                    </div>

                    {/* System Information - Read Only */}
                    {selectedStaff && (
                        <div className="space-y-2 pt-4 border-t border-border">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                                Informations système
                            </h3>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">
                                    Traité par
                                </label>
                                <div className="px-3 py-2 bg-card border border-border rounded-md text-muted-foreground cursor-not-allowed opacity-75">
                                    {getUserDisplayName(selectedStaff)}
                                </div>
                                <p className="text-xs text-muted-foreground italic">
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Submit Button */}
                    <div className="space-y-4">
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 border-transparent"
                        >
                            {isLoading ? loadingText : submitButtonText}
                        </Button>

                        {showDelete && onDelete && (
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={isLoading}
                                onClick={handleDeleteClick}
                                className="w-full bg-red-600 hover:bg-red-700 text-white border-red-600 dark:border-red-500"
                            >
                                Supprimer la demande
                            </Button>
                        )}
                    </div>
                    </fieldset>
                </form>
            </CardContent>
        </Card>
        <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
            <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">
                        Rouvrir la demande ?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <p>
                                La date de clôture sera effacée et la demande repassera
                                « {statusName(reopenedStatusId)} ».
                                {!formData.isDuplication && ' L’attribution n’est pas modifiée.'}
                            </p>
                            {statusRollbackDetaches && initialBill && (
                                <p className="text-amber-700 dark:text-amber-400">
                                    La demande figure sur la facture #{initialBill.id} (brouillon) : elle en
                                    sera retirée, et y reviendra une fois close de nouveau.
                                </p>
                            )}
                            {statusRollbackLocked && initialBill && (
                                <p className="text-red-700 dark:text-red-400">
                                    La demande figure sur la facture #{initialBill.id} («&nbsp;
                                    {getBillingStatusLabel(initialBill.state as BillingStatus)}&nbsp;») : elle ne peut
                                    pas être rouverte en l&apos;état. Rouvrez la facture #{initialBill.id} et
                                    retirez-en la demande, puis revenez ici.
                                </p>
                            )}
                            <p>Les autres modifications du formulaire sont enregistrées en même temps.</p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                    placeholder="Raison de la réouverture (optionnel, ajoutée aux notes)"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    className="bg-field border-border text-foreground"
                />
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction disabled={statusRollbackLocked} onClick={handleReopenConfirm}>
                        Rouvrir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <UserActivityGuardDialog
            blocked={activityBlocked}
            role={activityRole}
            onClose={closeActivityGuard}
        />
        </>
    );
}

