import React, { useState, useEffect } from 'react';
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
import { AlertCircle, Calendar } from 'lucide-react';
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
import { useInvalidField } from '@/hooks/useInvalidField';
import { useRecordingCheck } from '@/hooks/useRecordingCheck';
import { useUserActivityGuard } from '@/hooks/useUserActivityGuard';
import { UserActivityGuardDialog } from '@/components/ui/admin/UserActivityGuardDialog';
import { MailingLabelButton } from '@/components/ui/admin/MailingLabelButton';
import { orderLabelReference } from '@/lib/orders/labelReference';
import { UserSearchCombobox } from '@/admin/UserSearchCombobox';
import { BookSearchCombobox } from '@/admin/BookSearchCombobox';
import { BookAudioButton } from '@/admin/BookAudioButton';
import { getUserDisplayName } from '@/lib/users/displayName';
import { STATUS } from '@/lib/statusSync';
import { costSuggestion } from '@/lib/pricing';

// N3 — required fields, visual top→bottom.
const EDIT_FIELD_ORDER = ['aveugleId', 'catalogueId', 'statusId', 'mediaFormatId', 'deliveryMethod'];

export interface User {
    id: number;
    name: string | null;
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
    billingStatus: 'UNBILLED' | 'BILLED' | 'UNBILLABLE';
    lentPhysicalBook: boolean;
    notes: string;
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
    // Linked affectation (read-only context)
    initialAssignment?: OrderAssignment | null;
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
                                     }: OrderFormBackendBaseProps) {
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

    // The « enregistrement audio existe déjà » warning is only meaningful at
    // decision time: on a new demande, or when the admin actively toggles the
    // « Enregistrement nécessaire » box on an existing one. An old demande loaded
    // with the box already checked is usually the very demande that produced the
    // audio file — warning there is noise, so we wait for an actual interaction.
    const [recordingTouched, setRecordingTouched] = useState(false);

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
                billingStatus: 'UNBILLED',
                lentPhysicalBook: false,
                notes: '',
            }
    );

    // Options data
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [mediaFormats, setMediaFormats] = useState<MediaFormat[]>([]);

    // Selected display values
    const [selectedUser, setSelectedUser] = useState<User | null>(initialSelectedUser || null);
    const [selectedBook, setSelectedBook] = useState<Book | null>(initialSelectedBook || null);
    const [selectedStaff, setSelectedStaff] = useState<User | null>(initialSelectedStaff || null);

    // Fetch initial data
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [statusesRes, formatsRes] = await Promise.all([
                    fetch('/api/statuses'),
                    fetch('/api/media-formats'),
                ]);

                if (statusesRes.ok) {
                    const statusesData = await statusesRes.json();
                    setStatuses(statusesData);
                }

                if (formatsRes.ok) {
                    const formatsData = await formatsRes.json();
                    setMediaFormats(formatsData);
                }
            } catch (err) {
                console.error('Error fetching initial data:', err);
                setError('Échec du chargement des options du formulaire');
            }
        };

        fetchInitialData();
    }, []);

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

        const hasAudio = Boolean(full.audio_filepath);
        // Only when we actually auto-check duplication here should the
        // "cochée automatiquement" banner show.
        setDupAutoChecked(hasAudio);
        // Le tarif dépend du poids de l'enregistrement : en changeant de livre on
        // l'aligne sur le nouveau, sinon le coût du livre précédent resterait là
        // sans que personne le remarque. Ça reste une proposition — le champ est
        // libre juste en dessous, et une facture verrouillée n'est jamais touchée.
        const suggested = costSuggestion(full.audioSizeKb);
        setFormData(prev => ({
            ...prev,
            catalogueId: full.id,
            // Audio already exists -> default this to a duplication (not forced;
            // the admin can uncheck it, e.g. for a re-recording / re-read).
            ...(hasAudio ? { isDuplication: true, lentPhysicalBook: false } : {}),
            ...(suggested && !costLocked ? { cost: suggested.value } : {}),
        }));
    };


    const handleDuplicationChange = (checked: boolean) => {
        // The admin is now deciding manually — the auto-check banner no longer applies.
        setDupAutoChecked(false);
        setFormData(prev => {
            // An already-finished demande keeps « Terminé » whichever way this goes.
            const isTermine = prev.statusId === STATUS.TERMINE;

            return {
                ...prev,
                isDuplication: checked,
                lentPhysicalBook: checked ? false : prev.lentPhysicalBook,
                // A duplication is « À faire » until it's done — it never goes to a
                // lecteur, so « En cours » (which used to be set here) said something
                // untrue about it. Un-ticking the box drops back to the recording
                // workflow's first state, since « À faire » is duplication-only and
                // the server would otherwise reject the save.
                statusId: isTermine
                    ? prev.statusId
                    : (checked ? STATUS.A_FAIRE : STATUS.ATTENTE),
            };
        });
    };

    const handleRecordingChange = (checked: boolean) => {
        // The admin is now deciding manually — the auto-check banner no longer applies.
        setDupAutoChecked(false);
        setRecordingTouched(true);
        setFormData(prev => {
            // An already-finished demande keeps « Terminé » whichever way this goes.
            const isTermine = prev.statusId === STATUS.TERMINE;

            return {
                ...prev,
                lentPhysicalBook: checked,
                isDuplication: checked ? false : prev.isDuplication,
                // A demande d'enregistrement starts at « Attente envoi vers lecteur ».
                statusId: (checked && !isTermine) ? STATUS.ATTENTE : prev.statusId,
            };
        });
    };

    // Date de clôture is derived from the statut, never typed by hand: entering
    // « Terminé » stamps today, leaving it clears the date again. Mirrors
    // resolveClosureDate() in lib/statusSync.ts, which is the authority — this
    // only gives the admin immediate feedback in the form. A date already filled
    // in is kept, so a manual correction survives.
    const handleStatusChange = (value: string) => {
        const nextStatusId = parseInt(value);
        setFormData(prev => {
            const wasTermine = prev.statusId === STATUS.TERMINE;
            const isTermine = nextStatusId === STATUS.TERMINE;

            let closureDate = prev.closureDate;
            if (isTermine && !wasTermine && !closureDate) {
                // Local midnight, like every date the calendar picker produces.
                const now = new Date();
                closureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            } else if (wasTermine && !isTermine) {
                closureDate = null;
            }

            return { ...prev, statusId: nextStatusId, closureDate };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        // N3 — collect failing required fields in visual order.
        const invalid: string[] = [];
        if (!formData.aveugleId) invalid.push('aveugleId');
        if (!formData.catalogueId) invalid.push('catalogueId');
        if (!formData.statusId) invalid.push('statusId');
        if (!formData.mediaFormatId) invalid.push('mediaFormatId');
        if (!formData.deliveryMethod) invalid.push('deliveryMethod');

        if (invalid.length) {
            const messages: Record<string, string> = {
                aveugleId: 'Veuillez sélectionner un auditeur',
                catalogueId: 'Veuillez sélectionner un livre',
                statusId: 'Veuillez sélectionner un statut',
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

        // Guard: warn before creating a SECOND active recording demande for this book.
        if (formData.lentPhysicalBook && formData.catalogueId) {
            const res = await checkRecording(formData.catalogueId, currentOrderId);
            if (res && res.activeRecordingCount > 0) {
                const who = res.orders[0]?.aveugle?.name;
                const confirmed = window.confirm(
                    `Il existe déjà ${res.activeRecordingCount === 1
                        ? 'une demande d\u2019enregistrement active'
                        : `${res.activeRecordingCount} demandes d\u2019enregistrement actives`} pour cet ouvrage${who ? ` (ex. ${who})` : ''}.\n\n` +
                    `Voulez-vous vraiment créer une nouvelle demande d\u2019enregistrement pour ce livre ?`
                );
                if (!confirmed) {
                    setIsLoading(false);
                    return;
                }
            }
        }

        try {
            const newOrderId = await onSubmit(formData);
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

    const handleDeleteClick = async () => {
        if (!onDelete) return;

        if (window.confirm('Êtes-vous sûr de vouloir supprimer cette demande ?')) {
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

    const audioAlreadyExists = Boolean(selectedBook?.audio_filepath);

    // Tarif conseillé : 3 € par tranche de 700 Mio entamée (lib/pricing.ts). Null
    // tant que le poids du livre est inconnu — mieux vaut ne rien annoncer qu'un
    // tarif fondé sur un dossier jamais synchronisé.
    const tarif = costSuggestion(selectedBook?.audioSizeKb);
    // On ne signale l'écart que s'il est réel : le champ est saisi à la main, donc
    // « 6 » et « 6.00 » sont le même montant et ne doivent pas déclencher l'alerte.
    const costDiffersFromTarif =
        tarif != null && !costLocked && formatEuro2(formData.cost) !== tarif.value;

    // Active "enregistrement nécessaire" already exists for this book (excluding
    // the order being edited). Checked whenever the book or either type flag
    // changes; result drives an inline warning + a submit-time confirm. The same
    // call answers the duplication side (is a lecteur still holding this book?),
    // hence the isDuplication trigger.
    useEffect(() => {
        if (formData.catalogueId && (formData.lentPhysicalBook || formData.isDuplication)) {
            void checkRecording(formData.catalogueId, currentOrderId);
        }
    }, [formData.catalogueId, formData.lentPhysicalBook, formData.isDuplication, currentOrderId, checkRecording]);

    const recordingDup = formData.lentPhysicalBook
        ? getRecordingFor(formData.catalogueId)
        : null;
    const hasRecordingDup = (recordingDup?.activeRecordingCount ?? 0) > 0;

    // A duplication is normally « À faire » — do it now. The exception is a book
    // with no audio yet because a lecteur is still recording it: nothing can be
    // copied until that comes back. A closed demande is excluded — it waits for
    // nothing. Same rule as the list badge (lib/orders/duplicationBlocked.ts);
    // derived, never stored.
    const demandeIsClosed =
        formData.statusId === STATUS.TERMINE || formData.statusId === STATUS.SOLDE;

    // Only « Terminé » carries a date de clôture, so only « Terminé » lets you pick one.
    // A legacy demande that holds an inconsistent date still displays it (read-only) —
    // the server accepts that pair round-tripped unchanged (guardClosureDateRequiresTermine).
    const isTermine = formData.statusId === STATUS.TERMINE;

    // « En cours » is attribution-driven and can't be chosen here (see the note by
    // the select). A demande already sitting on it keeps it selected — the option
    // is only ever locked *out of*, never *out from under*, the current value.
    const enCoursIsLocked =
        !formData.isDuplication && formData.statusId !== STATUS.EN_COURS;
    // …but only explain it where someone would actually reach for « En cours ».
    // Once the enregistrement is back (« Attente envoi vers auditeur » / « Terminé »)
    // the note below about the expédition is the one that matters, and stacking both
    // just buries it.
    const showEnCoursHint =
        enCoursIsLocked &&
        (formData.statusId === null || formData.statusId === STATUS.ATTENTE);
    const isAttenteAuditeur = formData.statusId === STATUS.ATTENTE_AUDITEUR;
    // Reaching « Attente envoi vers auditeur » normally means the attribution is
    // « Terminé » (guardOrderCompletion), carrying a date d'envoi and une date de
    // retour — walking the demande back to « Attente envoi vers lecteur » would
    // contradict those attribution-owned dates, and the server refuses it
    // (guardDemandeStatusSync). That guard only fires when an attribution is
    // actually linked, so mirror it exactly: a demande with no attribution at all
    // (data edited outside the guarded API) has nothing to contradict and the
    // server would accept the change — don't lock it here either.
    const attenteIsLocked =
        isAttenteAuditeur &&
        !!initialAssignment &&
        (!!initialAssignment.sentToReaderDate || !!initialAssignment.returnedToECADate);
    const blockingRecording =
        formData.isDuplication && !audioAlreadyExists && !demandeIsClosed
            ? getRecordingFor(formData.catalogueId)?.blockingRecording ?? null
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
                        <AlertDescription className="text-red-200">{error}</AlertDescription>
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
                            Cette demande figure sur la facture #{initialBill.id} (
                            {getBillingStatusLabel(initialBill.state as BillingStatus).toLowerCase()}), déjà
                            imprimée et envoyée à l&apos;auditeur. Le livre, la date et le coût restent
                            modifiables — le document devra alors être réimprimé. L&apos;auditeur et le
                            retour en arrière du statut sont verrouillés : rouvrez la facture et
                            retirez-en la demande pour y toucher.
                        </AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
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
                        />
                        {hasBill && initialBill && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                Auditeur verrouillé : la demande figure sur la facture #{initialBill.id}, qui
                                appartient à cet auditeur.{' '}
                                {billIssued
                                    ? 'Rouvrez la facture et retirez-en la demande pour le modifier.'
                                    : 'Retirez-la de la facture pour le modifier.'}
                            </p>
                        )}
                        {/* The envelope this demande will go back in. Sits under the
                            auditeur — the person being written to — the same way the
                            audio button sits under the livre. */}
                        {selectedUser && (
                            <MailingLabelButton
                                userId={selectedUser.id}
                                cecogramme
                                reference={
                                    currentOrderId
                                        ? orderLabelReference({
                                            orderId: currentOrderId,
                                            title: selectedBook?.title,
                                            isDuplication: formData.isDuplication,
                                        })
                                        : null
                                }
                                className="h-8 px-2.5 text-xs"
                            />
                        )}
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

                    {/* Closure Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Date de clôture</label>
                        <p className="text-xs text-muted-foreground">
                            Date à laquelle la demande terminée est expédiée à l&apos;auditeur (clôture).
                            Renseignée automatiquement au passage au statut « Terminé » et effacée si la
                            demande en ressort — modifiez-la seulement pour corriger le jour.
                            {!isTermine && ' Seule une demande « Terminé » peut porter une date de clôture.'}
                        </p>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    disabled={!isTermine}
                                    className="w-full justify-start text-left bg-field border-border text-foreground hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {formData.closureDate ? (
                                        format(formData.closureDate, 'PPP', { locale: fr })
                                    ) : (
                                        <span>Sélectionner une date</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-card border-border">
                                <CalendarComponent
                                    mode="single"
                                    selected={formData.closureDate || undefined}
                                    onSelect={(date) => setFormData({ ...formData, closureDate: date || null })}
                                    initialFocus
                                    className="bg-card text-foreground"
                                />
                            </PopoverContent>
                        </Popover>
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
                                            ? `, envoyé le ${new Date(blockingRecording.sentToReaderDate).toLocaleDateString('fr-FR')}`
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
                                {audioAlreadyExists && formData.lentPhysicalBook && (!currentOrderId || recordingTouched) && (
                                    <p className="mt-2 ml-9 text-sm text-amber-700 dark:text-amber-400">
                                        Attention : un enregistrement audio existe déjà pour cet ouvrage.
                                        Vérifiez qu&apos;un nouvel enregistrement est réellement nécessaire
                                        avant de poursuivre — il s&apos;agit peut-être plutôt d&apos;une duplication.
                                    </p>
                                )}
                                {hasRecordingDup && (
                                    <p className="mt-2 ml-9 text-sm text-amber-700 dark:text-amber-400">
                                        Il existe déjà {recordingDup!.activeRecordingCount === 1
                                            ? 'une demande d\u2019enregistrement active'
                                            : `${recordingDup!.activeRecordingCount} demandes d\u2019enregistrement actives`}{' '}
                                        pour cet ouvrage
                                        {recordingDup!.orders[0]?.aveugle?.name
                                            ? ` (ex. ${recordingDup!.orders[0].aveugle!.name})`
                                            : ''}. Êtes-vous sûr de vouloir en créer une nouvelle&nbsp;?
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Statut <span className="text-red-500">*</span>
                        </label>
                        <Select
                            value={formData.statusId?.toString() || ''}
                            onValueChange={handleStatusChange}
                        >
                            <SelectTrigger ref={registerField('statusId')} className="bg-field border-border text-foreground hover:bg-muted transition-colors">
                                <SelectValue placeholder="Sélectionner un statut" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border max-h-[280px] overflow-y-auto">
                                <div className="py-1">
                                    {/* « Soldé » is a facture status, not a demande status — only a
                                        facture may be soldée. No exception for a legacy demande: no
                                        demande in production holds it, so it is never offered, full stop
                                        (guardOrderStatus rejects it server-side too).

                                        A duplication has a two-state lifecycle, « À faire » → « Terminé »:
                                        it owns no attribution, so the statuts that describe a book sitting
                                        with a lecteur are never offered on one. Conversely « À faire » is
                                        duplication-only — an enregistrement starts at « Attente envoi vers
                                        lecteur », which already means "à faire" and names the action. */}
                                    {statuses
                                        .filter((status) => {
                                            if (status.id === STATUS.SOLDE) return false;
                                            // Whatever else the demande already holds stays visible, so a
                                            // legacy row never opens on a blank required field.
                                            if (status.id === formData.statusId) return true;
                                            if (formData.isDuplication) {
                                                return status.id === STATUS.A_FAIRE || status.id === STATUS.TERMINE;
                                            }
                                            return status.id !== STATUS.A_FAIRE;
                                        })
                                        .map((status) => (
                                            <SelectItem
                                                key={status.id}
                                                value={status.id.toString()}
                                                disabled={
                                                    (enCoursIsLocked && status.id === STATUS.EN_COURS) ||
                                                    (attenteIsLocked && status.id === STATUS.ATTENTE) ||
                                                    (statusRollbackLocked && status.id !== STATUS.TERMINE)
                                                }
                                                className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer pl-8 pr-3 py-2.5 border-b border-border/50 last:border-b-0 transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                                            >
                                                <span className="font-medium">{status.name}</span>
                                            </SelectItem>
                                        ))}
                                </div>
                            </SelectContent>
                        </Select>
                        {/* « En cours » décrit un livre parti chez un lecteur : ce sont
                            l'attribution et sa date d'envoi qui le rendent vrai, pas ce
                            menu. L'option reste visible mais désactivée — la masquer
                            laisserait croire à un oubli au lieu d'expliquer la règle.
                            Le serveur la refuse aussi (guardManualEnCours) : ceci n'est
                            que le rappel de tous les jours. */}
                        {statusRollbackLocked && initialBill && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                Statut verrouillé : la facture #{initialBill.id} annonce cette prestation
                                comme rendue et elle est déjà partie. Rouvrez-la et retirez-en la demande
                                pour la rouvrir à son tour.
                            </p>
                        )}
                        {statusRollbackDetaches && initialBill && (
                            <p className="text-xs text-muted-foreground">
                                Sortir de « Terminé » retirera la demande de la facture #{initialBill.id}
                                {' '}(brouillon) et son montant du total — c&apos;est « Terminé » qui
                                l&apos;y avait mise.
                            </p>
                        )}
                        {showEnCoursHint && (
                            <p className="text-xs text-muted-foreground">
                                « En cours » suit l&apos;attribution : renseignez-y le lecteur et la date
                                d&apos;envoi, la demande passera « En cours » automatiquement.
                            </p>
                        )}
                        {isAttenteAuditeur && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                L&apos;enregistrement est revenu du lecteur mais n&apos;a pas encore été
                                expédié à l&apos;auditeur. Passez la demande « Terminé » le jour de
                                l&apos;expédition — c&apos;est ce jour-là qui devient la date de clôture.
                                {attenteIsLocked && (
                                    <> « Attente envoi vers lecteur » est verrouillé : l&apos;attribution
                                    est déjà « Terminé », avec sa date d&apos;envoi et sa date de retour.</>
                                )}
                            </p>
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
                                « Non facturable » indisponible : la demande figure sur la facture #
                                {initialBill.id} et son montant y est compté.{' '}
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

                    {/* Affectation liée — read-only. Hidden for duplications:
                        a duplication never has an affectation, so showing it confuses the team. */}
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
                                    Aucune attribution
                                </div>
                            )}
                        </div>
                    )}

                    {/* Cost */}
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

