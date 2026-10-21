import { StickySubmitBar } from '@/components/ui/admin/StickySubmitBar';
import React, { useState, useEffect } from 'react';
import { IntentLink } from '@/components/admin/IntentLink';
import { useReferenceData } from '@/components/admin/ReferenceDataProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Mail } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useFormToast } from "@/hooks/useFormToast";
import { useConfirm } from '@/components/ui/confirm-dialog';
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
    ACCESS_LEVEL_VALUES,
    getAccessLevelLabel,
    DELIVERY_METHOD_VALUES,
    getDeliveryMethodLabel,
} from '@/lib/user-enums';
import { withCurrentValue } from '@/lib/select-options';
import { ReaderLanguagesField } from '@/components/ui/admin/ReaderLanguagesField';
import { MailingLabelButton } from '@/components/ui/admin/MailingLabelButton';
import { mailingAddressLines } from '@/lib/users/formatAddress';
import { getPostalName } from '@/lib/users/displayName';

interface UserFormBackendBaseProps {
    initialData?: UserFormData;
    onSubmit: (formData: UserFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    onSuccess?: (userId: number, isDeleted?: boolean) => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
    currentUserAccessLevel?: string;
    userType: UserType;
    userId?: string;
    /** When true (create flow), warn if an existing user shares first+last name. */
    warnOnDuplicateName?: boolean;
    /** False when the dossier behind the fiche already shows the cotisation. */
    showCotisation?: boolean;
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
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        homePhone: formatPhone(data.homePhone),
        cellPhone: formatPhone(data.cellPhone),
        gestconteNotes: data.gestconteNotes || '',
        nonProfitAffiliation: data.nonProfitAffiliation || '',
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

/**
 * Columns this form loads but no longer shows: a lecteur's availability, its
 * notes and the attribution cap belong to the Disponibilités panel; the
 * affiliation and the recording software are import leftovers. They stay out
 * of the save so it never writes back the values it loaded over a change made
 * in the panel meanwhile — the API reads an absent field as « unchanged », and
 * on creation falls back to its own defaults (disponible, 3 attributions).
 */
function withoutHiddenFields(data: UserFormData): UserFormData {
    const payload: Partial<UserFormData> = { ...data };
    delete payload.isAvailable;
    delete payload.availabilityNotes;
    delete payload.maxConcurrentAssignments;
    delete payload.nonProfitAffiliation;
    delete payload.saveType;
    return payload as UserFormData;
}

export function UserFormBackendBase({
                                        initialData,
                                        onSubmit,
                                        submitButtonText,
                                        loadingText,
                                        onSuccess,
                                        onDelete,
                                        showDelete,
                                        currentUserAccessLevel,
                                        userType,
                                        userId,
                                        warnOnDuplicateName = false,
                                        showCotisation = true,
                                    }: UserFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isPasswordResetDialogOpen, setIsPasswordResetDialogOpen] = useState(false);
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [duplicateMatches, setDuplicateMatches] = useState<
        { id: number; firstName: string | null; lastName: string | null; email: string | null }[]
    >([]);
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const { toast } = useToast();
    const { toastError, toastFailure } = useFormToast();
    const confirm = useConfirm();
    const { registerField, focusFirstInvalid } = useInvalidField();

    const { civilities, mediaFormats } = useReferenceData();

    const defaultMemberType: UserFormData['memberType'] =
        userType === 'auditeurs' ? 'auditeur' :
            userType === 'bienfaiteurs' ? 'bienfaiteur' :
                'lecteur';
    // Starting point for the access level, still derived from the tab the person
    // is created from: only the "permanents" tab creates a permanent, and only a
    // super admin may — everyone else starts as a plain member. The field itself
    // is editable again below (except on an auditeur, who never gets a back-office
    // permission). On edit the stored level is carried through untouched by
    // sanitizeInitialData.
    const defaultAccessLevel: UserFormData['accessLevel'] =
        userType === 'permanents' && currentUserAccessLevel === 'super_admin'
            ? 'admin'
            : 'member';

    const [formData, setFormData] = useState<UserFormData>(
        initialData
            ? sanitizeInitialData(initialData, defaultMemberType, defaultAccessLevel)
            : {
                email: '',
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
        try {
            const newUserId = await onSubmit(withoutHiddenFields(formData));
            if (onSuccess) {
                onSuccess(newUserId);
            }
        } catch (err) {
            toastFailure(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if ((formData.accessLevel === 'admin' || formData.accessLevel === 'super_admin') && !formData.email) {
            const msg = 'L\'email est requis pour les membres permanents';
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

        if (await confirm({
            title: `${formData.firstName} ${formData.lastName}`.trim()
                ? `Supprimer ${`${formData.firstName} ${formData.lastName}`.trim()} ?`
                : 'Supprimer cette personne ?',
            // Soft delete (DELETE /api/user/[id]) — the dossier offers « Restaurer ».
            description: 'Sa fiche disparaîtra des listes, mais pourra être restaurée depuis son dossier.',
            confirmLabel: 'Supprimer',
            destructive: true,
        })) {
            setIsLoading(true);
            try {
                await onDelete();
            } catch (err) {
                toastFailure(err, 'Suppression impossible');
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handlePasswordReset = async () => {
        if (!userId) {
            toast({
                variant: "destructive",
                title: "Réinitialisation impossible",
                description: "Identifiant de la personne manquant.",
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
                    title: "Réinitialisation impossible",
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
                title: "Mot de passe réinitialisé",
                description: "Un email a été envoyé à la personne.",
                className: "bg-green-100 border-green-500 text-green-900"
            });

            setIsPasswordResetDialogOpen(false);
        } catch (err) {
            console.error('Password reset error:', err);
            toast({
                variant: "destructive",
                title: "Réinitialisation impossible",
                description: "Le serveur n’a pas répondu. Réessayez dans un instant.",
            });
        } finally {
            setIsResettingPassword(false);
        }
    };

    // An auditeur never holds a back-office permission, so the field is hidden on
    // their fiche only — every other type (lecteur, permanent, bienfaiteur,
    // administration…) keeps it visible.
    const showAccessLevel = formData.memberType !== 'auditeur';

    // Visible but not editable: a plain permanent may not hand out access levels,
    // and a super admin's level can only be changed by another super admin.
    const isAccessLevelLocked =
        (initialData?.accessLevel === 'super_admin' && currentUserAccessLevel !== 'super_admin') ||
        currentUserAccessLevel === 'admin';

    // Sur la fiche d'un compte permanent, l'email est l'identifiant de connexion
    // et l'adresse du lien « mot de passe oublié » : seul un super administrateur
    // le change, et seul lui supprime la fiche (PATCH / DELETE /api/user/[id]).
    // Un permanent change le sien depuis « Mon compte ».
    const isPermanentAccount =
        initialData?.accessLevel === 'admin' || initialData?.accessLevel === 'super_admin';
    const isLoginAccountLocked = isPermanentAccount && currentUserAccessLevel !== 'super_admin';

    const getLockedReason = (): string =>
        currentUserAccessLevel === 'admin'
            ? 'Seuls les super administrateurs peuvent modifier les niveaux d\'accès'
            : 'Verrouillé';

    const selectedCivility = civilities.find((c) => c.id === formData.civilityId);
    const showCivilityOther = selectedCivility?.name === 'Autre';

    // Name as it will be printed on an étiquette d'adresse. Built from the live
    // form state rather than the saved row on purpose: correcting a misspelt
    // name or a wrong door number and printing the envelope straight away is the
    // usual reason to be on this screen at all.
    const postalName = getPostalName({
        firstName: formData.firstName,
        lastName: formData.lastName,
        civility: showCivilityOther ? formData.civilityOther : selectedCivility?.name,
    });

    return (
        <div>
                {userId && showCotisation && (
                    <CotisationStatusBanner userId={userId} memberType={formData.memberType} />
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
                                disabled={isLoginAccountLocked}
                            />
                            {isLoginAccountLocked && (
                                <p className="text-xs text-muted-foreground">
                                    C’est l’identifiant de connexion d’un compte permanent : seul un super
                                    administrateur peut le modifier. Chacun change le sien depuis « Mon compte ».
                                </p>
                            )}
                        </div>

                        {/* Prénom + Nom + Civilité — une seule rangée, dans le même ordre
                            qu'avant ; « préciser » se range sous la civilité. */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                <div className="space-y-2 md:col-start-3">
                                    <label className="text-sm font-medium text-foreground">Civilité (préciser)</label>
                                    <Input
                                        value={formData.civilityOther || ''}
                                        onChange={(e) => setFormData({ ...formData, civilityOther: e.target.value })}
                                        className="bg-field border-border text-foreground"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Type de membre + Niveau d'accès (hidden on an auditeur). */}
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

                            {showAccessLevel && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">
                                        Niveau d&apos;accès {isAccessLevelLocked && <span className="text-xs text-muted-foreground">({getLockedReason()})</span>}
                                    </label>
                                    {isAccessLevelLocked ? (
                                        <div className="bg-card/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                                            {getAccessLevelLabel(formData.accessLevel)}
                                        </div>
                                    ) : (
                                        <Select
                                            value={formData.accessLevel}
                                            onValueChange={(value) => setFormData({ ...formData, accessLevel: value as UserFormData['accessLevel'] })}
                                        >
                                            <SelectTrigger className="bg-field border-border text-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-card border-border">
                                                {ACCESS_LEVEL_VALUES
                                                    .filter((level) => level !== 'super_admin' || currentUserAccessLevel === 'super_admin')
                                                    .map((level) => (
                                                        <SelectItem key={level} value={level} className="text-foreground">
                                                            {getAccessLevelLabel(level)}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Gestion du compte — password reset, permanent members (super_admin only).
                        Right under the email and the access level it goes with. */}
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
                                    <div className="flex items-center gap-2">
                                        {/* Prints THIS address, not the default one — which is
                                            the whole reason the button sits per-card rather
                                            than once in the section header. */}
                                        <MailingLabelButton
                                            variant="icon"
                                            label={{
                                                recipient: postalName,
                                                lines: mailingAddressLines(address),
                                            }}
                                        />
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

                                    {/* Avec une seule adresse, « par défaut » ne choisit rien. */}
                                    {formData.addresses.length >= 2 && (
                                        <div className="flex items-center space-x-2 md:col-span-2">
                                            <Checkbox
                                                checked={address.isDefault}
                                                onCheckedChange={(checked) => handleAddressChange(index, 'isDefault', checked as boolean)}
                                                className="border-border data-[state=checked]:bg-primary"
                                            />
                                            <label className="text-sm font-medium text-foreground">Adresse par défaut</label>
                                        </div>
                                    )}
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
                            {/* #16: payment threshold + balance only for auditeur — accounting, not a préférence. */}
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

                    {/* Reader-specific fields - Only for Lecteurs. Availability (the
                        « disponible » switch, its notes) and the attribution cap are
                        edited in the Disponibilités panel only — two editors for the
                        same three columns drifted apart. The languages stay here. */}
                    {formData.memberType === 'lecteur' && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                                Paramètres de lecture
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-sm font-medium text-foreground">Langues (spécialisation)</label>
                                    <ReaderLanguagesField
                                        value={formData.languages}
                                        onChange={(languages) => setFormData({ ...formData, languages })}
                                    />
                                </div>

                                <p className="text-sm text-muted-foreground md:col-span-2">
                                    Disponibilité et charge : à gérer dans{' '}
                                    <IntentLink
                                        href={userId ? `/admin/disponibilites?person=${userId}` : '/admin/disponibilites'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                                    >
                                        Disponibilités
                                    </IntentLink>
                                </p>
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
                        />
                    </div>

                    {/* Submit Buttons */}
                    <StickySubmitBar>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-muted hover:bg-muted text-foreground border-border"
                        >
                            {isLoading ? loadingText : submitButtonText}
                        </Button>
                    </StickySubmitBar>
                    <div className="space-y-4">
                        {showDelete && onDelete && !isLoginAccountLocked && (
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

                {/* Password reset dialog */}
                <Dialog open={isPasswordResetDialogOpen} onOpenChange={setIsPasswordResetDialogOpen}>
                    <DialogContent className="bg-card border-border">
                        <DialogHeader>
                            <DialogTitle className="text-foreground">Réinitialiser le mot de passe</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Un nouveau mot de passe temporaire sera envoyé à <strong>{formData.email}</strong>. L&apos;ancien ne fonctionnera plus et la personne devra le changer à sa prochaine connexion.
                            </DialogDescription>
                        </DialogHeader>
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
                                        {[m.firstName, m.lastName].filter(Boolean).join(' ') || `#${m.id}`}
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
            </div>
    );
}
