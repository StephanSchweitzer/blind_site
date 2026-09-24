'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
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
import { Eye, EyeOff, Loader2, LogIn, AlertCircle } from 'lucide-react';

function mapError(code: string | null): string | null {
    if (!code) return null;
    switch (code) {
        case 'CredentialsSignin':
            return 'Email ou mot de passe incorrect.';
        case 'SessionRequired':
            return 'Veuillez vous connecter pour accéder à cette page.';
        default:
            return 'Une erreur est survenue. Veuillez réessayer.';
    }
}

function SignInForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || '/admin';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(mapError(searchParams.get('error')));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const result = await signIn('credentials', {
                redirect: false,
                email: email.trim(),
                password,
                callbackUrl,
            });

            if (result?.error) {
                setError('Email ou mot de passe incorrect.');
                setIsLoading(false);
                return;
            }

            // Success — let the proxy (proxy.ts) route password-change cases as needed.
            router.push(result?.url || callbackUrl);
            router.refresh();
        } catch {
            setError('Une erreur est survenue. Veuillez réessayer.');
            setIsLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md border-border bg-card shadow-xl">
            <CardHeader className="space-y-1 text-center">
                <CardTitle asChild className="text-2xl font-semibold text-foreground">
                    <h1>Connexion</h1>
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                    Entrez vos identifiants pour accéder à votre espace
                </CardDescription>
            </CardHeader>

            <CardContent>
                {error && (
                    <div
                        role="alert"
                        className="mb-4 flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                    >
                        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-foreground">
                            Email
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="nom@exemple.fr"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={isLoading}
                            className="bg-field border-input text-foreground placeholder:text-muted-foreground"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password" className="text-foreground">
                                Mot de passe
                            </Label>
                            <Link
                                href="/auth/forgot-password"
                                className="text-sm text-blue-700 underline-offset-2 transition-colors hover:underline dark:text-blue-300"
                            >
                                Mot de passe oublié ?
                            </Link>
                        </div>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={isLoading}
                                className="bg-field border-input text-foreground placeholder:text-muted-foreground pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                disabled={isLoading}
                                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                // p-2 around the 16 px icon: a 32 px target (WCAG 2.5.8
                                // asks 24) that still fits the input's pr-10.
                                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                                Connexion en cours…
                            </>
                        ) : (
                            <>
                                <LogIn aria-hidden="true" className="mr-2 h-4 w-4" />
                                Se connecter
                            </>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

export default function SignInPage() {
    return (
        <main className="min-h-screen flex items-center justify-center px-4">
            <Suspense
                fallback={
                    <div className="flex items-center justify-center">
                        <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                }
            >
                <SignInForm />
            </Suspense>
        </main>
    );
}