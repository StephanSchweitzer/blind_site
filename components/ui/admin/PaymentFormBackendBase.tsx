'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { AlertCircle, Calendar, Search, X, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    PaymentType,
    PaymentMethod,
    getPaymentTypeLabel,
    getPaymentMethodLabel,
} from '@/lib/payment-enums';
import { useFormToast } from '@/hooks/useFormToast';
import { useInvalidField } from '@/hooks/useInvalidField';

// N3 — required fields, visual top→bottom (client picker, linked bill, amount).
const FIELD_ORDER = ['client', 'bill', 'amount'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
    id: number;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
}

interface BillOption {
    id: number;
    invoiceAmount: string | number;
    state: string;
}

export interface PaymentFormData {
    clientId: number | null;
    type: PaymentType;
    amount: number;
    paymentMethod: PaymentMethod | null;
    creationDate: Date;
    issueDate: Date | null;
    paymentDate: Date | null;
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

interface PaymentFormBackendBaseProps {
    onSubmit: (formData: PaymentFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (paymentId: number) => void;
    initialData?: PaymentFormInitialData;
    initialClient?: User | null;
}

const NONE = 'NONE';
const COMPTABLE_OPTIONS = ['Comptable', 'ECA', 'AUXILIAIRES'] as const;

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function getDisplayName(user: User | null) {
    if (!user) return null;
    return user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
}

export function PaymentFormBackendBase({
                                           onSubmit,
                                           submitButtonText,
                                           loadingText,
                                           title,
                                           onSuccess,
                                           initialData,
                                           initialClient,
                                       }: PaymentFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toastError } = useFormToast();
    const { registerField, focusFirstInvalid } = useInvalidField();
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [type, setType] = useState<PaymentType>(initialData?.type ?? PaymentType.COTISATION);
    const [selectedClient, setSelectedClient] = useState<User | null>(initialData?.client ?? initialClient ?? null);
    const [amount, setAmount] = useState<string>(initialData ? String(initialData.amount) : '');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(initialData?.paymentMethod ?? '');
    const [creationDate, setCreationDate] = useState<Date>(
        initialData?.creationDate ? new Date(initialData.creationDate) : new Date()
    );
    const [issueDate, setIssueDate] = useState<Date | null>(
        initialData?.issueDate ? new Date(initialData.issueDate) : null
    );
    const [paymentDate, setPaymentDate] = useState<Date | null>(
        initialData?.paymentDate ? new Date(initialData.paymentDate) : null
    );
    const [receiptNumber, setReceiptNumber] = useState(initialData?.receiptNumber ?? '');
    const [cotisationYear, setCotisationYear] = useState<string>(
        initialData?.cotisationYear != null ? String(initialData.cotisationYear) : String(new Date().getFullYear())
    );
    const [observations, setObservations] = useState(initialData?.observations ?? '');
    const [fiscalite, setFiscalite] = useState<boolean>(Boolean(initialData?.fiscalite));
    const [comptable, setComptable] = useState<string>(initialData?.comptable ?? '');
    const [isAllocated, setIsAllocated] = useState<boolean>(initialData?.isAllocated ?? false);
    const [allocationDate, setAllocationDate] = useState<Date | null>(
        initialData?.allocationDate ? new Date(initialData.allocationDate) : null
    );

