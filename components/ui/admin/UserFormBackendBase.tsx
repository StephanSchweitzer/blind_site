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

        if (!formData.email) {
            setError('L\'email est requis');
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

    return (
        <Card className="border-gray-800 shadow-xl bg-gray-950 text-gray-100">
            <CardHeader>
                <CardTitle className="text-gray-100 text-2xl">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <Alert className="bg-red-950 border-red-800 text-red-400">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Basic Information */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-2">
                            Informations de base
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-2">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData(prev => ({...prev, email: e.target.value}))}
                                    required
                                    className="bg-gray-900 border-gray-700 text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-2">
                                    Rôle
                                </label>
                                <Select
                                    value={formData.role}
                                    onValueChange={(value) => setFormData(prev => ({...prev, role: value}))}
                                >
                                    <SelectTrigger className="bg-gray-900 border-gray-700 text-gray-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-900 border-gray-700">
                                        <SelectItem value="user" className="text-gray-200 focus:bg-gray-800">Utilisateur</SelectItem>
                                        <SelectItem value="admin" className="text-gray-200 focus:bg-gray-800">Administrateur</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-2">
                                    Nom complet
                                </label>
                                <Input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                                    className="bg-gray-900 border-gray-700 text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-2">
                                    Prénom
                                </label>
                                <Input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData(prev => ({...prev, firstName: e.target.value}))}
                                    className="bg-gray-900 border-gray-700 text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-2">
                                    Nom de famille
                                </label>
                                <Input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData(prev => ({...prev, lastName: e.target.value}))}
                                    className="bg-gray-900 border-gray-700 text-gray-200"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Contact Information */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-2">
                            Coordonnées
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-2">
                                    Téléphone fixe
                                </label>
                                <Input
                                    type="tel"
                                    value={formData.homePhone}
                                    onChange={(e) => setFormData(prev => ({...prev, homePhone: e.target.value}))}
                                    className="bg-gray-900 border-gray-700 text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-2">
                                    Téléphone portable
                                </label>
                                <Input
                                    type="tel"
                                    value={formData.cellPhone}
                                    onChange={(e) => setFormData(prev => ({...prev, cellPhone: e.target.value}))}
                                    className="bg-gray-900 border-gray-700 text-gray-200"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Addresses Section */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                            <h3 className="text-lg font-semibold text-gray-200">
                                Adresses
                            </h3>
                            <Button
                                type="button"
                                onClick={handleAddAddress}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                size="sm"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Ajouter une adresse
                            </Button>
                        </div>

                        {formData.addresses.map((address, index) => (
                            <div key={index} className="border border-gray-700 rounded-lg p-4 space-y-4 bg-gray-900">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-md font-medium text-gray-300">
                                        Adresse {index + 1}
                                    </h4>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleRemoveAddress(index)}
                                        className="bg-red-600 hover:bg-red-700"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="text-sm font-medium text-gray-300 block mb-2">
                                            Adresse ligne 1
                                        </label>
                                        <Input
                                            type="text"
                                            value={address.addressLine1}
                                            onChange={(e) => handleAddressChange(index, 'addressLine1', e.target.value)}
                                            className="bg-gray-800 border-gray-700 text-gray-200"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-sm font-medium text-gray-300 block mb-2">
                                            Complément d&apos;adresse
                                        </label>
                                        <Input
                                            type="text"
                                            value={address.addressSupplement}
                                            onChange={(e) => handleAddressChange(index, 'addressSupplement', e.target.value)}
                                            className="bg-gray-800 border-gray-700 text-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-300 block mb-2">
                                            Ville
                                        </label>
                                        <Input
                                            type="text"
                                            value={address.city}
                                            onChange={(e) => handleAddressChange(index, 'city', e.target.value)}
                                            className="bg-gray-800 border-gray-700 text-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-300 block mb-2">
                                            Code postal
                                        </label>
                                        <Input
                                            type="text"
                                            value={address.postalCode}
                                            onChange={(e) => handleAddressChange(index, 'postalCode', e.target.value)}
                                            className="bg-gray-800 border-gray-700 text-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-300 block mb-2">
                                            État/Province
                                        </label>
                                        <Input
                                            type="text"
                                            value={address.stateProvince}
                                            onChange={(e) => handleAddressChange(index, 'stateProvince', e.target.value)}
                                            className="bg-gray-800 border-gray-700 text-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-300 block mb-2">
                                            Pays
                                        </label>
                                        <Input
                                            type="text"
                                            value={address.country}
                                            onChange={(e) => handleAddressChange(index, 'country', e.target.value)}
                                            className="bg-gray-800 border-gray-700 text-gray-200"
                                        />
                                    </div>
                                    <div className="md:col-span-2 flex items-center space-x-2">
                                        <Checkbox
                                            id={`default-${index}`}
                                            checked={address.isDefault}
                                            onCheckedChange={(checked) => handleAddressChange(index, 'isDefault', checked as boolean)}
                                        />
                                        <label
                                            htmlFor={`default-${index}`}
                                            className="text-sm font-medium text-gray-300 cursor-pointer"
                                        >
                                            Adresse par défaut
                                        </label>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Additional Information - Only for Auditeurs */}
                    {userType === 'auditeurs' && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-2">
                                Informations supplémentaires
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Notes Gestconte
                                    </label>
                                    <Textarea
                                        value={formData.gestconteNotes}
                                        onChange={(e) => setFormData(prev => ({...prev, gestconteNotes: e.target.value}))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        ID Gestconte
                                    </label>
                                    <Input
                                        type="number"
                                        value={formData.gestconteId?.toString() ?? ''}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            gestconteId: e.target.value ? parseInt(e.target.value) : null
                                        }))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Affiliation à but non lucratif
                                    </label>
                                    <Input
                                        type="text"
                                        value={formData.nonProfitAffiliation}
                                        onChange={(e) => setFormData(prev => ({...prev, nonProfitAffiliation: e.target.value}))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Méthode de livraison préférée
                                    </label>
                                    <Input
                                        type="text"
                                        value={formData.preferredDeliveryMethod}
                                        onChange={(e) => setFormData(prev => ({...prev, preferredDeliveryMethod: e.target.value}))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Seuil de paiement
                                    </label>
                                    <Input
                                        type="text"
                                        value={formData.paymentThreshold}
                                        onChange={(e) => setFormData(prev => ({...prev, paymentThreshold: e.target.value}))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Solde actuel
                                    </label>
                                    <Input
                                        type="text"
                                        value={formData.currentBalance}
                                        onChange={(e) => setFormData(prev => ({...prev, currentBalance: e.target.value}))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Méthode de distribution préférée
                                    </label>
                                    <Input
                                        type="text"
                                        value={formData.preferredDistributionMethod}
                                        onChange={(e) => setFormData(prev => ({...prev, preferredDistributionMethod: e.target.value}))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Reader-specific fields - Only for Lecteurs */}
                    {userType === 'lecteurs' && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-2">
                                Informations lecteur
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2 flex items-center space-x-2">
                                    <Checkbox
                                        id="isAvailable"
                                        checked={formData.isAvailable}
                                        onCheckedChange={(checked) => setFormData(prev => ({...prev, isAvailable: checked as boolean}))}
                                    />
                                    <label
                                        htmlFor="isAvailable"
                                        className="text-sm font-medium text-gray-300 cursor-pointer"
                                    >
                                        Disponible pour les affectations
                                    </label>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Notes de disponibilité
                                    </label>
                                    <Textarea
                                        value={formData.availabilityNotes}
                                        onChange={(e) => setFormData(prev => ({...prev, availabilityNotes: e.target.value}))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Spécialisation
                                    </label>
                                    <Input
                                        type="text"
                                        value={formData.specialization}
                                        onChange={(e) => setFormData(prev => ({...prev, specialization: e.target.value}))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Affectations simultanées maximales
                                    </label>
                                    <Input
                                        type="number"
                                        value={formData.maxConcurrentAssignments?.toString() ?? ''}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            maxConcurrentAssignments: e.target.value ? parseInt(e.target.value) : null
                                        }))}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* General Notes */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-2">
                            Notes générales
                        </h3>
                        <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
                            className="bg-gray-900 border-gray-700 text-gray-200 min-h-[100px]"
                            placeholder="Notes additionnelles..."
                        />
                    </div>

                    {/* Status Section - Only show for editing and if user is admin */}
                    {initialData && currentUserRole === 'admin' && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-2">
                                Statut de l&apos;utilisateur
                            </h3>
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="isActive"
                                        checked={formData.isActive}
                                        disabled
                                    />
                                    <label
                                        htmlFor="isActive"
                                        className="text-sm font-medium text-gray-300"
                                    >
                                        Compte actif
                                    </label>
                                </div>
                                {formData.isActive ? (
                                    <Button
                                        type="button"
                                        onClick={() => setIsDeactivationDialogOpen(true)}
                                        className="bg-orange-600 hover:bg-orange-700 text-white"
                                        disabled={isLoading}
                                    >
                                        <UserX className="h-4 w-4 mr-2" />
                                        Désactiver le compte
                                    </Button>
                                ) : (
                                    <Button
                                        type="button"
                                        onClick={() => setIsActivationDialogOpen(true)}
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                        disabled={isLoading}
                                    >
                                        <UserCheck className="h-4 w-4 mr-2" />
                                        Activer le compte
                                    </Button>
                                )}
                            </div>
                            {formData.terminationReason && (
                                <div className="mt-4 p-4 bg-gray-800 border border-gray-700 rounded-lg">
                                    <label className="text-sm font-medium text-gray-300 block mb-2">
                                        Raison de désactivation/activation
                                    </label>
                                    <p className="text-gray-400">{formData.terminationReason}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-between pt-6">
                        <div>
                            {showDelete && onDelete && (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={handleDeleteClick}
                                    disabled={isLoading}
                                    className="bg-red-600 hover:bg-red-700"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Supprimer
                                </Button>
                            )}
                        </div>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isLoading ? loadingText : submitButtonText}
                        </Button>
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