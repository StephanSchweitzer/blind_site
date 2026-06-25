'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { AlertCircle, Calendar, Search, Loader2, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { BillingStatus, getBillingStatusLabel } from '@/lib/billing-enums';

interface User {
    id: number;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
}

interface EligibleOrder {
    id: number;
    requestReceivedDate: string;
    cost: number;
    billingStatus: string;
    catalogue: { title: string; author: string };
}

export interface BillFormData {
    clientId: number;
    orderIds: number[];
    state: BillingStatus;
    creationDate: Date;
    issueDate: Date | null;
}

interface BillFormBackendBaseProps {
    onSubmit: (formData: BillFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (billId: number) => void;
    initialClient?: User | null;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function BillFormBackendBase({
                                        onSubmit,
                                        submitButtonText,
                                        loadingText,
                                        title,
                                        onSuccess,
                                        initialClient,
                                    }: BillFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedClient, setSelectedClient] = useState<User | null>(initialClient ?? null);
    const [state, setState] = useState<BillingStatus>(BillingStatus.BILLED);
    const [creationDate, setCreationDate] = useState<Date>(new Date());
    const [issueDate, setIssueDate] = useState<Date | null>(null);

    // Client search
    const [users, setUsers] = useState<User[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [userPopoverOpen, setUserPopoverOpen] = useState(false);

    // Eligible orders for the selected client
    const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());

    // Search users
    useEffect(() => {
        const searchUsers = async () => {
            if (userSearch.length < 2) {
                setUsers([]);
                return;
            }
            setIsSearchingUsers(true);
            try {
                const response = await fetch(`/api/user/search?q=${encodeURIComponent(userSearch)}`);
                if (response.ok) {
                    setUsers(await response.json());
                }
            } catch (err) {
                console.error('Error searching users:', err);
            } finally {
                setIsSearchingUsers(false);
            }
        };
        const debounce = setTimeout(searchUsers, 300);
        return () => clearTimeout(debounce);
    }, [userSearch]);

    // When client changes, load their eligible (unbilled) orders
    useEffect(() => {
        const loadOrders = async () => {
            if (!selectedClient) {
                setEligibleOrders([]);
                setSelectedOrderIds(new Set());
                return;
            }
            setIsLoadingOrders(true);
            try {
                const res = await fetch(`/api/bills/eligible-orders?clientId=${selectedClient.id}`);
                if (res.ok) {
                    const { orders } = await res.json();
                    setEligibleOrders(orders);
                    setSelectedOrderIds(new Set(orders.map((o: EligibleOrder) => o.id)));
                } else {
                    setEligibleOrders([]);
                }
            } catch (err) {
                console.error('Error loading eligible orders:', err);
                setEligibleOrders([]);
            } finally {
                setIsLoadingOrders(false);
            }
        };
        loadOrders();
    }, [selectedClient]);

    const totalAmount = useMemo(
        () =>
            eligibleOrders
                .filter(o => selectedOrderIds.has(o.id))
                .reduce((sum, o) => sum + (o.cost || 0), 0),
        [eligibleOrders, selectedOrderIds]
    );

    const toggleOrder = (id: number) => {
        setSelectedOrderIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleClientSelect = (user: User) => {
        setSelectedClient(user);
        setUserPopoverOpen(false);
        setUserSearch('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!selectedClient) {
            setError('Veuillez sélectionner un client');
            return;
        }
        if (selectedOrderIds.size === 0) {
            setError('Veuillez sélectionner au moins une demande à facturer');
            return;
        }

        setIsLoading(true);
        try {
            const billId = await onSubmit({
                clientId: selectedClient.id,
                orderIds: Array.from(selectedOrderIds),
                state,
                creationDate,
                issueDate,
            });
            if (onSuccess) onSuccess(billId);
        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError('Échec de la création de la facture');
        } finally {
            setIsLoading(false);
        }
    };

    const getReaderDisplayName = (
        user: User
    ) => {
        if (!user) return null;
        return user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    };

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader>
                <CardTitle className="text-gray-100">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4 bg-red-900/20 border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-200">{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Client */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Client <span className="text-red-500">*</span>
                        </label>
                        <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors"
                                >
                                    {selectedClient ? (
                                        <span className="truncate">{selectedClient.name || selectedClient.email}</span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un client ...</span>
                                    )}
                                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700" align="start">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par nom ou email..."
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div className="max-h-[200px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                                    {isSearchingUsers && <div className="p-4 text-center text-gray-400">Recherche...</div>}
                                    {!isSearchingUsers && users.length === 0 && userSearch.length >= 2 && (
                                        <div className="p-4 text-center text-gray-400">Aucun utilisateur trouvé</div>
                                    )}
                                    {users.map((user) => (
                                        <button
                                            key={user.id}
                                            type="button"
                                            onClick={() => handleClientSelect(user)}
                                            className="w-full text-left px-4 py-2 hover:bg-gray-700 text-gray-200 transition-colors"
                                        >
                                            <div className="font-medium">{getReaderDisplayName(user)}</div>
                                            <div className="text-sm text-gray-400">{user.email}</div>
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Eligible orders */}
                    {selectedClient && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-200">
                                Demandes à facturer <span className="text-red-500">*</span>
                            </label>
                            {isLoadingOrders ? (
                                <div className="flex items-center gap-2 text-gray-400 px-3 py-4">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Chargement des demandes...
                                </div>
                            ) : eligibleOrders.length === 0 ? (
                                <div className="px-3 py-4 bg-gray-800 border border-gray-700 rounded-md text-gray-500 text-sm italic">
                                    Aucune demande facturable pour ce client
                                </div>
                            ) : (
                                <div className="border border-gray-700 rounded-md divide-y divide-gray-700 max-h-[260px] overflow-y-auto">
                                    {eligibleOrders.map((o) => (
                                        <label
                                            key={o.id}
                                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800 cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={selectedOrderIds.has(o.id)}
                                                onCheckedChange={() => toggleOrder(o.id)}
                                                className="border-2 border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-gray-200 text-sm font-medium truncate">
                                                    #{o.id} — {o.catalogue.title}
                                                </div>
                                                <div className="text-gray-400 text-xs truncate">
                                                    {o.catalogue.author} · {new Date(o.requestReceivedDate).toLocaleDateString('fr-FR')}
                                                </div>
                                            </div>
                                            <span className="text-gray-200 text-sm font-medium whitespace-nowrap">
                                                {formatCurrency(o.cost)}
                                            </span>
                                            <a
                                                href={`/admin/orders?order=${o.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                title="Ouvrir la commande dans un nouvel onglet"
                                                className="shrink-0 p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* State */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">État de la facture</label>
                        <Select value={state} onValueChange={(v) => setState(v as BillingStatus)}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                <div className="py-1">
                                    {Object.values(BillingStatus).map((s) => (
                                        <SelectItem
                                            key={s}
                                            value={s}
                                            className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 transition-colors"
                                        >
                                            <span className="font-medium">{getBillingStatusLabel(s)}</span>
                                        </SelectItem>
                                    ))}
                                </div>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Creation date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Date de création</label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {format(creationDate, 'PPP', { locale: fr })}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700">
                                <CalendarComponent
                                    mode="single"
                                    selected={creationDate}
                                    onSelect={(d) => d && setCreationDate(d)}
                                    initialFocus
                                    className="bg-gray-800 text-gray-200"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Issue date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Date d&apos;émission</label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {issueDate ? format(issueDate, 'PPP', { locale: fr }) : <span>Sélectionner une date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700">
                                <CalendarComponent
                                    mode="single"
                                    selected={issueDate || undefined}
                                    onSelect={(d) => setIssueDate(d || null)}
                                    initialFocus
                                    className="bg-gray-800 text-gray-200"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Amount (derived) */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                        <span className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                            Montant total ({selectedOrderIds.size} demande{selectedOrderIds.size > 1 ? 's' : ''})
                        </span>
                        <span className="text-xl font-bold text-gray-100">{formatCurrency(totalAmount)}</span>
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100 border-gray-100"
                    >
                        {isLoading ? loadingText : submitButtonText}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

// Add Bill Form using the base
export function AddBillFormBackend({ onSuccess, initialClient }: { onSuccess?: (billId: number) => void; initialClient?: User | null }) {
    const { toast } = useToast();

    const handleSubmit = async (formData: BillFormData): Promise<number> => {
        const response = await fetch('/api/bills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: formData.clientId,
                orderIds: formData.orderIds,
                state: formData.state,
                creationDate: formData.creationDate.toISOString(),
                issueDate: formData.issueDate ? formData.issueDate.toISOString() : null,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const message = data?.message || 'Échec de la création de la facture';
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
            description: <span className="text-xl mt-2">La facture a été créée avec succès</span>,
            className: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
        });

        return data.bill.id;
    };

    return (
        <BillFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Créer la facture"
            loadingText="Création en cours..."
            title="Créer une nouvelle facture"
            onSuccess={onSuccess}
            initialClient={initialClient}
        />
    );
}