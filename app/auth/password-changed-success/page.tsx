'use client';

import { Suspense, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, LogIn } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function PasswordChangedContent() {
    const { status } = useSession();
    const router = useRouter();
    // Two ways in: the forced change of a temporary password, which signs the
    // user out on the way here, and a reset link, where nobody was signed in at
    // all. Saying "we logged you out" would be wrong in the second case.
    const fromReset = useSearchParams().get('from') === 'reset';

    // If user is already authenticated, redirect to admin
    useEffect(() => {
        if (status === 'authenticated') {
            router.push('/admin');
        }
    }, [status, router]);

    return (
        <Card className="w-full max-w-md bg-gray-900 border-gray-800 shadow-xl">
            <CardHeader className="space-y-1">
                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                    </div>
                </div>
                <CardTitle className="text-2xl text-gray-100 font-bold text-center">
                    Mot de passe modifié avec succès
                </CardTitle>
                <CardDescription className="text-gray-400 text-center">
                    {fromReset
                        ? 'Vous pouvez maintenant vous connecter'
                        : 'Pour des raisons de sécurité, vous avez été déconnecté'}
                </CardDescription>
            </CardHeader>

            <CardContent className="pt-4 pb-2">
                <div className="space-y-4">
                    {fromReset ? (
                        <>
                            <p className="text-gray-300">
                                Votre nouveau mot de passe est enregistré. Le lien de
                                réinitialisation que vous avez utilisé n&apos;est plus valable.
                            </p>
                            <p className="text-gray-300">
                                Connectez-vous avec ce nouveau mot de passe pour accéder à votre
                                compte.
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-gray-300">
                                Votre mot de passe a été modifié avec succès. Pour protéger votre compte,
                                nous vous avons déconnecté automatiquement.
                            </p>
                            <p className="text-gray-300">
                                Vous pouvez maintenant vous reconnecter avec votre nouveau mot de passe
                                pour accéder à votre compte.
                            </p>
                        </>
                    )}
                </div>
            </CardContent>

            <CardFooter className="flex justify-center pt-2 pb-6">
                <Button
                    onClick={() => router.push('/auth/signin')}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                >
                    <LogIn className="mr-2 h-4 w-4" />
                    Se connecter
                </Button>
            </CardFooter>
        </Card>
    );
}

export default function PasswordChangedSuccess() {
    return (
        <div className="flex justify-center items-center min-h-screen bg-gray-950 p-4">
            <Suspense fallback={null}>
                <PasswordChangedContent />
            </Suspense>
        </div>
    );
}
