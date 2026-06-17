'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
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

            // Success — let the middleware route password-change cases as needed.
            router.push(result?.url || callbackUrl);
            router.refresh();
        } catch {
            setError('Une erreur est survenue. Veuillez réessayer.');
            setIsLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md border-gray-700 bg-gray-900 shadow-xl">
            <CardHeader className="space-y-1 text-center">
                <CardTitle className="text-2xl font-semibold text-gray-100">
                    Connexion
                </CardTitle>
                <CardDescription className="text-gray-400">
                    Entrez vos identifiants pour accéder à votre espace
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
                        <Label htmlFor="email" className="text-gray-200">
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
                            className="bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-400"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-gray-200">
                            Mot de passe
                        </Label>
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
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white hover:bg-blue-700"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Connexion en cours…
                            </>
                        ) : (
                            <>
                                <LogIn className="mr-2 h-4 w-4" />
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950 px-4">
            <Suspense
                fallback={
                    <div className="flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                }
            >
                <SignInForm />
            </Suspense>
        </div>
    );
}