'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { KeyRound, Loader2, LogOut, Save } from 'lucide-react';
import { AdminCard } from '@/components/ui/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';
import { toast } from '@/hooks/use-toast';

interface AccountSecurityProps {
    name: string;
    email: string;
}

/**
 * « Identifiants et sécurité » — the only fields a person may change about
 * themselves, plus the two session actions.
 *
 * Fields stay editable rather than hiding behind a « Modifier » mode: there are
 * two of them, and the Save button only lights up once something differs, which
 * says the same thing with one control instead of three.
 *
 * Changing the e-mail ends the session, because it IS the login — the JWT is
 * keyed on the old address and every later request would resolve to nobody. The
 * confirmation says so before the write, rather than surprising the person with
 * a sign-out afterwards.
 */
export default function AccountSecurity({ name, email }: AccountSecurityProps) {
    const router = useRouter();
    const [form, setForm] = useState({ name, email });
    const [saving, setSaving] = useState(false);
    const [confirmEmail, setConfirmEmail] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);

    const emailChanged = form.email.trim().toLowerCase() !== email.trim().toLowerCase();
    const dirty = form.name.trim() !== name.trim() || emailChanged;

    const save = async () => {
        setSaving(true);
        try {
            const response = await fetch('/api/user/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: form.name, email: form.email }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.message || 'Échec de la mise à jour');
            }

            if (emailChanged) {
                toast({
                    title: 'Adresse email modifiée',
                    description: 'Reconnectez-vous avec votre nouvelle adresse.',
                });
                await signOut({ callbackUrl: '/auth/signin' });
                return;
            }

            toast({
                title: 'Profil mis à jour',
                description: 'Vos informations ont été enregistrées.',
            });
            router.refresh();
        } catch (error) {
            toast({
                title: 'Erreur',
                description:
                    error instanceof Error ? error.message : 'Échec de la mise à jour du profil',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (emailChanged) {
            setConfirmEmail(true);
            return;
        }
        void save();
    };

    return (
        <AdminCard className="p-6">
            <h2 className="text-lg font-semibold text-foreground">Identifiants et sécurité</h2>
            <p className="mt-1 text-sm text-muted-foreground">
                Votre nom d’affichage et l’adresse avec laquelle vous vous connectez. Le reste de
                votre fiche est tenu par le secrétariat.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="account-name">Nom d’affichage</Label>
                    <Input
                        id="account-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        autoComplete="name"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="account-email">Adresse email (identifiant de connexion)</Label>
                    <Input
                        id="account-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        autoComplete="email"
                        aria-describedby={emailChanged ? 'account-email-warning' : undefined}
                    />
                    {emailChanged && (
                        <p id="account-email-warning" className="text-xs text-amber-700 dark:text-amber-400">
                            Changer d’adresse vous déconnectera : il faudra vous reconnecter avec la
                            nouvelle.
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button type="submit" disabled={!dirty || saving}>
                        {saving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        Enregistrer
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setPasswordOpen(true)}>
                        <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                        Changer le mot de passe
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                    >
                        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                        Déconnexion
                    </Button>
                </div>
            </form>

            <AlertDialog open={confirmEmail} onOpenChange={setConfirmEmail}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Changer votre adresse de connexion ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Vous vous connecterez désormais avec{' '}
                            <span className="font-medium text-foreground">{form.email.trim()}</span>.
                            Votre session va se fermer immédiatement et vous devrez vous reconnecter
                            avec cette adresse et votre mot de passe actuel.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void save()}>
                            Changer et se déconnecter
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
        </AdminCard>
    );
}
