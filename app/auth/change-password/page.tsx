// app/auth/change-password/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { checkPasswordStrength, MIN_PASSWORD_SCORE } from '@/lib/auth/passwordStrength';

export default function ChangePasswordPage() {
    const { status } = useSession();
    const router = useRouter();

    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [passwordStrength, setPasswordStrength] = useState(() => checkPasswordStrength(''));

    // Check if user needs to change password
    useEffect(() => {
        const checkPasswordStatus = async () => {
            if (status === 'authenticated') {
                try {
                    const response = await fetch('/api/user/password-status');
                    const data = await response.json();

                    if (!data.needsChange) {
                        // If user doesn't need to change password, redirect to home
                        router.push('/');
                    }
                } catch (err) {
                    console.error('Error checking password status:', err);
                }
            } else if (status === 'unauthenticated') {
                router.push('/signin');
            }
        };

        checkPasswordStatus();
    }, [status, router]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setPasswordData(prev => ({
            ...prev,
            [name]: value
        }));

        if (name === 'newPassword') {
            // Scored by the shared rule (lib/auth/passwordStrength.ts), so this
            // meter and the reset-link page can never disagree on "strong enough".
            setPasswordStrength(checkPasswordStrength(value));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Basic validation
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            return;
        }

        if (passwordStrength.score < MIN_PASSWORD_SCORE) {
            setError('Veuillez choisir un mot de passe plus fort');
            return;
        }

        try {
            setIsLoading(true);
            const response = await fetch('/api/user/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    currentPassword: passwordData.currentPassword,
                    newPassword: passwordData.newPassword,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Échec du changement de mot de passe');
            }

            // Success notification
            toast({
                title: 'Mot de passe mis à jour',
                description: 'Votre mot de passe a été changé avec succès. Vous allez être redirigé vers la page de connexion.',
                variant: 'default',
            });

            await signOut({
                redirect: true,
                callbackUrl: '/auth/password-changed-success'
            });

        } catch (err) {
            const errorMessage = err instanceof Error
                ? err.message
                : 'Une erreur est survenue lors du changement de mot de passe';
            setError(errorMessage);
            setIsLoading(false);
        }
    };

    return (
        <main className="flex justify-center items-center min-h-screen bg-gray-950 p-4">
            <Card className="w-full max-w-md bg-gray-900 border-gray-800 shadow-xl">
                <CardHeader className="space-y-1">
                    <CardTitle asChild className="text-2xl text-gray-100 font-bold text-center">
                        <h1>Changement de mot de passe requis</h1>
                    </CardTitle>
                    <CardDescription className="text-gray-400 text-center">
                        Pour des raisons de sécurité, vous devez changer votre mot de passe temporaire
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {error && (
                        <div className="mb-6 p-4 bg-red-900/40 text-red-200 rounded-md border border-red-700 flex items-start">
                            <AlertTriangle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="currentPassword" className="text-sm font-medium text-gray-300">
                                Mot de passe temporaire actuel
                            </label>
                            <div className="relative">
                                <Input
                                    id="currentPassword"
                                    name="currentPassword"
                                    type={showCurrentPassword ? "text" : "password"}
                                    required
                                    className="pr-10 bg-gray-800 border-gray-700 text-gray-100"
                                    placeholder="Entrez votre mot de passe temporaire"
                                    value={passwordData.currentPassword}
                                    onChange={handleChange}
                                />
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-200"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                >
                                    {showCurrentPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="newPassword" className="text-sm font-medium text-gray-300">
                                Nouveau mot de passe
                            </label>
                            <div className="relative">
                                <Input
                                    id="newPassword"
                                    name="newPassword"
                                    type={showNewPassword ? "text" : "password"}
                                    required
                                    className="pr-10 bg-gray-800 border-gray-700 text-gray-100"
                                    placeholder="Choisissez un mot de passe fort"
                                    value={passwordData.newPassword}
                                    onChange={handleChange}
                                />
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-200"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                >
                                    {showNewPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                                </button>
                            </div>

                            {/* Password strength indicator */}
                            {passwordData.newPassword && (
                                <div className="mt-2 space-y-2">
                                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${passwordStrength.color}`}
                                            style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                                        ></div>
                                    </div>
                                    <p className={`text-sm ${passwordStrength.score >= MIN_PASSWORD_SCORE ? 'text-green-400' : 'text-amber-400'}`}>
                                        Force: {passwordStrength.message}
                                    </p>

                                    {/* Password requirements */}
                                    <div className="grid grid-cols-1 gap-2 mt-2">
                                        <RequirementRow
                                            text="Au moins 8 caractères"
                                            met={passwordData.newPassword.length >= 8}
                                        />
                                        <RequirementRow
                                            text="Au moins une lettre majuscule"
                                            met={/[A-Z]/.test(passwordData.newPassword)}
                                        />
                                        <RequirementRow
                                            text="Au moins une lettre minuscule"
                                            met={/[a-z]/.test(passwordData.newPassword)}
                                        />
                                        <RequirementRow
                                            text="Au moins un chiffre"
                                            met={/[0-9]/.test(passwordData.newPassword)}
                                        />
                                        <RequirementRow
                                            text="Au moins un caractère spécial"
                                            met={/[^A-Za-z0-9]/.test(passwordData.newPassword)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-300">
                                Confirmer le nouveau mot de passe
                            </label>
                            <Input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                required
                                className="bg-gray-800 border-gray-700 text-gray-100"
                                placeholder="Confirmez votre nouveau mot de passe"
                                value={passwordData.confirmPassword}
                                onChange={handleChange}
                            />
                            {passwordData.newPassword && passwordData.confirmPassword && (
                                passwordData.newPassword === passwordData.confirmPassword ? (
                                    <p className="text-sm text-green-500 flex items-center mt-1">
                                        <CheckCircle2 aria-hidden="true" size={16} className="mr-1" /> Les mots de passe correspondent
                                    </p>
                                ) : (
                                    <p className="text-sm text-red-500 flex items-center mt-1">
                                        <AlertTriangle size={16} className="mr-1" /> Les mots de passe ne correspondent pas
                                    </p>
                                )
                            )}
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-0 border-white rounded-full"></div>
                                    Changement en cours...
                                </>
                            ) : (
                                <>
                                    <Lock aria-hidden="true" className="mr-2 h-4 w-4" />
                                    Changer le mot de passe
                                </>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}

// Helper component for password requirements
function RequirementRow({ text, met }: { text: string; met: boolean }) {
    return (
        <div className="flex items-center text-sm">
            {met ? (
                <CheckCircle2 aria-hidden="true" size={16} className="text-green-500 mr-2 flex-shrink-0" />
            ) : (
                <AlertTriangle size={16} className="text-gray-500 mr-2 flex-shrink-0" />
            )}
            <span className={met ? 'text-green-400' : 'text-gray-400'}>
        {text}
      </span>
        </div>
    );
}