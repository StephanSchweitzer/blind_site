import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Plus, Trash2, Mail } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useFormToast } from "@/hooks/useFormToast";
import { useInvalidField } from "@/hooks/useInvalidField";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { CotisationStatusBanner } from '@/components/ui/admin/CotisationStatusBanner';
import { AddressFormData, UserFormData, UserType } from '@/types';
import { formatPhone } from '@/lib/utils';
import {
    MEMBER_TYPE_VALUES,
    getMemberTypeLabel,
    SAVE_TYPE_VALUES,
    getSaveTypeLabel,
    LANGUAGE_VALUES,
    getLanguageLabel,
    DELIVERY_METHOD_VALUES,
    getDeliveryMethodLabel,
} from '@/lib/user-enums';
import { withCurrentValue, withCurrentValues } from '@/lib/select-options';

interface UserFormBackendBaseProps {
    initialData?: UserFormData;
    onSubmit: (formData: UserFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (userId: number, isDeleted?: boolean) => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
    currentUserAccessLevel?: string;
    userType: UserType;
    userId?: string;
    /** When true (create flow), warn if an existing user shares first+last name. */
    warnOnDuplicateName?: boolean;
}

const emptyAddress: AddressFormData = {
    addressLine1: '',
    addressSupplement: '',
    city: '',
    postalCode: '',
    stateProvince: '',
    country: 'France',
    isDefault: false,
};

// Moved outside the component so it's stable and safe to call from useEffect
function sanitizeInitialData(
    data: UserFormData,
    defaultMemberType: UserFormData['memberType'],
    defaultAccessLevel: UserFormData['accessLevel'],
): UserFormData {
    return {
        ...data,
        memberType: data.memberType || defaultMemberType,
        accessLevel: data.accessLevel || defaultAccessLevel,
        civilityId: data.civilityId ?? null,
        civilityOther: data.civilityOther || '',
        email: data.email || '',
        name: data.name || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        homePhone: formatPhone(data.homePhone),
        cellPhone: formatPhone(data.cellPhone),
        gestconteNotes: data.gestconteNotes || '',
        nonProfitAffiliation: data.nonProfitAffiliation || '',
        terminationReason: data.terminationReason || '',
        preferredDeliveryMethod: data.preferredDeliveryMethod || '',
        preferredMediaFormatId: data.preferredMediaFormatId ?? null,
        paymentThreshold: data.paymentThreshold || '21.00',
        currentBalance: data.currentBalance || '0.00',
        availabilityNotes: data.availabilityNotes || '',
        languages: data.languages ?? [],
        saveType: data.saveType || '',
        notes: data.notes || '',
        addresses: (data.addresses || []).map(addr => ({
            ...addr,
            addressLine1: addr.addressLine1 || '',
            addressSupplement: addr.addressSupplement || '',
            city: addr.city || '',
            postalCode: addr.postalCode || '',
            stateProvince: addr.stateProvince || '',
            country: addr.country || 'France',
        })),
    };
}

export function UserFormBackendBase({
                                        initialData,
                                        onSubmit,
                                        submitButtonText,
                                        loadingText,
                                        title,
                                        onSuccess,
                                        onDelete,
                                        showDelete,
                                        currentUserAccessLevel,
                                        userType,
                                        userId,
                                        warnOnDuplicateName = false,
                                    }: UserFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPasswordResetDialogOpen, setIsPasswordResetDialogOpen] = useState(false);
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [duplicateMatches, setDuplicateMatches] = useState<
        { id: number; name: string | null; firstName: string | null; lastName: string | null; email: string | null }[]
    >([]);
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const { toast } = useToast();
    const { toastError } = useFormToast();
    const { registerField, focusFirstInvalid } = useInvalidField();