    // Client search
    const [users, setUsers] = useState<User[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [userPopoverOpen, setUserPopoverOpen] = useState(false);

    // Bills of the selected client (only for ENREGISTREMENT)
    const [clientBills, setClientBills] = useState<BillOption[]>([]);
    const [selectedBillId, setSelectedBillId] = useState<number | null>(initialData?.bill?.id ?? null);
    const [isLoadingBills, setIsLoadingBills] = useState(false);

    // ── Search users (debounced) ───────────────────────────────────────────────
    useEffect(() => {
        const searchUsers = async () => {
            if (userSearch.length < 2) {
                setUsers([]);
                return;
            }
            setIsSearchingUsers(true);
            try {
                const response = await fetch(`/api/user/search?q=${encodeURIComponent(userSearch)}`);
                if (response.ok) setUsers(await response.json());
            } catch (err) {
                console.error('Error searching users:', err);
            } finally {
                setIsSearchingUsers(false);
            }
        };
        const debounce = setTimeout(searchUsers, 300);
        return () => clearTimeout(debounce);
    }, [userSearch]);

    useEffect(() => {
        let active = true;
        const shouldFetch = type === PaymentType.ENREGISTREMENT && !!selectedClient;

        const loadBills = async () => {
            if (type !== PaymentType.ENREGISTREMENT || !selectedClient) return [];
            const res = await fetch(`/api/bills?clientId=${selectedClient.id}&limit=100`);
            if (!res.ok) return [];
            const json = await res.json();
            return json?.data?.bills ?? [];
        };

        Promise.resolve()
            .then(() => { if (active && shouldFetch) setIsLoadingBills(true); })
            .then(() => loadBills())
            .then((bills) => { if (active) setClientBills(bills); })
            .catch((err) => {
                console.error('Error loading client bills:', err);
                if (active) setClientBills([]);
            })
            .finally(() => { if (active) setIsLoadingBills(false); });

        return () => { active = false; };
    }, [type, selectedClient]);

    const handleClientSelect = (user: User) => {
        setSelectedClient(user);
        setSelectedBillId(null);
        setUserPopoverOpen(false);
        setUserSearch('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const amt = parseFloat(amount.replace(',', '.'));

        // N3 — collect failing fields in visual order, then toast + focus the first.
        const invalid: string[] = [];
        const clientRequired = type === PaymentType.COTISATION || type === PaymentType.ENREGISTREMENT;
        if (clientRequired && !selectedClient) invalid.push('client');
        if (type === PaymentType.ENREGISTREMENT && selectedClient && !selectedBillId) invalid.push('bill');
        if (!Number.isFinite(amt) || amt <= 0) invalid.push('amount');

        if (invalid.length) {
            const messages: Record<string, string> = {
                client: 'Un auditeur est requis pour ce type de paiement',
                bill: 'Veuillez sélectionner la facture liée à cet enregistrement',
                amount: 'Veuillez saisir un montant positif',
            };
            // First in FIELD_ORDER among the invalid set → topmost message.
            const firstName = FIELD_ORDER.find((n) => invalid.includes(n)) ?? invalid[0];
            const msg = messages[firstName];
            setError(msg);
            toastError(msg);
            focusFirstInvalid(FIELD_ORDER, new Set(invalid));
            return;
        }

        setIsLoading(true);
        try {
            const paymentId = await onSubmit({
                clientId: selectedClient?.id ?? null,
                type,
                amount: amt,
                paymentMethod: paymentMethod || null,
                creationDate,
                issueDate,
                paymentDate,
                receiptNumber: receiptNumber.trim() || null,
                fiscalite: fiscalite ? 'OUI' : null,
                cotisationYear:
                    type === PaymentType.COTISATION && cotisationYear ? parseInt(cotisationYear) : null,
                comptable: comptable || null,
                isAllocated,
                allocationDate: isAllocated ? allocationDate : null,
                observations: observations.trim() || null,
                billId: type === PaymentType.ENREGISTREMENT ? selectedBillId : null,
            });
            if (onSuccess) onSuccess(paymentId);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Échec de l’enregistrement du paiement';
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const datePicker = (
        value: Date | null,
        onChange: (d: Date | null) => void,
        placeholder = 'Sélectionner une date'
    ) => (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left bg-field border-border text-foreground hover:bg-muted"
                >
                    <Calendar className="mr-2 h-4 w-4" />
                    {value ? format(value, 'PPP', { locale: fr }) : <span className="text-muted-foreground">{placeholder}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-card border-border">
                <CalendarComponent
                    mode="single"
                    selected={value || undefined}
                    onSelect={(d) => onChange(d || null)}
                    initialFocus
                    className="bg-card text-foreground"
                />
            </PopoverContent>
        </Popover>
    );

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-foreground">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-700 dark:text-red-200">{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Type */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Type <span className="text-red-500">*</span>
                        </label>
                        <Select value={type} onValueChange={(v) => setType(v as PaymentType)}>
                            <SelectTrigger className="bg-field border-border text-foreground hover:bg-muted transition-colors">
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

                    {/* Client */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Auditeur
                            {(type === PaymentType.COTISATION || type === PaymentType.ENREGISTREMENT) && (
                                <span className="text-red-500"> *</span>
                            )}
                            {(type === PaymentType.DON || type === PaymentType.DIVERS) && (
                                <span className="text-muted-foreground text-xs font-normal"> (facultatif)</span>
                            )}
                        </label>
                        <div className="flex gap-2">
                            <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        ref={registerField('client')}
                                        type="button"
                                        variant="outline"
                                        role="combobox"
                                        className="flex-1 justify-between bg-field border-border text-foreground hover:bg-muted transition-colors"
                                    >
                                        {selectedClient ? (
                                            <span className="truncate">{getDisplayName(selectedClient)}</span>
                                        ) : (
                                            <span className="text-muted-foreground">Rechercher un auditeur ...</span>
                                        )}
                                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0 bg-card border-border" align="start" collisionPadding={16}>
                                    <div className="p-2">
                                        <Input
                                            placeholder="Rechercher par nom ou email..."
                                            value={userSearch}
                                            onChange={(e) => setUserSearch(e.target.value)}
                                            className="bg-field border-border text-foreground"
                                        />
                                    </div>
                                    <div className="max-h-[200px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                                        {isSearchingUsers && <div className="p-4 text-center text-muted-foreground">Recherche...</div>}
                                        {!isSearchingUsers && users.length === 0 && userSearch.length >= 2 && (
                                            <div className="p-4 text-center text-muted-foreground">Aucune personne trouvée</div>
                                        )}
                                        {users.map((user) => (
                                            <button
                                                key={user.id}
                                                type="button"
                                                onClick={() => handleClientSelect(user)}
                                                className="w-full text-left px-4 py-2 hover:bg-muted text-foreground transition-colors"
                                            >
                                                <div className="font-medium">{getDisplayName(user)}</div>
                                                <div className="text-sm text-muted-foreground">{user.email}</div>
                                            </button>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                            {selectedClient && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => { setSelectedClient(null); setSelectedBillId(null); }}
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
                            <label className="text-sm font-medium text-foreground">
                                Facture liée <span className="text-red-500">*</span>
                            </label>
                            {isLoadingBills ? (
                                <div className="px-3 py-2.5 bg-card border border-border rounded-md text-muted-foreground text-sm">
                                    Chargement des factures...
                                </div>
                            ) : clientBills.length === 0 ? (
                                <div className="px-3 py-2.5 bg-card border border-border rounded-md text-muted-foreground text-sm italic">
                                    Aucune facture pour ce client
                                </div>
                            ) : (
                                <Select
                                    value={selectedBillId ? String(selectedBillId) : undefined}
                                    onValueChange={(v) => setSelectedBillId(parseInt(v))}
                                >
                                    <SelectTrigger ref={registerField('bill')} className="bg-field border-border text-foreground hover:bg-muted">
                                        <SelectValue placeholder="Sélectionner une facture" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        {clientBills.map((b) => (
                                            <SelectItem
                                                key={b.id}
                                                value={String(b.id)}
                                                className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer"
                                            >
                                                Facture #{b.id} — {formatCurrency(parseFloat(String(b.invoiceAmount)))}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    )}

                    {/* Amount */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Montant <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <Input
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

                    {/* Cotisation year (COTISATION only) */}
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

                    {/* Dates */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Date de création</label>
                            {datePicker(creationDate, (d) => d && setCreationDate(d))}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Date de paiement</label>
                            {datePicker(paymentDate, setPaymentDate)}
                        </div>
                    </div>

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
                                        {datePicker(issueDate, setIssueDate)}
                                    </div>
                                </div>

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
                                        className="border-2 border-border data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                    />
                                    Fiscalité (reçu fiscal applicable)
                                </label>

                                <div className="space-y-3">
                                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                                        <Checkbox
                                            checked={isAllocated}
                                            onCheckedChange={(c) => setIsAllocated(!!c)}
                                            className="border-2 border-border data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                        />
                                        Affectée
                                    </label>
                                    {isAllocated && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Date d&apos;attribution</label>
                                            {datePicker(allocationDate, setAllocationDate)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-muted hover:bg-muted text-foreground border-border"
                    >
                        {isLoading ? loadingText : submitButtonText}
                    </Button>
                </form>
            </CardContent>
        </Card>
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
        allocationDate: d.allocationDate?.toISOString() ?? null,
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

export function AddPaymentFormBackend({ onSuccess, initialClient }: { onSuccess?: (paymentId: number) => void; initialClient?: User | null }) {
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
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">{message}</span>,
                className: 'bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6',
            });
            throw new Error(message);
        }

        toast({
            // @ts-expect-error jsx in toast
            title: <span className="text-2xl font-bold">Succès</span>,
            description: <span className="text-xl mt-2">Le paiement a été créé avec succès</span>,
            className: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
        });

        return data.payment.id;
    };

    return (
        <PaymentFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Créer le paiement"
            loadingText="Création en cours..."
            title="Créer un nouveau paiement"
            onSuccess={onSuccess}
            initialClient={initialClient}
        />
    );
}