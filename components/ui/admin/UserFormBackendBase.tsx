import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Plus, Trash2, UserX, UserCheck } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { AddressFormData, UserFormData, UserType } from '@/types';

interface UserFormBackendBaseProps {
    initialData?: UserFormData;
    onSubmit: (formData: UserFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (userId: number, isDeleted?: boolean) => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
    currentUserRole?: string;
    userType: UserType;
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

export function UserFormBackendBase({
                                        initialData,
                                        onSubmit,
                                        submitButtonText,
                                        loadingText,
                                        title,
                                        onSuccess,
                                        onDelete,
                                        showDelete,
                                        currentUserRole,
                                        userType,
                                    }: UserFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDeactivationDialogOpen, setIsDeactivationDialogOpen] = useState(false);
    const [isActivationDialogOpen, setIsActivationDialogOpen] = useState(false);
    const [deactivationReason, setDeactivationReason] = useState('');
    const [activationReason, setActivationReason] = useState('');
    const { toast } = useToast();

    const defaultRole = userType === 'auditeurs' ? 'user' : 'admin';

    const [formData, setFormData] = useState<UserFormData>(initialData || {
        email: '',
        name: '',
        role: defaultRole,
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
    });

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        // Email is required for admin/super_admin roles
        if ((formData.role === 'admin' || formData.role === 'super_admin') && !formData.email) {
            setError('L\'email est requis pour les lecteurs');
            setIsLoading(false);
            return;
        }

        try {
            const newUserId = await onSubmit(formData);
            if (onSuccess) {
                onSuccess(newUserId);
            }
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Échec du traitement de l\'individuel');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;

        if (window.confirm('Êtes-vous sûr de vouloir supprimer cet individuel ?')) {
            setIsLoading(true);
            try {
                await onDelete();
            } catch (err) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('Échec de la suppression de l\'individuel');
                }
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleDeactivate = async () => {
        if (!deactivationReason.trim()) {
            toast({
                variant: "destructive",
                title: "Erreur",
                description: "Veuillez fournir une raison pour la désactivation",
            });
            return;
        }

        setIsLoading(true);
        try {
            const updatedFormData = {
                ...formData,
                isActive: false,
                terminationReason: deactivationReason.trim(),
            };

            const userId = await onSubmit(updatedFormData);

            toast({
                title: "Succès",
                description: "L'individuel a été désactivé avec succès",
                className: "bg-green-100 border-green-500 text-green-900"
            });

            setIsDeactivationDialogOpen(false);
            setDeactivationReason('');

            if (onSuccess) {
                onSuccess(userId);
            }
        } catch (err) {
            if (err instanceof Error) {
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: err.message,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: "Échec de la désactivation de l'individuel",
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleActivate = async () => {
        if (!activationReason.trim()) {
            toast({
                variant: "destructive",
                title: "Erreur",
                description: "Veuillez fournir une raison pour l'activation",
            });
            return;
        }

        setIsLoading(true);
        try {
            const updatedFormData = {
                ...formData,
                isActive: true,
                terminationReason: activationReason.trim(),
            };

            const userId = await onSubmit(updatedFormData);

            toast({
                title: "Succès",
                description: "L'individuel a été activé avec succès",
                className: "bg-green-100 border-green-500 text-green-900"
            });

            setIsActivationDialogOpen(false);
            setActivationReason('');

            if (onSuccess) {
                onSuccess(userId);
            }
        } catch (err) {
            if (err instanceof Error) {
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: err.message,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: "Échec de l'activation de l'individuel",
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Check if role field should be locked
    const isRoleLocked = initialData && initialData.role === 'super_admin' && currentUserRole !== 'super_admin';

    // Get role display name
    const getRoleDisplayName = (role: string): string => {
        switch (role) {
            case 'user':
                return 'Auditeur';
            case 'admin':
                return 'Lecteur';
            case 'super_admin':
                return 'Super Admin';
            default:
                return role;
        }
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">
                                    Email {(formData.role === 'admin' || formData.role === 'super_admin') && <span className="text-red-500">*</span>}
                                </label>
                                <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                    required={formData.role === 'admin' || formData.role === 'super_admin'}
                                    autoFocus={false}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Nom complet</label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>

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

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Rôle</label>
                                {isRoleLocked ? (
                                    <div className="flex items-center h-10 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-400">
                                        <span>{getRoleDisplayName(formData.role)} (Verrouillé)</span>
                                    </div>
                                ) : (
                                    <Select
                                        value={formData.role}
                                        onValueChange={(value) => setFormData({ ...formData, role: value })}
                                    >
                                        <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-800 border-gray-700">
                                            <SelectItem value="user" className="text-gray-200">Auditeur</SelectItem>
                                            <SelectItem value="admin" className="text-gray-200">Lecteur</SelectItem>
                                            {currentUserRole === 'super_admin' && (
                                                <SelectItem value="super_admin" className="text-gray-200">Super Admin</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Contact Information */}
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

                    {/* Accounting */}
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

                    {/* Status & Availability */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                            Statut et disponibilité
                        </h3>

                        <div className="space-y-4">
                            {/* Active Status with Activate/Deactivate Buttons */}
                            <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-700">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                                            formData.isActive
                                                ? 'bg-green-500/20 text-green-400'
                                                : 'bg-red-500/20 text-red-400'
                                        }`}>
                                            {formData.isActive ? (
                                                <UserCheck className="h-5 w-5" />
                                            ) : (
                                                <UserX className="h-5 w-5" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-200">
                                                Statut: {formData.isActive ? 'Actif' : 'Inactif'}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {formData.isActive
                                                    ? 'L\'individuel est actif'
                                                    : 'L\'individuel n\'est pas actif'}
                                            </p>
                                        </div>
                                    </div>

                                    {initialData && (
                                        <div>
                                            {formData.isActive ? (
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    onClick={() => setIsDeactivationDialogOpen(true)}
                                                    className="bg-orange-600 hover:bg-orange-700 text-white"
                                                >
                                                    <UserX className="h-4 w-4 mr-2" />
                                                    Désactiver
                                                </Button>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    onClick={() => setIsActivationDialogOpen(true)}
                                                    className="bg-green-600 hover:bg-green-700 text-white"
                                                >
                                                    <UserCheck className="h-4 w-4 mr-2" />
                                                    Activer
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {formData.terminationReason && (
                                    <div className="mt-3 pt-3 border-t border-gray-700">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                                            Raison du changement
                                        </label>
                                        <div className="mt-1 px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-md text-sm text-gray-300">
                                            {formData.terminationReason}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Disponible Checkbox - Only for Lecteurs (admin/super_admin) */}
                            {(formData.role === 'admin' || formData.role === 'super_admin') && (
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
                                            placeholder="Ex: En vacances jusqu'au 15 janvier..."
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Preferences & Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2">
                            Préférences
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Méthode de livraison préférée</label>
                                <Input
                                    value={formData.preferredDeliveryMethod}
                                    onChange={(e) => setFormData({ ...formData, preferredDeliveryMethod: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Méthode de distribution préférée</label>
                                <Input
                                    value={formData.preferredDistributionMethod}
                                    onChange={(e) => setFormData({ ...formData, preferredDistributionMethod: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Seuil de paiement</label>
                                <Input
                                    value={formData.paymentThreshold}
                                    onChange={(e) => setFormData({ ...formData, paymentThreshold: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">Solde actuel</label>
                                <Input
                                    value={formData.currentBalance}
                                    onChange={(e) => setFormData({ ...formData, currentBalance: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-gray-200"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Reader-specific fields - Only for Lecteurs (admin/super_admin) */}
                    {(formData.role === 'admin' || formData.role === 'super_admin') && (
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
                                    <label className="text-sm font-medium text-gray-200">Nombre maximum d&apos;affectations simultanées</label>
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

                    {/* Notes */}
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
                                Supprimer l&apos;individuel
                            </Button>
                        )}
                    </div>
                </form>

                {/* Deactivation Dialog */}
                <Dialog open={isDeactivationDialogOpen} onOpenChange={setIsDeactivationDialogOpen}>
                    <DialogContent className="bg-gray-900 border-gray-700">
                        <DialogHeader>
                            <DialogTitle className="text-gray-100">Désactiver l&apos;individuel</DialogTitle>
                            <DialogDescription className="text-gray-400">
                                Cette action désactivera l&apos;individuel. Veuillez fournir une raison pour cette action.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">
                                    Raison de la désactivation <span className="text-red-500">*</span>
                                </label>
                                <Textarea
                                    value={deactivationReason}
                                    onChange={(e) => setDeactivationReason(e.target.value)}
                                    className="bg-gray-800 border-gray-700 text-gray-200 min-h-[100px]"
                                    placeholder="Expliquez pourquoi cet individuel est désactivé..."
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setIsDeactivationDialogOpen(false);
                                    setDeactivationReason('');
                                }}
                                className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            >
                                Annuler
                            </Button>
                            <Button
                                type="button"
                                onClick={handleDeactivate}
                                disabled={isLoading || !deactivationReason.trim()}
                                className="bg-orange-600 hover:bg-orange-700 text-white"
                            >
                                {isLoading ? 'Désactivation...' : 'Confirmer la désactivation'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Activation Dialog */}
                <Dialog open={isActivationDialogOpen} onOpenChange={setIsActivationDialogOpen}>
                    <DialogContent className="bg-gray-900 border-gray-700">
                        <DialogHeader>
                            <DialogTitle className="text-gray-100">Activer l&apos;individuel</DialogTitle>
                            <DialogDescription className="text-gray-400">
                                Cette action activera l&apos;individuel. Veuillez fournir une raison pour cette action.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">
                                    Raison de l&apos;activation <span className="text-red-500">*</span>
                                </label>
                                <Textarea
                                    value={activationReason}
                                    onChange={(e) => setActivationReason(e.target.value)}
                                    className="bg-gray-800 border-gray-700 text-gray-200 min-h-[100px]"
                                    placeholder="Expliquez pourquoi cet individuel est activé..."
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setIsActivationDialogOpen(false);
                                    setActivationReason('');
                                }}
                                className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            >
                                Annuler
                            </Button>
                            <Button
                                type="button"
                                onClick={handleActivate}
                                disabled={isLoading || !activationReason.trim()}
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                {isLoading ? 'Activation...' : 'Confirmer l\'activation'}
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
                                       userType
                                   }: {
    onSuccess?: (userId: number) => void;
    userType: UserType;
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
                    description: data?.message || 'Échec de la création de l\'individuel',
                });
                return Promise.reject();
            }

            toast({
                title: "Succès",
                description: 'L\'individuel a été créé avec succès',
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
            submitButtonText="Créer l'individuel"
            loadingText="Création en cours..."
            title="Créer un nouvel membre"
            onSuccess={onSuccess}
            userType={userType}
        />
    );
}

export function EditUserFormBackend({
                                        userId,
                                        initialData,
                                        onSuccess,
                                        currentUserRole,
                                        userType,
                                    }: {
    userId: string;
    initialData: UserFormData;
    onSuccess?: (userId: number, isDeleted?: boolean) => void;
    currentUserRole?: string;
    userType: UserType;
}) {
    const { toast } = useToast();

    const handleDelete = async (): Promise<void> => {
        try {
            const response = await fetch(`/api/user/${userId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Échec de la suppression de l\'individuel');
            }

            toast({
                title: "Succès",
                description: 'L\'individuel a été supprimé avec succès',
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

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: errorData?.message || 'Échec de la mise à jour de l\'individuel',
                });
                return Promise.reject();
            }

            toast({
                title: "Succès",
                description: 'L\'individuel a été mis à jour avec succès',
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
            submitButtonText="Mettre à jour l'individuel"
            loadingText="Mise à jour en cours..."
            title="Modifier l'individuel"
            onSuccess={onSuccess}
            currentUserRole={currentUserRole}
            userType={userType}
        />
    );
}