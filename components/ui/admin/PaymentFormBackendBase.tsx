'use client';

import { StickySubmitBar } from '@/components/ui/admin/StickySubmitBar';
import React, { useEffect, useState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RequiredMark } from "@/components/ui/admin/RequiredMark";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { X, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DatePickerField } from '@/components/ui/admin/DatePickerField';
import {
    PaymentType,
    PaymentMethod,
    getPaymentTypeLabel,
    getPaymentMethodLabel,
    isClientRequiredForPaymentType,
    getPaymentClientFieldLabel,
    getPaymentClientSearchPlaceholder,
} from '@/lib/payment-enums';
import { markToasted, useFormToast } from '@/hooks/useFormToast';
import { useInvalidField } from '@/hooks/useInvalidField';
import { UserSearchCombobox } from '@/admin/UserSearchCombobox';
import { BillSearchCombobox, type BillSearchResult } from '@/admin/BillSearchCombobox';
import { PaymentStatusSteps } from '@/admin/PaymentStatusSteps';
import { isRequestablePaymentType } from '@/lib/payments/status';
import { parisDateDisplay } from '@/lib/paris-day';

// N3 — required fields, visual top→bottom (client picker, linked bill, amount).
const FIELD_ORDER = ['client', 'bill', 'amount', 'paymentDate'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
}

type BillOption = BillSearchResult;

export interface PaymentFormData {
    clientId: number | null;
    type: PaymentType;
    amount: number;
    paymentMethod: PaymentMethod | null;
    creationDate: Date;
    issueDate: Date | null;
    paymentDate: Date | null;
    requestDate: Date | null;
    paymentReference: string | null;
    receiptNumber: string | null;
    fiscalite: string | null;
    cotisationYear: number | null;
    comptable: string | null;
    isAllocated: boolean | null;
    allocationDate: Date | null;
    observations: string | null;
    billId: number | null;
}

export interface PaymentFormInitialData {
    type: PaymentType;
    amount: string | number;
    paymentMethod: PaymentMethod | null;
    creationDate: string;
    issueDate: string | null;
    paymentDate: string | null;
    requestDate: string | null;
    paymentReference: string | null;
    receiptNumber: string | null;
    fiscalite: string | null;
    cotisationYear: number | null;
    comptable: string | null;
    isAllocated: boolean | null;
    allocationDate: string | null;
    observations: string | null;
    client: User | null;
    bill: BillOption | null;
}

/**
 * Une saisie amorcée depuis la fiche d'une facture : le client, la facture et
 * le reste à payer sont déjà connus là-bas, les redemander serait les faire
 * ressaisir — et laisser choisir une AUTRE facture depuis le bouton d'une
 * facture précise.
 */
export interface PaymentFormPreset {
    client: User;
    bill: BillOption;
    /** Le reste à encaisser, pré-rempli — corrigeable pour un acompte. */
    amount?: string | number | null;
}