    const [civilities, setCivilities] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        fetch('/api/civilities')
            .then((res) => (res.ok ? res.json() : []))
            .then(setCivilities)
            .catch(() => setCivilities([]));
    }, []);

    const [mediaFormats, setMediaFormats] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        fetch('/api/media-formats')
            .then((res) => (res.ok ? res.json() : []))
            .then(setMediaFormats)
            .catch(() => setMediaFormats([]));
    }, []);

    const defaultMemberType: UserFormData['memberType'] =
        userType === 'auditeurs' ? 'auditeur' :
            userType === 'bienfaiteurs' ? 'bienfaiteur' :
                'lecteur';
    // The access level is no longer editable from this form (it is an internal
    // permission, not something to arbitrate while filling in a member's file),
    // so it has to be derived correctly here: the tab the person is created from
    // decides it. Only the "permanents" tab creates a permanent, and only a super
    // admin may — everyone else is a plain member. On edit the stored level is
    // carried through untouched by sanitizeInitialData.
    const defaultAccessLevel: UserFormData['accessLevel'] =
        userType === 'permanents' && currentUserAccessLevel === 'super_admin'
            ? 'admin'
            : 'member';

    const [formData, setFormData] = useState<UserFormData>(
        initialData
            ? sanitizeInitialData(initialData, defaultMemberType, defaultAccessLevel)
            : {
                email: '',
                name: '',
                memberType: defaultMemberType,
                accessLevel: defaultAccessLevel,
                civilityId: null,
                civilityOther: '',
                firstName: '',
                lastName: '',
                homePhone: '',
                cellPhone: '',
                gestconteNotes: '',
                gestconteId: null,
                nonProfitAffiliation: '',
                isActive: true,
                terminationReason: '',
                preferredDeliveryMethod: '',
                paymentThreshold: '21.00',
                currentBalance: '0.00',
                preferredMediaFormatId: null,
                isAvailable: true,
                availabilityNotes: '',
                languages: [],
                saveType: '',
                maxConcurrentAssignments: 3,
                notes: '',
                addresses: [],
            }
    );

    // Resync form state when a new initialData arrives (e.g. after an async fetch).
    // Done during render via a tracked previous-prop ref rather than in an effect:
    // setting state during render is the pattern React recommends for "adjust state
    // when a prop changes" and avoids the cascading render the effect version caused.
    const [prevInitialData, setPrevInitialData] = useState(initialData);
    if (initialData && initialData !== prevInitialData) {
        setPrevInitialData(initialData);
        setFormData(sanitizeInitialData(initialData, defaultMemberType, defaultAccessLevel));
    }

    const handleAddAddress = () => {
        setFormData(prev => ({
            ...prev,
            addresses: [...prev.addresses, { ...emptyAddress }],
        }));
    };

    const handleRemoveAddress = (index: number) => {
        setFormData(prev => ({
            ...prev,
            addresses: prev.addresses.filter((_, i) => i !== index),
        }));
    };

    const handleAddressChange = (index: number, field: keyof AddressFormData, value: string | boolean) => {
        setFormData(prev => ({
            ...prev,
            addresses: prev.addresses.map((addr, i) =>
                i === index ? { ...addr, [field]: value } : addr
            ),
        }));
    };

    const doSubmit = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const newUserId = await onSubmit(formData);
            if (onSuccess) {
                onSuccess(newUserId);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Échec du traitement de la personne';
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if ((formData.accessLevel === 'admin' || formData.accessLevel === 'super_admin') && !formData.email) {
            const msg = 'L\'email est requis pour les membres permanents';
            setError(msg);
            toastError(msg);
            focusFirstInvalid(['email'], new Set(['email']));
            return;
        }

        // Create flow: warn (don't block) if an existing user shares first+last name.
        if (warnOnDuplicateName && formData.firstName.trim() && formData.lastName.trim()) {
            try {
                const res = await fetch(
                    `/api/user/check-duplicate?firstName=${encodeURIComponent(formData.firstName)}&lastName=${encodeURIComponent(formData.lastName)}`
                );
                if (res.ok) {
                    const { matches } = await res.json();
                    if (Array.isArray(matches) && matches.length > 0) {
                        setDuplicateMatches(matches);
                        setShowDuplicateDialog(true);
                        return; // wait for the admin to confirm
                    }
                }
            } catch (err) {
                console.error('Duplicate-name check failed:', err);
                // Non-blocking: fall through and let the submit proceed.
            }
        }

        await doSubmit();
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;

        if (window.confirm('Êtes-vous sûr de vouloir supprimer cette personne ?')) {
            setIsLoading(true);
            try {
                await onDelete();
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Échec de la suppression de la personne';
                setError(msg);
                toastError(msg);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handlePasswordReset = async () => {
        if (!userId) {
            toast({
                variant: "destructive",
                title: "Erreur",
                description: "Impossible de réinitialiser le mot de passe : ID de la personne manquant",
            });
            return;
        }

        setIsResettingPassword(true);
        try {
            const response = await fetch(`/api/user/${userId}/reset-password`, {
                method: 'POST',
            });

            const data = await response.json();

            if (!response.ok) {
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: data?.message || 'Échec de la réinitialisation du mot de passe',
                });
                return;
            }

            if (response.status === 207 || data?.emailSent === false) {
                toast({
                    title: "Mot de passe réinitialisé — email non envoyé",
                    description: data?.message ||
                        "Le mot de passe a été réinitialisé mais l'email n'a pas pu être envoyé. Contactez la personne directement.",
                    className: "bg-amber-100 border-amber-500 text-amber-900",
                });
                setIsPasswordResetDialogOpen(false);
                return;
            }

            toast({
                title: "Succès",
                description: data?.message || 'Le mot de passe a été réinitialisé et envoyé par email',
                className: "bg-green-100 border-green-500 text-green-900"
            });

            setIsPasswordResetDialogOpen(false);
        } catch (err) {
            console.error('Password reset error:', err);
            toast({
                variant: "destructive",
                title: "Erreur",
                description: "Échec de la réinitialisation du mot de passe",
            });
        } finally {
            setIsResettingPassword(false);
        }
    };

    const selectedCivility = civilities.find((c) => c.id === formData.civilityId);
    const showCivilityOther = selectedCivility?.name === 'Autre';

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-foreground">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {userId && <CotisationStatusBanner userId={userId} />}

                {error && (
                    <Alert variant="destructive" className="mb-4 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-700 dark:text-red-200">{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Information */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                            Informations de base
                        </h3>

                        {/* Email – full width */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Email {formData.accessLevel === 'admin' && <span className="text-red-500">*</span>}
                            </label>
                            <Input
                                ref={registerField('email')}
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="bg-field border-border text-foreground"
                                required={formData.accessLevel === 'admin'}
                                autoFocus={false}
                                autoComplete="off"
                            />
                        </div>

                        {/* Prénom + Nom */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Prénom</label>
                                <Input
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    className="bg-field border-border text-foreground"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Nom</label>
                                <Input
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    className="bg-field border-border text-foreground"
                                />
                            </div>
                        </div>

                        {/* Civilité */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Civilité</label>
                                <Select
                                    value={formData.civilityId ? String(formData.civilityId) : 'none'}
                                    onValueChange={(value) =>
                                        setFormData({
                                            ...formData,
                                            civilityId: value === 'none' ? null : parseInt(value),
                                            civilityOther: '',
                                        })
                                    }
                                >
                                    <SelectTrigger className="bg-field border-border text-foreground">
                                        <SelectValue placeholder="Sélectionner..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border max-h-72">
                                        <SelectItem value="none" className="text-foreground">—</SelectItem>
                                        {civilities.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)} className="text-foreground">
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {showCivilityOther && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Civilité (préciser)</label>
                                    <Input
                                        value={formData.civilityOther || ''}
                                        onChange={(e) => setFormData({ ...formData, civilityOther: e.target.value })}
                                        className="bg-field border-border text-foreground"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Type de membre. The access level is deliberately absent:
                            it is a back-office permission, derived from the tab on
                            creation and left untouched here on edit. */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Type de membre</label>
                                <Select
                                    value={formData.memberType}
                                    onValueChange={(value) => setFormData({ ...formData, memberType: value as UserFormData['memberType'] })}
                                >
                                    <SelectTrigger className="bg-field border-border text-foreground">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        {/* A retired type already on the record (e.g. `ecouteur`) stays
                                            listed so the trigger isn't blank and the value survives a save. */}
                                        {withCurrentValue(MEMBER_TYPE_VALUES, formData.memberType).map((type) => (
                                            <SelectItem key={type} value={type} className="text-foreground">
                                                {getMemberTypeLabel(type)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                            Coordonnées
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Téléphone fixe</label>
                                <Input
                                    type="tel"
                                    value={formData.homePhone}
                                    onChange={(e) => setFormData({ ...formData, homePhone: e.target.value })}
                                    onBlur={(e) => setFormData({ ...formData, homePhone: formatPhone(e.target.value) })}
                                    className="bg-field border-border text-foreground"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Téléphone portable</label>
                                <Input
                                    type="tel"
                                    value={formData.cellPhone}
                                    onChange={(e) => setFormData({ ...formData, cellPhone: e.target.value })}
                                    onBlur={(e) => setFormData({ ...formData, cellPhone: formatPhone(e.target.value) })}
                                    className="bg-field border-border text-foreground"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Addresses */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-border pb-2">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                                Adresses
                            </h3>
                            <Button
                                type="button"
                                onClick={handleAddAddress}
                                size="sm"
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                {formData.addresses.length > 0 ? "Ajouter une autre adresse" : "Ajouter une adresse"}
                            </Button>
                        </div>

                        {formData.addresses.map((address, index) => (
                            <div key={index} className="bg-card/50 p-4 rounded-lg border border-border space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-sm font-medium text-foreground">Adresse {index + 1}</h4>
                                    <Button
                                        type="button"
                                        onClick={() => handleRemoveAddress(index)}
                                        size="sm"
                                        variant="destructive"
                                        className="bg-red-600 hover:bg-red-700 text-white"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Adresse</label>
                                        <Input
                                            value={address.addressLine1}
                                            onChange={(e) => handleAddressChange(index, 'addressLine1', e.target.value)}
                                            className="bg-field border-border text-foreground"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Complément</label>
                                        <Input
                                            value={address.addressSupplement}
                                            onChange={(e) => handleAddressChange(index, 'addressSupplement', e.target.value)}
                                            className="bg-field border-border text-foreground"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Ville</label>
                                        <Input
                                            value={address.city}
                                            onChange={(e) => handleAddressChange(index, 'city', e.target.value)}
                                            className="bg-field border-border text-foreground"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Code postal</label>
                                        <Input
                                            value={address.postalCode}
                                            onChange={(e) => handleAddressChange(index, 'postalCode', e.target.value)}
                                            className="bg-field border-border text-foreground"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Pays</label>
                                        <Input
                                            value={address.country}
                                            onChange={(e) => handleAddressChange(index, 'country', e.target.value)}
                                            className="bg-field border-border text-foreground"
                                        />
                                    </div>

                                    <div className="flex items-center space-x-2 md:col-span-2">
                                        <Checkbox
                                            checked={address.isDefault}
                                            onCheckedChange={(checked) => handleAddressChange(index, 'isDefault', checked as boolean)}
                                            className="border-border data-[state=checked]:bg-primary"
                                        />
                                        <label className="text-sm font-medium text-foreground">Adresse par défaut</label>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Accounting - Always visible */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                            Comptabilité
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Affiliation non-profit</label>
                                <Input
                                    value={formData.nonProfitAffiliation}
                                    onChange={(e) => setFormData({ ...formData, nonProfitAffiliation: e.target.value })}
                                    className="bg-field border-border text-foreground"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">ID Gestconte</label>
                                <Input
                                    type="number"
                                    value={formData.gestconteId || ''}
                                    onChange={(e) => setFormData({ ...formData, gestconteId: e.target.value ? parseInt(e.target.value) : null })}
                                    className="bg-field border-border text-foreground"
                                />
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium text-foreground">Notes Gestconte</label>
                                <Textarea
                                    value={formData.gestconteNotes}
                                    onChange={(e) => setFormData({ ...formData, gestconteNotes: e.target.value })}
                                    className="bg-field border-border text-foreground"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Disponibilité (attributions) — lecteur only (#18b). */}
                    {formData.memberType === 'lecteur' && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                                Disponibilit&#233; (attributions)
                            </h3>

                            <div className="space-y-4">
                                {/* Disponible Checkbox - Only for Lecteurs */}
                                {formData.memberType === 'lecteur' && (
                                    <>
                                        <div className="bg-gradient-to-br from-card/40 to-card/20 p-4 rounded-lg border border-border/50 hover:border-border/50 transition-all">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        <Checkbox
                                                            checked={formData.isAvailable}
                                                            onCheckedChange={(checked) => setFormData({ ...formData, isAvailable: checked as boolean })}
                                                            className="h-5 w-5 border-2 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary rounded-md transition-all"
                                                        />
                                                        {formData.isAvailable && (
                                                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="text-sm font-medium text-foreground cursor-pointer">
                                                            Disponible pour nouvelles attributions
                                                        </label>
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            {formData.isAvailable
                                                                ? 'Peut recevoir de nouveaux livres'
                                                                : 'Ne peut pas recevoir de nouveaux livres'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                    formData.isAvailable
                                                        ? 'bg-green-100 text-green-700 border border-green-300 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30'
                                                        : 'bg-muted/20 text-muted-foreground border border-border/30'
                                                }`}>
                                                    {formData.isAvailable ? 'Disponible' : 'Indisponible'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Notes de disponibilité</label>
                                            <Textarea
                                                value={formData.availabilityNotes}
                                                onChange={(e) => setFormData({ ...formData, availabilityNotes: e.target.value })}
                                                className="bg-field border-border text-foreground"
                                                placeholder="Ex: Il ne peut venir récupérer les livres que le samedi...."
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Logiciel d&apos;enregistrement</label>
                                            <Select
                                                value={formData.saveType || 'none'}
                                                onValueChange={(value) =>
                                                    setFormData({ ...formData, saveType: value === 'none' ? '' : value })
                                                }
                                            >
                                                <SelectTrigger className="bg-field border-border text-foreground">
                                                    <SelectValue placeholder="Sélectionner..." />
                                                </SelectTrigger>
                                                <SelectContent className="bg-card border-border">
                                                    <SelectItem value="none" className="text-foreground">—</SelectItem>
                                                    {withCurrentValue(SAVE_TYPE_VALUES, formData.saveType).map((v) => (
                                                        <SelectItem key={v} value={v} className="text-foreground">
                                                            {getSaveTypeLabel(v)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Gestion du compte — password reset, permanent members (super_admin only). */}
                    {initialData &&
                        currentUserAccessLevel === 'super_admin' &&
                        (formData.accessLevel === 'admin' || formData.accessLevel === 'super_admin') &&
                        formData.email && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                                    Gestion du compte
                                </h3>
                                <div className="bg-card/30 p-4 rounded-lg border border-border flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-medium text-foreground">Mot de passe</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            G&#233;n&#232;re un nouveau mot de passe temporaire et l&apos;envoie par email
                                            &#224; la personne. L&apos;ancien mot de passe cessera de fonctionner.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={() => setIsPasswordResetDialogOpen(true)}
                                        variant="outline"
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground border-primary shrink-0"
                                    >
                                        <Mail className="h-4 w-4 mr-2" />
                                        R&#233;initialiser mot de passe
                                    </Button>
                                </div>
                            </div>
                        )}

                    {/* Preferences & Settings — #14: only for auditeur or lecteur */}
                    {(formData.memberType === 'auditeur' || formData.memberType === 'lecteur') && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                                Préférences
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Méthode de livraison préférée</label>
                                    <Select
                                        value={formData.preferredDeliveryMethod}
                                        onValueChange={(value) => setFormData({ ...formData, preferredDeliveryMethod: value })}
                                    >
                                        <SelectTrigger className="bg-field border-border text-foreground">
                                            <SelectValue placeholder="Sélectionner..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            {withCurrentValue(DELIVERY_METHOD_VALUES, formData.preferredDeliveryMethod).map((v) => (
                                                <SelectItem key={v} value={v} className="text-foreground">
                                                    {getDeliveryMethodLabel(v)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Format média préféré</label>
                                    <Select
                                        value={formData.preferredMediaFormatId?.toString() || ''}
                                        onValueChange={(value) => setFormData({ ...formData, preferredMediaFormatId: value ? parseInt(value) : null })}
                                    >
                                        <SelectTrigger className="bg-field border-border text-foreground">
                                            <SelectValue placeholder="Sélectionner..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            {mediaFormats.map((format) => (
                                                <SelectItem
                                                    key={format.id}
                                                    value={format.id.toString()}
                                                    className="text-foreground"
                                                >
                                                    {format.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* #16: payment threshold + balance only for auditeur */}
                                {formData.memberType === 'auditeur' && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Seuil de paiement (€)</label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={formData.paymentThreshold}
                                                onChange={(e) => setFormData({ ...formData, paymentThreshold: e.target.value })}
                                                className="bg-field border-border text-foreground"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Solde actuel (€)</label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={formData.currentBalance}
                                                onChange={(e) => setFormData({ ...formData, currentBalance: e.target.value })}
                                                className="bg-field border-border text-foreground"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Reader-specific fields - Only for Lecteurs */}
                    {formData.memberType === 'lecteur' && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                                Paramètres de lecture
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-sm font-medium text-foreground">Langues (spécialisation)</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {/* A retired language already recorded on the reader (Français)
                                            keeps its box so it stays visible and isn't dropped by the
                                            replace-all save — unchecking it is the only way to remove it. */}
                                        {withCurrentValues(LANGUAGE_VALUES, formData.languages).map((lang) => (
                                            <label key={lang} className="flex items-center gap-2 text-sm text-foreground">
                                                <Checkbox
                                                    checked={formData.languages.includes(lang)}
                                                    onCheckedChange={(checked) => setFormData({
                                                        ...formData,
                                                        languages: checked
                                                            ? [...formData.languages, lang]
                                                            : formData.languages.filter((l) => l !== lang),
                                                    })}
                                                    className="border-border data-[state=checked]:bg-primary"
                                                />
                                                {getLanguageLabel(lang)}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-sm font-medium text-foreground">Nombre maximum d&apos;attributions simultanées</label>
                                    <Input
                                        type="number"
                                        value={formData.maxConcurrentAssignments || ''}
                                        onChange={(e) => setFormData({ ...formData, maxConcurrentAssignments: e.target.value ? parseInt(e.target.value) : null })}
                                        className="bg-field border-border text-foreground"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notes - Always visible */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                            Notes
                        </h3>
                        <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="bg-card border-border text-foreground min-h-[100px]"
                            placeholder="Notes supplémentaires..."
                        />
                    </div>

                    {/* Submit Buttons */}
                    <div className="space-y-4">
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            {isLoading ? loadingText : submitButtonText}
                        </Button>

                        {showDelete && onDelete && (
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={isLoading}
                                onClick={handleDeleteClick}
                                className="w-full bg-red-600 hover:bg-red-700 text-white"
                            >
                                Supprimer la personne
                            </Button>
                        )}
                    </div>
                </form>

                {/* Deactivation Dialog */}
                <Dialog open={isPasswordResetDialogOpen} onOpenChange={setIsPasswordResetDialogOpen}>
                    <DialogContent className="bg-card border-border">
                        <DialogHeader>
                            <DialogTitle className="text-foreground">Réinitialiser le mot de passe</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Cette action génèrera un nouveau mot de passe temporaire et l&apos;enverra par email à la personne.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="bg-yellow-50 border border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-700 rounded-lg p-4">
                                <div className="flex gap-3">
                                    <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                            Êtes-vous sûr de vouloir réinitialiser le mot de passe ?
                                        </p>
                                        <ul className="text-sm text-yellow-700 dark:text-yellow-300/90 space-y-1 list-disc list-inside">
                                            <li>Un nouveau mot de passe temporaire sera généré</li>
                                            <li>L&apos;ancien mot de passe ne fonctionnera plus</li>
                                            <li>Un email sera envoyé à : <strong>{formData.email}</strong></li>
                                            <li>La personne devra changer son mot de passe à la prochaine connexion</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsPasswordResetDialogOpen(false)}
                                disabled={isResettingPassword}
                                className="bg-card text-foreground border-border hover:bg-muted"
                            >
                                Annuler
                            </Button>
                            <Button
                                type="button"
                                onClick={handlePasswordReset}
                                disabled={isResettingPassword}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                {isResettingPassword ? 'Envoi en cours...' : 'Confirmer et envoyer'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
                    <DialogContent className="bg-card border-border">
                        <DialogHeader>
                            <DialogTitle className="text-foreground">Doublon possible</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Un ou plusieurs membres portent déjà ce nom. Vérifiez qu&apos;il
                                ne s&apos;agit pas de la même personne avant de continuer.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-60 overflow-y-auto space-y-2 py-2">
                            {duplicateMatches.map((m) => (
                                <div key={m.id} className="rounded border border-border bg-card p-2 text-sm text-foreground">
                                    <div className="font-medium">
                                        {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.name || `#${m.id}`}
                                    </div>
                                    {m.email && <div className="text-muted-foreground">{m.email}</div>}
                                </div>
                            ))}
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setShowDuplicateDialog(false)}
                                className="bg-muted text-foreground border-border hover:bg-muted"
                            >
                                Annuler
                            </Button>
                            <Button
                                onClick={() => {
                                    setShowDuplicateDialog(false);
                                    void doSubmit();
                                }}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                Créer quand même
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}
