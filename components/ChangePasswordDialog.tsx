// components/ChangePasswordDialog.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';

type ChangePasswordDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export default function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    // A simple password strength calculation.
    const computePasswordStrength = (password: string): number => {
        let strength = 0;
        if (password.length >= 8) strength += 1;
        if (/[A-Z]/.test(password)) strength += 1;
        if (/[0-9]/.test(password)) strength += 1;
        if (/[^A-Za-z0-9]/.test(password)) strength += 1;
        return strength;
    };

    const getStrengthColor = (strength: number): string => {
        switch (strength) {
            case 0:
            case 1:
                return 'bg-red-500';
            case 2:
                return 'bg-yellow-500';
            case 3:
                return 'bg-blue-500';
            case 4:
                return 'bg-green-500';
            default:
                return 'bg-gray-500';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError("Les nouveaux mots de passe ne correspondent pas.");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch('/api/user/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Échec de la modification du mot de passe');
            }

            onOpenChange(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setIsSubmitting(false);
        }
    };

    const strength = computePasswordStrength(newPassword);
    const strengthPercentage = (strength / 4) * 100;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-gray-800 text-gray-100 border-gray-700">
                <DialogHeader>
                    <DialogTitle>Changer le mot de passe</DialogTitle>
                    <DialogDescription>
                        Veuillez entrer votre mot de passe actuel et choisir un nouveau mot de passe.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                        {error && (
                            <div className="p-2 bg-red-600 text-white rounded">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="current-password">Mot de passe actuel</Label>
                            <Input
                                id="current-password"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                                className="bg-gray-700 border-gray-600 text-gray-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-password">Nouveau mot de passe</Label>
                            <Input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                className="bg-gray-700 border-gray-600 text-gray-200"
                            />
                            {/* Visual password strength meter */}
                            <div className="h-2 w-full bg-gray-600 rounded">
                                <div
                                    style={{ width: `${strengthPercentage}%` }}
                                    className={`h-full rounded ${getStrengthColor(strength)}`}
                                ></div>
                            </div>
                            <p className="text-sm text-gray-400">
                                Force du mot de passe: {strength < 2 ? 'Faible' : strength < 3 ? 'Moyen' : 'Fort'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="bg-gray-700 border-gray-600 text-gray-200"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                        >
                            Annuler
                        </Button>
                        <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {isSubmitting ? (
                                <>
                                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-0 border-white rounded-full"></div>
                                    Changement en cours...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Enregistrer
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