interface PaymentFormBackendBaseProps {
    onSubmit: (formData: PaymentFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    onSuccess?: (paymentId: number) => void;
    initialData?: PaymentFormInitialData;
    initialClient?: User | null;
    preset?: PaymentFormPreset | null;
    /**
     * Un reçu a été émis et l'utilisateur n'est pas super admin : ce que le reçu
     * imprime ne se modifie plus (RECEIPT_LOCKED_FIELDS, lib/payments/status.ts).
     * La route refuse de toute façon ; le formulaire le montre avant qu'on essaie.
     */
    locked?: boolean;
    /**
     * Le formulaire diffère-t-il de ce qu'il a reçu ? Pour la fenêtre du paiement,
     * dont les documents s'impriment depuis la version enregistrée
     * (PaymentDocumentActions, useUnsavedPrintGuard).
     */
    onDirtyChange?: (dirty: boolean) => void;
}

const NONE = 'NONE';

const dateKey = (d: Date | null) => (d ? d.getTime() : null);
// « Comptable » used to be a third choice — the field's own label offered as a
// value — and no payment ever carried it.
const COMPTABLE_OPTIONS = ['ECA', 'AUXILIAIRES'] as const;

export function PaymentFormBackendBase({
                                           onSubmit,
                                           submitButtonText,
                                           loadingText,
                                           onSuccess,
                                           initialData,
                                           initialClient,
                                           preset = null,
                                           locked = false,
                                           onDirtyChange,
                                       }: PaymentFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const { toastError, toastFailure } = useFormToast();
    const { registerField, focusFirstInvalid } = useInvalidField();
    // Préfixe des ids qui relient chaque libellé obligatoire à son champ.
    const uid = useId();
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Un preset désigne une facture : le type ne peut être qu'« Enregistrement ».
    const [type, setType] = useState<PaymentType>(
        initialData?.type ?? (preset ? PaymentType.ENREGISTREMENT : PaymentType.COTISATION)
    );
    const [selectedClient, setSelectedClient] = useState<User | null>(
        initialData?.client ?? preset?.client ?? initialClient ?? null
    );
    const [amount, setAmount] = useState<string>(
        initialData ? String(initialData.amount) : preset?.amount != null ? String(preset.amount) : ''
    );
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(initialData?.paymentMethod ?? '');
    const [creationDate, setCreationDate] = useState<Date>(
        initialData?.creationDate ? new Date(initialData.creationDate) : new Date()
    );
    const [issueDate, setIssueDate] = useState<Date | null>(
        initialData?.issueDate ? new Date(initialData.issueDate) : null
    );
    // Une saisie neuve est datée du jour : c'est un encaissement tant qu'on ne dit
    // pas « À demander ». Avant les statuts, le champ partait vide et la date de
    // création tenait lieu de date de paiement ; une date vide voudrait
    // maintenant dire « pas encore reçu » (lib/payments/status.ts).
    const [paymentDate, setPaymentDate] = useState<Date | null>(
        initialData ? (initialData.paymentDate ? new Date(initialData.paymentDate) : null) : new Date()
    );
    const [requestDate, setRequestDate] = useState<Date | null>(
        initialData?.requestDate ? new Date(initialData.requestDate) : null
    );
    // « Déjà reçu » ou « À demander » : le seul choix qui ne soit pas une date,
    // parce qu'une date de paiement vide ne se voit pas — un champ oublié et une
    // demande de paiement auraient la même tête. Proposé sur les seuls types
    // qu'on demande (isRequestablePaymentType) ; les autres sont toujours reçus.
    const [received, setReceived] = useState<boolean>(initialData ? !!initialData.paymentDate : true);
    const requestable = isRequestablePaymentType(type);
    const isReceived = !requestable || received;

    const handleReceivedChange = (next: boolean) => {
        setReceived(next);
        // Revenir à « Déjà reçu » sans date reprend le jour même, comme une saisie neuve.
        if (next && !paymentDate) setPaymentDate(new Date());
    };
    const [paymentReference, setPaymentReference] = useState(initialData?.paymentReference ?? '');
    const [receiptNumber, setReceiptNumber] = useState(initialData?.receiptNumber ?? '');
    // « N° de reçu » et « Date d'émission » ne se proposent plus à la saisie :
    // relevé le 20/10/2026, aucun des 28 paiements des six derniers mois n'en
    // portait — ce sont des colonnes de la reprise Gestconte. Ils restent
    // visibles, et modifiables, sur un paiement qui en a. Pour les rendre à
    // tous : `true` ici.
    const showReceiptFields = Boolean(initialData?.receiptNumber || initialData?.issueDate);

    // Une modification n'écrit que ce que le permanent a TOUCHÉ.
    //
    // Le formulaire renvoie tous les champs à chaque enregistrement, et trois
    // d'entre eux étaient réécrits sans que personne y touche : une cotisation
    // ancienne, sans année, prenait l'année en cours — et comptait dès lors
    // comme à jour pour l'année entière (lib/cotisation.ts) ; une fiscalité
    // « oui » ou « non » devenait « OUI » ; un « Affectée » jamais renseigné
    // devenait « non », et emportait sa date d'attribution. Corriger une
    // observation suffisait. L'année en cours reste proposée, mais à la création
    // seulement ; les deux cases, elles, renvoient la valeur d'origine tant
    // qu'on ne les a pas changées.
    const [cotisationYear, setCotisationYear] = useState<string>(
        initialData
            ? (initialData.cotisationYear != null ? String(initialData.cotisationYear) : '')
            : String(new Date().getFullYear())
    );
    const [observations, setObservations] = useState(initialData?.observations ?? '');
    const initialFiscalite = initialData?.fiscalite ?? null;
    const [fiscalite, setFiscalite] = useState<boolean>(Boolean(initialFiscalite));
    const [comptable, setComptable] = useState<string>(initialData?.comptable ?? '');
    const initialIsAllocated = initialData?.isAllocated ?? null;
    const [isAllocated, setIsAllocated] = useState<boolean>(initialIsAllocated ?? false);
    const [allocationDate, setAllocationDate] = useState<Date | null>(
        initialData?.allocationDate ? new Date(initialData.allocationDate) : null
    );

    // Bill of the selected client (only for ENREGISTREMENT) — the combobox
    // fetches its own candidates from /api/bills, scoped to selectedClient.id.
    const [selectedBill, setSelectedBill] = useState<BillOption | null>(
        initialData?.bill ?? preset?.bill ?? null
    );

    // Tout ce que le formulaire peut changer, en une chaîne comparable. Celle du
    // premier rendu sert de référence : la fenêtre remonte le formulaire (sa clé)
    // chaque fois que le paiement enregistré change.
    const snapshot = JSON.stringify([
        type, selectedClient?.id ?? null, amount, paymentMethod, dateKey(creationDate), dateKey(issueDate),
        received, dateKey(paymentDate), dateKey(requestDate), paymentReference, receiptNumber, cotisationYear,
        observations, fiscalite, comptable, isAllocated, dateKey(allocationDate), selectedBill?.id ?? null,
    ]);
    const [initialSnapshot] = useState(snapshot);
    const dirty = snapshot !== initialSnapshot;
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    const handleClientSelect = (user: User) => {
        setSelectedClient(user);
        setSelectedBill(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const amt = parseFloat(amount.replace(',', '.'));

        // N3 — collect failing fields in visual order, then toast + focus the first.
        const invalid: string[] = [];
        const clientRequired = isClientRequiredForPaymentType(type);
        if (clientRequired && !selectedClient) invalid.push('client');
        if (type === PaymentType.ENREGISTREMENT && selectedClient && !selectedBill) invalid.push('bill');
        if (!Number.isFinite(amt) || amt <= 0) invalid.push('amount');
        if (isReceived && !paymentDate) invalid.push('paymentDate');

        if (invalid.length) {
            const messages: Record<string, string> = {
                client: `Un ${getPaymentClientFieldLabel(type).toLowerCase()} est requis pour ce type de paiement`,
                bill: 'Veuillez sélectionner la facture liée à cet enregistrement',
                amount: 'Veuillez saisir un montant positif',
                paymentDate: 'Veuillez saisir la date de paiement',
            };
            // First in FIELD_ORDER among the invalid set → topmost message.
            const firstName = FIELD_ORDER.find((n) => invalid.includes(n)) ?? invalid[0];
            const msg = messages[firstName];
            toastError(msg);
            focusFirstInvalid(FIELD_ORDER, new Set(invalid), msg);
            return;
        }

        // Les deux cases, à leur valeur d'origine tant qu'on ne les a pas changées.
        const fiscaliteUntouched = fiscalite === Boolean(initialFiscalite);
        const allocationUntouched = isAllocated === (initialIsAllocated ?? false);

        setIsLoading(true);
        try {
            const paymentId = await onSubmit({
                clientId: selectedClient?.id ?? null,
                type,
                amount: amt,
                paymentMethod: paymentMethod || null,
                creationDate,
                issueDate,
                // À demander : ni date ni référence de règlement — il n'y en a
                // pas encore. La méthode, elle, peut déjà être connue.
                paymentDate: isReceived ? paymentDate : null,
                requestDate: requestable ? requestDate : null,
                paymentReference: isReceived ? paymentReference.trim() || null : null,
                receiptNumber: receiptNumber.trim() || null,
                fiscalite: fiscaliteUntouched ? initialFiscalite : fiscalite ? 'OUI' : null,
                cotisationYear:
                    type === PaymentType.COTISATION && cotisationYear ? parseInt(cotisationYear) : null,
                comptable: comptable || null,
                // `initialData` : à la création, « non » reste la valeur par défaut.
                isAllocated: allocationUntouched && initialData ? initialIsAllocated : isAllocated,
                // Vidée seulement quand on DÉCOCHE « Affectée » ; intacte, la date
                // d'origine repart telle quelle, cochée ou non.
                allocationDate: isAllocated || allocationUntouched ? allocationDate : null,
                observations: observations.trim() || null,
                billId: type === PaymentType.ENREGISTREMENT ? selectedBill?.id ?? null : null,
            });
            if (onSuccess) onSuccess(paymentId);
        } catch (err) {
            toastFailure(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {locked && initialData?.receiptNumber && (
                        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                            Reçu n° {initialData.receiptNumber}
                            {initialData.issueDate ? ` émis le ${parisDateDisplay(new Date(initialData.issueDate))}` : ''} :
                            le montant, le type, la personne, les dates et la référence ne se modifient plus.
                            Les observations et les détails comptables restent modifiables.
                        </p>
                    )}

                    {/* Un fieldset désactivé désactive d'un coup tous les contrôles qu'il
                        contient — sélecteurs Radix et calendriers compris, qui sont des
                        boutons. */}
                    <fieldset disabled={locked} className="space-y-4 min-w-0 disabled:opacity-70">
                    {/* Type */}
                    <div className="space-y-2">
                        <label id={`${uid}-type-label`} className="text-sm font-medium text-foreground">
                            Type <RequiredMark />
                        </label>
                        <Select value={type} onValueChange={(v) => setType(v as PaymentType)}>
                            <SelectTrigger id={`${uid}-type`} aria-labelledby={`${uid}-type-label ${uid}-type`} className="bg-field border-border text-foreground hover:bg-muted transition-colors">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                {Object.values(PaymentType).map((t) => (
                                    <SelectItem
                                        key={t}
                                        value={t}
                                        className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer py-2.5"
                                    >
                                        {getPaymentTypeLabel(t)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Reçu ou à demander — seulement pour les types qu'on demande
                        (cotisation, divers). Juste sous le type, parce qu'il décide
                        des champs qui suivent comme le type le fait. */}
                    {requestable && (
                        <div className="space-y-2">
                            <span id="payment-received-label" className="text-sm font-medium text-foreground">Ce paiement est</span>
                            <div role="group" aria-labelledby="payment-received-label" className="grid grid-cols-2 gap-1 sm:max-w-sm">
                                {[
                                    { value: true, label: 'Déjà reçu' },
                                    { value: false, label: 'À demander' },
                                ].map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        aria-pressed={received === opt.value}
                                        onClick={() => handleReceivedChange(opt.value)}
                                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                                            received === opt.value
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-card text-foreground border-border hover:bg-muted'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <PaymentStatusSteps
                                creationDate={creationDate}
                                requestDate={requestDate}
                                paymentDate={isReceived ? paymentDate : null}
                            />
                        </div>
                    )}

                    {/* Client */}
                    <div className="space-y-2">
                        <label id={`${uid}-client-label`} className="text-sm font-medium text-foreground">
                            {getPaymentClientFieldLabel(type)}
                            {isClientRequiredForPaymentType(type) ? (
                                <> <RequiredMark /></>
                            ) : (
                                <span className="text-muted-foreground text-xs font-normal"> (facultatif)</span>
                            )}
                        </label>
                        <div className="flex gap-2">
                            <div className="flex-1 min-w-0">
                                <UserSearchCombobox<User>
                                    value={selectedClient}
                                    onSelect={handleClientSelect}
                                    triggerRef={registerField('client')}
                                    labelledBy={`${uid}-client-label`}
                                    placeholder={getPaymentClientSearchPlaceholder(type)}
                                    viewHref={(user) => `/admin/users/dossier/${user.id}`}
                                />
                            </div>
                            {selectedClient && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => { setSelectedClient(null); setSelectedBill(null); }}
                                    className="bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground px-3"
                                    title="Retirer le client"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Bill link (ENREGISTREMENT only) */}
                    {type === PaymentType.ENREGISTREMENT && selectedClient && (
                        <div className="space-y-2">
                            <label id={`${uid}-bill-label`} className="text-sm font-medium text-foreground">
                                Facture liée <RequiredMark />
                            </label>
                            <BillSearchCombobox<BillOption>
                                value={selectedBill}
                                onSelect={setSelectedBill}
                                clientId={selectedClient.id}
                                triggerRef={registerField('bill')}
                                labelledBy={`${uid}-bill-label`}
                                excludeDrafts
                                viewHref={(bill) => `/admin/bills?bill=${bill.id}`}
                            />
                        </div>
                    )}

                    {/* Cotisation year (COTISATION only) — what the payment is for, like the bill link above. */}
                    {type === PaymentType.COTISATION && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Année de cotisation</label>
                            <Input
                                inputMode="numeric"
                                value={cotisationYear}
                                onChange={(e) => setCotisationYear(e.target.value.replace(/\D/g, ''))}
                                placeholder="2024"
                                className="bg-field border-border text-foreground"
                            />
                        </div>
                    )}

                    {/* Amount */}
                    <div className="space-y-2">
                        <label htmlFor={`${uid}-amount`} className="text-sm font-medium text-foreground">
                            Montant <RequiredMark />
                        </label>
                        <div className="relative">
                            <Input
                                id={`${uid}-amount`}
                                ref={registerField('amount')}
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0,00"
                                className="bg-card border-border text-foreground pr-8"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                        </div>
                    </div>

                    {/* Méthode et référence côte à côte : la référence dépend de la méthode
                        (n° de chèque, référence de virement…). */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                        {/* Payment method */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Méthode de paiement</label>
                            <Select
                                value={paymentMethod || NONE}
                                onValueChange={(v) => setPaymentMethod(v === NONE ? '' : (v as PaymentMethod))}
                            >
                                <SelectTrigger className="bg-field border-border text-foreground hover:bg-muted">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value={NONE} className="text-muted-foreground hover:bg-muted focus:bg-muted cursor-pointer">
                                        Non renseignée
                                    </SelectItem>
                                    {Object.values(PaymentMethod).map((m) => (
                                        <SelectItem
                                            key={m}
                                            value={m}
                                            className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer"
                                        >
                                            {getPaymentMethodLabel(m)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Payment reference — saisie ICI et nulle part ailleurs.
                            La facture liée la reprend (syncBillPaymentInfo) : c'est
                            pourquoi le formulaire des factures ne la demande plus.
                            Pas de référence sur un paiement à demander : il n'y a
                            pas encore de chèque ni de virement. */}
                        {isReceived && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Référence de paiement</label>
                                <Input
                                    value={paymentReference}
                                    onChange={(e) => setPaymentReference(e.target.value)}
                                    placeholder="N° de chèque, référence de virement…"
                                    className="bg-field border-border text-foreground"
                                />
                            </div>
                        )}
                    </div>

                    {/* Dates, dans l'ordre de la vie du paiement : création, demande,
                        règlement. La date de la demande ne se montre sur un paiement
                        reçu que s'il a d'abord été demandé — sinon elle n'a rien à
                        dire, et c'est le cas de presque tous. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Date de création</label>
                            <DatePickerField value={creationDate} onChange={(d) => d && setCreationDate(d)} />
                        </div>
                        {requestable && (!isReceived || requestDate) && (
                            <div className="space-y-2">
                                <label htmlFor="payment-request-date" className="text-sm font-medium text-foreground">
                                    Date de la demande
                                    {!isReceived && (
                                        <span className="text-muted-foreground text-xs font-normal"> (vide tant qu&apos;elle n&apos;est pas partie)</span>
                                    )}
                                </label>
                                <DatePickerField
                                    id="payment-request-date"
                                    value={requestDate}
                                    onChange={setRequestDate}
                                    clearable
                                    placeholder="Pas encore envoyée"
                                />
                            </div>
                        )}
                        {isReceived && (
                            <div className="space-y-2">
                                <label id={`${uid}-payment-date-label`} htmlFor="payment-date" className="text-sm font-medium text-foreground">
                                    Date de paiement <RequiredMark />
                                </label>
                                <DatePickerField
                                    id="payment-date"
                                    labelledBy={`${uid}-payment-date-label`}
                                    value={paymentDate}
                                    onChange={setPaymentDate}
                                    triggerRef={registerField('paymentDate')}
                                />
                            </div>
                        )}
                    </div>

                    </fieldset>

                    {/* Observations */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Observations</label>
                        <textarea
                            value={observations}
                            onChange={(e) => setObservations(e.target.value)}
                            rows={2}
                            placeholder="Notes libres…"
                            className="w-full rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                        />
                    </div>

                    {/* Advanced / accounting details */}
                    <div className="border-t border-border pt-3">
                        <button
                            type="button"
                            onClick={() => setShowAdvanced((v) => !v)}
                            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                        >
                            <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                            Détails comptables
                        </button>

                        {showAdvanced && (
                            <div className="mt-3 space-y-4">
                                {showReceiptFields && (
                                <fieldset disabled={locked} className="min-w-0 disabled:opacity-70">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">N° de reçu</label>
                                        <Input
                                            value={receiptNumber}
                                            onChange={(e) => setReceiptNumber(e.target.value)}
                                            className="bg-field border-border text-foreground"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Date d&apos;émission</label>
                                        <DatePickerField value={issueDate} onChange={setIssueDate} />
                                    </div>
                                </div>
                                </fieldset>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Comptable</label>
                                    <Select
                                        value={comptable || NONE}
                                        onValueChange={(v) => setComptable(v === NONE ? '' : v)}
                                    >
                                        <SelectTrigger className="bg-field border-border text-foreground hover:bg-muted">
                                            <SelectValue placeholder="Non renseigné" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value={NONE} className="text-muted-foreground hover:bg-muted focus:bg-muted cursor-pointer">
                                                Non renseigné
                                            </SelectItem>
                                            {COMPTABLE_OPTIONS.map((c) => (
                                                <SelectItem
                                                    key={c}
                                                    value={c}
                                                    className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer"
                                                >
                                                    {c}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                                    <Checkbox
                                        checked={fiscalite}
                                        onCheckedChange={(c) => setFiscalite(!!c)}
                                        className="border-2 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                    />
                                    Fiscalité (reçu fiscal applicable)
                                </label>

                                <div className="space-y-3">
                                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                                        <Checkbox
                                            checked={isAllocated}
                                            onCheckedChange={(c) => setIsAllocated(!!c)}
                                            className="border-2 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        />
                                        Affectée
                                    </label>
                                    {isAllocated && (
                                        <div className="space-y-2">
                                            {/* « attribution » était le mot des attributions de
                                                livres : c'est la date de la case « Affectée ». */}
                                            <label className="text-sm font-medium text-foreground">Affectée le</label>
                                            <DatePickerField value={allocationDate} onChange={setAllocationDate} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <StickySubmitBar>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            variant="save" className="w-full"
                        >
                            {isLoading
                                ? loadingText
                                : !initialData && !isReceived
                                    ? 'Créer la demande de paiement'
                                    : submitButtonText}
                        </Button>
                    </StickySubmitBar>
                </form>
            </div>
    );
}

// ─── API body serialization (shared by Add + Edit wrappers) ────────────────────

export function paymentFormDataToApiBody(d: PaymentFormData) {
    return {
        clientId: d.clientId,
        type: d.type,
        amount: d.amount,
        paymentMethod: d.paymentMethod,
        creationDate: d.creationDate.toISOString(),
        issueDate: d.issueDate?.toISOString() ?? null,
        paymentDate: d.paymentDate?.toISOString() ?? null,
        requestDate: d.requestDate?.toISOString() ?? null,
        allocationDate: d.allocationDate?.toISOString() ?? null,
        paymentReference: d.paymentReference,
        receiptNumber: d.receiptNumber,
        fiscalite: d.fiscalite,
        cotisationYear: d.cotisationYear,
        comptable: d.comptable,
        isAllocated: d.isAllocated,
        observations: d.observations,
        billId: d.billId,
    };
}

// ─── Add wrapper (POST) ─────────────────────────────────────────────────────────

export function AddPaymentFormBackend({ onSuccess, initialClient, preset }: { onSuccess?: (paymentId: number) => void; initialClient?: User | null; preset?: PaymentFormPreset | null }) {
    const { toast } = useToast();

    const handleSubmit = async (formData: PaymentFormData): Promise<number> => {
        const response = await fetch('/api/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentFormDataToApiBody(formData)),
        });

        const data = await response.json();

        if (!response.ok) {
            const message = data?.message || 'Échec de la création du paiement';
            toast({
                variant: 'destructive',
                title: "Création impossible",
                description: message
            });
            throw markToasted(new Error(message));
        }

        toast({
            title: "Paiement créé",
            variant: 'success',
        });

        return data.payment.id;
    };

    return (
        <PaymentFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Créer le paiement"
            loadingText="Création en cours..."
            onSuccess={onSuccess}
            initialClient={initialClient}
            preset={preset}
        />
    );
}