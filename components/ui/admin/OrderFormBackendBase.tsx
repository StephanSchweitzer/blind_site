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
import { UserSearchCombobox } from '@/admin/UserSearchCombobox';
import { BookSearchCombobox } from '@/admin/BookSearchCombobox';
import { BookAudioButton } from '@/admin/BookAudioButton';
import { getUserDisplayName } from '@/lib/users/displayName';

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

    // Cost is locked while the linked bill is finalized (payée/soldée); reopen to edit.
    const costLocked = initialBill?.state === 'PAID' || initialBill?.state === 'SOLDE';

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
        setFormData(prev => ({
            ...prev,
            catalogueId: full.id,
            // Audio already exists -> default this to a duplication (not forced;
            // the admin can uncheck it, e.g. for a re-recording / re-read).
            ...(hasAudio ? { isDuplication: true, lentPhysicalBook: false } : {}),
        }));
    };


    const handleDuplicationChange = (checked: boolean) => {
        // The admin is now deciding manually — the auto-check banner no longer applies.
        setDupAutoChecked(false);
        setFormData(prev => {
            // Check if current status is "Terminé"
            const currentStatus = statuses.find(s => s.id === prev.statusId);
            const isTerminated = currentStatus?.name.toLowerCase().includes('terminé');

            return {
                ...prev,
                isDuplication: checked,
                lentPhysicalBook: checked ? false : prev.lentPhysicalBook,
                // Set status to "en cours" when duplication is selected, but only if not already "Terminé"
                statusId: (checked && !isTerminated)
                    ? statuses.find(s => s.name.toLowerCase().includes('en cours'))?.id || prev.statusId
                    : prev.statusId
            };
        });
    };

    const handleRecordingChange = (checked: boolean) => {
        // The admin is now deciding manually — the auto-check banner no longer applies.
        setDupAutoChecked(false);
        setRecordingTouched(true);
        setFormData(prev => {
            // Check if current status is "Terminé"
            const currentStatus = statuses.find(s => s.id === prev.statusId);
            const isTerminated = currentStatus?.name.toLowerCase().includes('terminé');

            return {
                ...prev,
                lentPhysicalBook: checked,
                isDuplication: checked ? false : prev.isDuplication,
                // Set status to "attente d'envoie vers lecteur" when recording is selected, but only if not already "Terminé"
                statusId: (checked && !isTerminated)
                    ? statuses.find(s => s.name.toLowerCase().includes('attente') && s.name.toLowerCase().includes('lecteur'))?.id || prev.statusId
                    : prev.statusId
            };
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

    // Active "enregistrement nécessaire" already exists for this book (excluding
    // the order being edited). Checked whenever the book or the recording flag
    // changes; result drives an inline warning + a submit-time confirm.
    useEffect(() => {
        if (formData.catalogueId && formData.lentPhysicalBook) {
            void checkRecording(formData.catalogueId, currentOrderId);
        }
    }, [formData.catalogueId, formData.lentPhysicalBook, currentOrderId, checkRecording]);

    const recordingDup = formData.lentPhysicalBook
        ? getRecordingFor(formData.catalogueId)
        : null;
    const hasRecordingDup = (recordingDup?.activeRecordingCount ?? 0) > 0;

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

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* User Search (Aveugle) */}
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
                        <label className="text-sm font-medium text-foreground">Date de cloture</label>
                        <p className="text-xs text-muted-foreground">Date à laquelle la demande terminée est expédiée à l&apos;auditeur (clôture).</p>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left bg-field border-border text-foreground hover:bg-muted"
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
                                        Enregistrement nécessaire
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
                            onValueChange={(value) => setFormData({ ...formData, statusId: parseInt(value) })}
                        >
                            <SelectTrigger ref={registerField('statusId')} className="bg-field border-border text-foreground hover:bg-muted transition-colors">
                                <SelectValue placeholder="Sélectionner un statut" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border max-h-[280px] overflow-y-auto">
                                <div className="py-1">
                                    {statuses.map((status) => (
                                        <SelectItem
                                            key={status.id}
                                            value={status.id.toString()}
                                            className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer pl-8 pr-3 py-2.5 border-b border-border/50 last:border-b-0 transition-colors"
                                        >
                                            <span className="font-medium">{status.name}</span>
                                        </SelectItem>
                                    ))}
                                </div>
                            </SelectContent>
                        </Select>
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
                                            className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer pl-8 pr-3 py-2.5 transition-colors"
                                        >
                                            <span className="font-medium">Non facturable</span>
                                        </SelectItem>
                                    </div>
                                </SelectContent>
                            </Select>
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
                                                <span> — Lecteur : <span className="text-foreground">{initialAssignment.reader.name ?? 'Sans nom'}</span></span>
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

