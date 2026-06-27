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
import { AddressFormData, UserFormData, UserType } from '@/types';
import {
    MEMBER_TYPE_VALUES,
    MEMBER_TYPE_LABELS,
    ACCESS_LEVEL_VALUES,
    ACCESS_LEVEL_LABELS,
    getAccessLevelLabel,
} from '@/lib/user-enums';

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
        homePhone: data.homePhone || '',
        cellPhone: data.cellPhone || '',
        gestconteNotes: data.gestconteNotes || '',
        nonProfitAffiliation: data.nonProfitAffiliation || '',
        terminationReason: data.terminationReason || '',
        preferredDeliveryMethod: data.preferredDeliveryMethod || '',
        preferredDistributionMethod: data.preferredDistributionMethod || '',
        paymentThreshold: data.paymentThreshold || '21.00',
        currentBalance: data.currentBalance || '0.00',
        availabilityNotes: data.availabilityNotes || '',
        specialization: data.specialization || '',
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

    const defaultMemberType: UserFormData['memberType'] =
        userType === 'auditeurs' ? 'auditeur' :
            userType === 'bienfaiteurs' ? 'bienfaiteur' :
                'lecteur';
    const defaultAccessLevel: UserFormData['accessLevel'] =
        userType === 'auditeurs' || userType === 'bienfaiteurs' ? 'member' : 'admin';

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
                preferredDistributionMethod: '',
                isAvailable: true,
                availabilityNotes: '',
                specialization: '',
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

    const isAccessLevelLocked =
        (initialData && initialData.accessLevel === 'super_admin' && currentUserAccessLevel !== 'super_admin') ||
        (currentUserAccessLevel === 'admin');

    const selectedCivility = civilities.find((c) => c.id === formData.civilityId);
    const showCivilityOther = selectedCivility?.name === 'Autre';

    const getLockedReason = (): string => {
        if (currentUserAccessLevel === 'admin') {
            return 'Seuls les super administrateurs peuvent modifier les niveaux d\'accès';
        }
        if (initialData?.accessLevel === 'super_admin') {
            return 'Verrouillé';
        }
        return 'Verrouillé';
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

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Information */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                            Informations de base
                        </h3>

                        {/* Email – full width */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-200">
                                Email {formData.accessLevel === 'admin' && <span className="text-red-500">*</span>}
                            </label>
                            <Input
                                ref={registerField('email')}
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="bg-gray-800 border-gray-700 text-gray-200"
                                required={formData.accessLevel === 'admin'}
                                autoFocus={false}
                                autoComplete="off"
                            />
                        </div>

                        {/* Prénom + Nom */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Prénom</label>
                                <Input
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Nom</label>
                                <Input
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>
                        </div>

                        {/* Civilité */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Civilité</label>
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
                                    <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                        <SelectValue placeholder="Sélectionner..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-700 max-h-72">
                                        <SelectItem value="none" className="text-gray-200">—</SelectItem>
                                        {civilities.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)} className="text-gray-200">
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {showCivilityOther && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-200">Civilité (préciser)</label>
                                    <Input
                                        value={formData.civilityOther || ''}
                                        onChange={(e) => setFormData({ ...formData, civilityOther: e.target.value })}
                                        className="bg-gray-800 border-gray-700 text-gray-200"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Type de membre + Niveau d'accès */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Type de membre</label>
                                <Select
                                    value={formData.memberType}
                                    onValueChange={(value) => setFormData({ ...formData, memberType: value as UserFormData['memberType'] })}
                                >
                                    <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-700">
                                        {MEMBER_TYPE_VALUES.map((type) => (
                                            <SelectItem key={type} value={type} className="text-gray-200">
                                                {MEMBER_TYPE_LABELS[type]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">
                                    Niveau d&apos;accès {isAccessLevelLocked && <span className="text-xs text-gray-400">({getLockedReason()})</span>}
                                </label>
                                {isAccessLevelLocked ? (
                                    <div className="bg-gray-800/50 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200">
                                        {getAccessLevelLabel(formData.accessLevel)}
                                    </div>
                                ) : (
                                    <Select
                                        value={formData.accessLevel}
                                        onValueChange={(value) => setFormData({ ...formData, accessLevel: value as UserFormData['accessLevel'] })}
                                    >
                                        <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-800 border-gray-700">
                                            {ACCESS_LEVEL_VALUES
                                                .filter((level) => level !== 'super_admin' || currentUserAccessLevel === 'super_admin')
                                                .map((level) => (
                                                    <SelectItem key={level} value={level} className="text-gray-200">
                                                        {ACCESS_LEVEL_LABELS[level]}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                            Coordonnées
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Téléphone fixe</label>
                                <Input
                                    type="tel"
                                    value={formData.homePhone}
                                    onChange={(e) => setFormData({ ...formData, homePhone: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Téléphone portable</label>
                                <Input
                                    type="tel"
                                    value={formData.cellPhone}
                                    onChange={(e) => setFormData({ ...formData, cellPhone: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Addresses */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                                Adresses
                            </h3>
                            <Button
                                type="button"
                                onClick={handleAddAddress}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Ajouter
                            </Button>
                        </div>

                        {formData.addresses.map((address, index) => (
                            <div key={index} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-sm font-medium text-gray-300">Adresse {index + 1}</h4>
                                    <Button
                                        type="button"
                                        onClick={() => handleRemoveAddress(index)}
                                        size="sm"
                                        variant="destructive"
                                        className="bg-red-700 hover:bg-red-600"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">Adresse</label>
                                        <Input
                                            value={address.addressLine1}
                                            onChange={(e) => handleAddressChange(index, 'addressLine1', e.target.value)}
                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">Complément</label>
                                        <Input
                                            value={address.addressSupplement}
                                            onChange={(e) => handleAddressChange(index, 'addressSupplement', e.target.value)}
                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">Ville</label>
                                        <Input
                                            value={address.city}
                                            onChange={(e) => handleAddressChange(index, 'city', e.target.value)}
                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">Code postal</label>
                                        <Input
                                            value={address.postalCode}
                                            onChange={(e) => handleAddressChange(index, 'postalCode', e.target.value)}
                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">État/Province</label>
                                        <Input
                                            value={address.stateProvince}
                                            onChange={(e) => handleAddressChange(index, 'stateProvince', e.target.value)}
                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">Pays</label>
                                        <Input
                                            value={address.country}
                                            onChange={(e) => handleAddressChange(index, 'country', e.target.value)}
                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                        />
                                    </div>

                                    <div className="flex items-center space-x-2 md:col-span-2">
                                        <Checkbox
                                            checked={address.isDefault}
                                            onCheckedChange={(checked) => handleAddressChange(index, 'isDefault', checked as boolean)}
                                            className="border-gray-500 data-[state=checked]:bg-blue-600"
                                        />
                                        <label className="text-sm font-medium text-gray-200">Adresse par défaut</label>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Accounting - Always visible */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                            Comptabilité
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Affiliation non-profit</label>
                                <Input
                                    value={formData.nonProfitAffiliation}
                                    onChange={(e) => setFormData({ ...formData, nonProfitAffiliation: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">ID Gestconte</label>
                                <Input
                                    type="number"
                                    value={formData.gestconteId || ''}
                                    onChange={(e) => setFormData({ ...formData, gestconteId: e.target.value ? parseInt(e.target.value) : null })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium text-gray-200">Notes Gestconte</label>
                                <Textarea
                                    value={formData.gestconteNotes}
                                    onChange={(e) => setFormData({ ...formData, gestconteNotes: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Disponibilité (attributions) — lecteur only (#18b). */}
                    {formData.memberType === 'lecteur' && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                            Disponibilit&#233; (attributions)
                        </h3>

                        <div className="space-y-4">
                            {/* Disponible Checkbox - Only for Lecteurs */}
                            {formData.memberType === 'lecteur' && (
                                <>
                                    <div className="bg-gradient-to-br from-gray-800/40 to-gray-800/20 p-4 rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-all">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <Checkbox
                                                        checked={formData.isAvailable}
                                                        onCheckedChange={(checked) => setFormData({ ...formData, isAvailable: checked as boolean })}
                                                        className="h-5 w-5 border-2 border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 rounded-md transition-all"
                                                    />
                                                    {formData.isAvailable && (
                                                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="text-sm font-medium text-gray-200 cursor-pointer">
                                                        Disponible pour nouvelles assignations
                                                    </label>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        {formData.isAvailable
                                                            ? 'Peut recevoir de nouveaux livres'
                                                            : 'Ne peut pas recevoir de nouveaux livres'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                formData.isAvailable
                                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                    : 'bg-gray-600/20 text-gray-400 border border-gray-600/30'
                                            }`}>
                                                {formData.isAvailable ? 'Disponible' : 'Indisponible'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">Notes de disponibilité</label>
                                        <Textarea
                                            value={formData.availabilityNotes}
                                            onChange={(e) => setFormData({ ...formData, availabilityNotes: e.target.value })}
                                            className="bg-gray-800 border-gray-700 text-gray-200"
                                            placeholder="Ex: Parfois exigeant quant à la qualité des livres..."
                                        />
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
                            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                                Gestion du compte
                            </h3>
                            <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-700 flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-200">Mot de passe</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        G&#233;n&#232;re un nouveau mot de passe temporaire et l&apos;envoie par email
                                        &#224; la personne. L&apos;ancien mot de passe cessera de fonctionner.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    onClick={() => setIsPasswordResetDialogOpen(true)}
                                    variant="outline"
                                    className="bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shrink-0"
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
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                            Préférences
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Méthode de livraison préférée</label>
                                <Select
                                    value={formData.preferredDeliveryMethod}
                                    onValueChange={(value) => setFormData({ ...formData, preferredDeliveryMethod: value })}
                                >
                                    <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                        <SelectValue placeholder="Sélectionner..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-700">
                                        <SelectItem value="RETRAIT" className="text-gray-200">Retrait</SelectItem>
                                        <SelectItem value="ENVOI" className="text-gray-200">Envoi</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Méthode de distribution préférée</label>
                                <Select
                                    value={formData.preferredDistributionMethod}
                                    onValueChange={(value) => setFormData({ ...formData, preferredDistributionMethod: value })}
                                >
                                    <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                        <SelectValue placeholder="Sélectionner..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-700">
                                        <SelectItem value="cd" className="text-gray-200">CD</SelectItem>
                                        <SelectItem value="usb" className="text-gray-200">USB</SelectItem>
                                        <SelectItem value="download" className="text-gray-200">Téléchargement</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* #16: payment threshold + balance only for auditeur */}
                            {formData.memberType === 'auditeur' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">Seuil de paiement (€)</label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={formData.paymentThreshold}
                                            onChange={(e) => setFormData({ ...formData, paymentThreshold: e.target.value })}
                                            className="bg-gray-800 border-gray-700 text-gray-200"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">Solde actuel (€)</label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={formData.currentBalance}
                                            onChange={(e) => setFormData({ ...formData, currentBalance: e.target.value })}
                                            className="bg-gray-800 border-gray-700 text-gray-200"
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
                            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                                Paramètres de lecture
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-200">Spécialisation</label>
                                    <Input
                                        value={formData.specialization}
                                        onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                                        className="bg-gray-800 border-gray-700 text-gray-200"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-200">Nombre maximum d&apos;attributions simultanées</label>
                                    <Input
                                        type="number"
                                        value={formData.maxConcurrentAssignments || ''}
                                        onChange={(e) => setFormData({ ...formData, maxConcurrentAssignments: e.target.value ? parseInt(e.target.value) : null })}
                                        className="bg-gray-800 border-gray-700 text-gray-200"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notes - Always visible */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                            Notes
                        </h3>
                        <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="bg-gray-800 border-gray-700 text-gray-200 min-h-[100px]"
                            placeholder="Notes supplémentaires..."
                        />
                    </div>

                    {/* Submit Buttons */}
                    <div className="space-y-4">
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isLoading ? loadingText : submitButtonText}
                        </Button>

                        {showDelete && onDelete && (
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={isLoading}
                                onClick={handleDeleteClick}
                                className="w-full bg-red-700 hover:bg-red-600 text-white"
                            >
                                Supprimer la personne
                            </Button>
                        )}
                    </div>
                </form>

                {/* Deactivation Dialog */}
                <Dialog open={isPasswordResetDialogOpen} onOpenChange={setIsPasswordResetDialogOpen}>
                    <DialogContent className="bg-gray-900 border-gray-700">
                        <DialogHeader>
                            <DialogTitle className="text-gray-100">Réinitialiser le mot de passe</DialogTitle>
                            <DialogDescription className="text-gray-400">
                                Cette action génèrera un nouveau mot de passe temporaire et l&apos;enverra par email à la personne.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
                                <div className="flex gap-3">
                                    <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-yellow-200">
                                            Êtes-vous sûr de vouloir réinitialiser le mot de passe ?
                                        </p>
                                        <ul className="text-sm text-yellow-300/90 space-y-1 list-disc list-inside">
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
                                className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            >
                                Annuler
                            </Button>
                            <Button
                                type="button"
                                onClick={handlePasswordReset}
                                disabled={isResettingPassword}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {isResettingPassword ? 'Envoi en cours...' : 'Confirmer et envoyer'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
                    <DialogContent className="bg-gray-900 border-gray-700">
                        <DialogHeader>
                            <DialogTitle className="text-gray-100">Doublon possible</DialogTitle>
                            <DialogDescription className="text-gray-400">
                                Un ou plusieurs membres portent déjà ce nom. Vérifiez qu&apos;il
                                ne s&apos;agit pas de la même personne avant de continuer.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-60 overflow-y-auto space-y-2 py-2">
                            {duplicateMatches.map((m) => (
                                <div key={m.id} className="rounded border border-gray-700 bg-gray-800 p-2 text-sm text-gray-200">
                                    <div className="font-medium">
                                        {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.name || `#${m.id}`}
                                    </div>
                                    {m.email && <div className="text-gray-400">{m.email}</div>}
                                </div>
                            ))}
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setShowDuplicateDialog(false)}
                                className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                            >
                                Annuler
                            </Button>
                            <Button
                                onClick={() => {
                                    setShowDuplicateDialog(false);
                                    void doSubmit();
                                }}
                                className="bg-blue-600 hover:bg-blue-500 text-white"
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

export function AddUserFormBackend({
                                       onSuccess,
                                       userType,
                                       currentUserAccessLevel,
                                   }: {
    onSuccess?: (userId: number) => void;
    userType: UserType;
    currentUserAccessLevel?: string;
}) {
    const { toast } = useToast();

    const handleSubmit = async (formData: UserFormData): Promise<number> => {
        try {
            const response = await fetch('/api/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: data?.message || 'Échec de la création de la personne',
                });
                return Promise.reject();
            }

            // 207 = the account was created but the credentials email could not be
            // sent. The account exists, so let the flow complete (return the id) —
            // but warn the admin instead of reporting plain success.
            if (response.status === 207 || data?.emailSent === false) {
                toast({
                    title: "Compte créé — email non envoyé",
                    description: data?.message ||
                        "Le compte a été créé mais l'email d'identifiants n'a pas pu être envoyé. Utilisez « réinitialiser le mot de passe » pour le renvoyer.",
                    className: "bg-amber-100 border-amber-500 text-amber-900",
                });
                return data.user.id;
            }

            toast({
                title: "Succès",
                description: 'La personne a été créée avec succès',
                className: "bg-green-100 border-green-500 text-green-900"
            });

            return data.user.id;
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <UserFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Créer la personne"
            loadingText="Création en cours..."
            title="Créer un nouvel membre"
            onSuccess={onSuccess}
            userType={userType}
            currentUserAccessLevel={currentUserAccessLevel}
            warnOnDuplicateName
        />
    );
}

export function EditUserFormBackend({
                                        userId,
                                        initialData,
                                        onSuccess,
                                        currentUserAccessLevel,
                                        userType,
                                    }: {
    userId: string;
    initialData: UserFormData;
    onSuccess?: (userId: number, isDeleted?: boolean) => void;
    currentUserAccessLevel?: string;
    userType: UserType;
}) {
    const { toast } = useToast();

    const handleDelete = async (): Promise<void> => {
        try {
            const response = await fetch(`/api/user/${userId}`, {
                method: 'DELETE',
            });

            let data: { message?: string } = {};
            try { data = await response.json(); } catch { /* no body */ }

            if (!response.ok) {
                // Surface the API's specific reason (e.g. active attributions /
                // bills) as a clear toast rather than a generic message.
                const msg = data.message || 'Échec de la suppression de la personne';
                toast({
                    title: "Suppression impossible",
                    description: msg,
                    className: "bg-red-100 border-red-500 text-red-900",
                });
                throw new Error(msg);
            }

            toast({
                title: "Succès",
                description: data.message || 'La personne a été supprimée avec succès',
                className: "bg-green-100 border-green-500 text-green-900"
            });

            if (onSuccess) {
                onSuccess(parseInt(userId), true);
            }
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    };

    const handleSubmit = async (formData: UserFormData): Promise<number> => {
        try {
            const response = await fetch(`/api/user/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: data?.message || 'Échec de la mise à jour de la personne',
                });
                return Promise.reject();
            }

            // 207 = updated (e.g. promoted to a login account) but the credentials
            // email could not be sent. The update succeeded — warn, don't celebrate.
            if (response.status === 207 || data?.emailSent === false) {
                toast({
                    title: "Personne mise à jour — email non envoyé",
                    description: data?.message ||
                        "Les modifications ont été enregistrées mais l'email d'identifiants n'a pas pu être envoyé. Utilisez « réinitialiser le mot de passe » pour le renvoyer.",
                    className: "bg-amber-100 border-amber-500 text-amber-900",
                });
                return parseInt(userId);
            }

            toast({
                title: "Succès",
                description: 'La personne a été mise à jour avec succès',
                className: "bg-green-100 border-green-500 text-green-900"
            });

            return parseInt(userId);
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <UserFormBackendBase
            initialData={initialData}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            showDelete={true}
            submitButtonText="Mettre à jour la personne"
            loadingText="Mise à jour en cours..."
            title="Modifier la personne"
            onSuccess={onSuccess}
            currentUserAccessLevel={currentUserAccessLevel}
            userType={userType}
            userId={userId}
        />
    );
}