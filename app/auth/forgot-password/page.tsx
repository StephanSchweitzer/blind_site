// app/auth/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Send } from 'lucide-react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The confirmation the API returns is deliberately the same whether or not
    // the address belongs to a permanent — don't dress it up as "email sent".
    const [confirmation, setConfirmation] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const response = await fetch('/api/password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = await response.json();

            if (!response.ok) {
                setError(data.message || 'Une erreur est survenue. Veuillez réessayer.');
                setIsLoading(false);
                return;
            }

            setConfirmation(data.message);
        } catch {
            setError('Une erreur est survenue. Veuillez réessayer.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950 px-4">
            <Card className="w-full max-w-md border-gray-700 bg-gray-900 shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-semibold text-gray-100">
                        Mot de passe oublié
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                        Réservé aux permanents. Entrez l&apos;adresse email de votre compte : vous
                        recevrez un lien pour choisir un nouveau mot de passe.
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {confirmation ? (
                        <div className="space-y-6">
                            <div
                                role="status"
                                className="flex items-start gap-2 rounded-md border border-green-900/60 bg-green-950/40 px-3 py-3 text-sm text-green-300"
                            >
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{confirmation}</span>
                            </div>
                            <p className="text-sm text-gray-400">
                                Le lien expire au bout de 30 minutes et ne fonctionne qu&apos;une
                                seule fois. Si vous ne recevez rien, contactez l&apos;équipe ECA :
                                votre compte n&apos;a peut-être pas les droits nécessaires.
                            </p>
                            <Link
                                href="/auth/signin"
                                className="flex items-center justify-center gap-2 text-sm text-blue-400 transition-colors hover:text-blue-300"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Retour à la connexion
                            </Link>
                        </div>
                    ) : (
                        <>
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

                                <Button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Envoi en cours…
                                        </>
                                    ) : (
                                        <>
                                            <Send className="mr-2 h-4 w-4" />
                                            Envoyer le lien
                                        </>
                                    )}
                                </Button>

                                <Link
                                    href="/auth/signin"
                                    className="flex items-center justify-center gap-2 text-sm text-gray-400 transition-colors hover:text-gray-200"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Retour à la connexion
                                </Link>
                            </form>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
