// components/ChangePasswordDialog.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type ChangePasswordDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/** Le minimum que POST /api/user/change-password impose. Dit avant, plutôt qu'après un refus. */
const MIN_LENGTH = 8;

// A simple password strength calculation.
const computePasswordStrength = (password: string): number => {
    let strength = 0;
    if (password.length >= MIN_LENGTH) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    return strength;
};

const strengthColor = (strength: number): string =>
    strength <= 1 ? 'bg-red-600' : strength === 2 ? 'bg-amber-500' : strength === 3 ? 'bg-blue-600' : 'bg-emerald-600';

/**
 * Changer son mot de passe, depuis « Mon compte ».
 *
 * Ce qui a changé, et pourquoi :
 * - les couleurs viennent du thème : la fenêtre était gris foncé en dur, une
 *   boîte sombre au milieu du thème clair ;
 * - `autocomplete` sur chaque champ, pour que le gestionnaire de mots de passe
 *   propose l'actuel et enregistre le nouveau ;
 * - les champs se vident à la fermeture : rouverte, la fenêtre montrait encore
 *   les mots de passe tapés la fois précédente ;
 * - une confirmation après l'enregistrement — la fenêtre se fermait sans rien
 *   dire, on ne savait pas si c'était fait ;
 * - les 8 caractères minimum sont annoncés sous le champ, et la jauge
 *   n'apparaît qu'une fois qu'on tape (elle disait « Faible » sur un champ vide).
 */
export default function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setError('');
        }
        onOpenChange(next);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword.length < MIN_LENGTH) {
            setError(`Le nouveau mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`);
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Les nouveaux mots de passe ne correspondent pas.');
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

            toast({ title: 'Mot de passe modifié' });
            handleOpenChange(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setIsSubmitting(false);
        }
    };

    const strength = computePasswordStrength(newPassword);
    const strengthLabel = strength < 2 ? 'Faible' : strength < 3 ? 'Moyen' : 'Fort';

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="text-foreground">Changer le mot de passe</DialogTitle>
                    <DialogDescription>
                        Veuillez entrer votre mot de passe actuel et choisir un nouveau mot de passe.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                        {error && (
                            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                                {error}
                            </p>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="current-password">Mot de passe actuel</Label>
                            <Input
                                id="current-password"
                                type="password"
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-password">Nouveau mot de passe</Label>
                            <Input
                                id="new-password"
                                type="password"
                                autoComplete="new-password"
                                aria-describedby="new-password-hint"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                            <p id="new-password-hint" className="text-sm text-muted-foreground">
                                Au moins {MIN_LENGTH} caractères.
                                {newPassword && <> Force du mot de passe : {strengthLabel}.</>}
                            </p>
                            {newPassword && (
                                <div aria-hidden="true" className="h-2 w-full rounded bg-muted">
                                    <div
                                        style={{ width: `${(strength / 4) * 100}%` }}
                                        className={`h-full rounded ${strengthColor(strength)}`}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                            Annuler
                        </Button>
                        <Button type="submit" disabled={isSubmitting} className="bg-muted hover:bg-muted text-foreground border-border">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Changement en cours…
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
