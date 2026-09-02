// app/auth/reset-password/page.tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import { AlertCircle, ArrowLeft, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import {
    checkPasswordStrength,
    MIN_PASSWORD_SCORE,
    validateNewPassword,
} from '@/lib/auth/passwordStrength';

function ResetPasswordForm() {
    const router = useRouter();
    const token = useSearchParams().get('token') ?? '';

    // A missing token needs no round trip — decide it during render, so the
    // effect below never sets state synchronously (react-hooks/set-state-in-effect).
    const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>(
        token ? 'checking' : 'invalid'
    );
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const strength = checkPasswordStrength(password);

    // Tell the user the link is dead before they bother inventing a password.
    useEffect(() => {
        if (!token) return;

        let cancelled = false;
        (async () => {
            try {
                const response = await fetch(
                    `/api/password-reset/confirm?token=${encodeURIComponent(token)}`
                );
                const data = await response.json();
                if (!cancelled) setLinkState(data.valid ? 'valid' : 'invalid');
            } catch {
                if (!cancelled) setLinkState('invalid');
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            return;
        }

        const problem = validateNewPassword(password);
        if (problem) {
            setError(problem);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/password-reset/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await response.json();

            if (!response.ok) {
                setError(data.message || 'Une erreur est survenue. Veuillez réessayer.');
                setIsLoading(false);
                return;
            }

            // Nobody was signed in here, so there is no session to drop — reuse the
            // existing success screen, which sends them back to the sign-in page.
            router.push('/auth/password-changed-success?from=reset');
        } catch {
            setError('Une erreur est survenue. Veuillez réessayer.');
            setIsLoading(false);
        }
    };

    if (linkState === 'checking') {
        return (
            <Card className="w-full max-w-md border-gray-700 bg-gray-900 shadow-xl">
                <CardContent className="flex items-center justify-center gap-3 py-12 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Vérification du lien…
                </CardContent>
            </Card>
        );
    }

    if (linkState === 'invalid') {
        return (
            <Card className="w-full max-w-md border-gray-700 bg-gray-900 shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-semibold text-gray-100">
                        Lien invalide ou expiré
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                        Ce lien de réinitialisation n&apos;est plus valable — il expire au bout de
                        30 minutes et ne fonctionne qu&apos;une seule fois.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button
                        onClick={() => router.push('/auth/forgot-password')}
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        Demander un nouveau lien
                    </Button>
                    <Link
                        href="/auth/signin"
                        className="flex items-center justify-center gap-2 text-sm text-gray-400 transition-colors hover:text-gray-200"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Retour à la connexion
                    </Link>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md border-gray-700 bg-gray-900 shadow-xl">
            <CardHeader className="space-y-1 text-center">
                <CardTitle className="text-2xl font-semibold text-gray-100">
                    Nouveau mot de passe
                </CardTitle>
                <CardDescription className="text-gray-400">
                    Choisissez un mot de passe d&apos;au moins 8 caractères, avec majuscules,
                    minuscules et chiffres
                </CardDescription>
            </CardHeader>

            <CardContent>
                {error && (
                    <div
                        role="alert"
                        className="mb-4 flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300"
                    >
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-gray-200">
                            Nouveau mot de passe
                        </Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={isLoading}
                                className="bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-400 pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                disabled={isLoading}
                                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>

                        {password && (
                            <div className="space-y-1">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                                    <div
                                        className={`h-full transition-all ${strength.color}`}
                                        style={{ width: `${(strength.score / 5) * 100}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400">
                                    Force : {strength.message}
                                    {strength.score < MIN_PASSWORD_SCORE && ' — insuffisante'}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-gray-200">
                            Confirmer le mot de passe
                        </Label>
                        <Input
                            id="confirmPassword"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            disabled={isLoading}
                            className="bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-400"
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Enregistrement…
                            </>
                        ) : (
                            <>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Enregistrer le mot de passe
                            </>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950 px-4">
            <Suspense
                fallback={
                    <div className="flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                }
            >
                <ResetPasswordForm />
            </Suspense>
        </div>
    );
}
