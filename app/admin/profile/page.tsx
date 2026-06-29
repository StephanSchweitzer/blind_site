// app/profile/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { User, Edit, Save, X, UserPlus, LogOut, Lock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from "@/hooks/use-toast";
import { signOut } from 'next-auth/react';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';

type UserData = {
    id: number;
    email: string;
    name: string | null;
    accessLevel: string;
    memberType: string;
    createdAt: string;
    _count: {
        books: number;
        News: number;
        CoupsDeCoeur: number;
    };
};

export default function ProfilePage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [userData, setUserData] = useState<UserData | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);


    // User invitation states
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [inviteFormData, setInviteFormData] = useState({
        email: '',
        name: '',
        accessLevel: 'user',
        memberType: 'auditeur',
    });
    const [isInviting, setIsInviting] = useState(false);

    // Pure fetcher: talks to the server, returns data, never touches React state.
    const loadProfile = async (): Promise<UserData> => {
        const response = await fetch('/api/user/profile');
        if (!response.ok) {
            throw new Error('Échec de récupération des données de la personne');
        }
        return response.json();
    };

    const applyUserData = (data: UserData) => {
        setUserData(data);
        setFormData({
            name: data.name || '',
            email: data.email,
        });
    };

    useEffect(() => {
        // Rediriger si non authentifié
        if (status === 'unauthenticated') {
            router.push('/api/auth/signin');
            return;
        }

        if (status !== 'authenticated' || !session?.user?.email) {
            return;
        }

        // Récupérer les données utilisateur. setState lives inside the promise
        // callbacks (then/catch/finally), not in the synchronous effect body.
        let active = true;
        loadProfile()
            .then((data) => {
                if (active) applyUserData(data);
            })
            .catch((err) => {
                if (!active) return;
                setError('Erreur lors du chargement des données du profil');
                console.error(err instanceof Error ? err.message : 'Une erreur inconnue est survenue');
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [status, session, router]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleInviteChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setInviteFormData({
            ...inviteFormData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsLoading(true);
            const response = await fetch('/api/user/update', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Échec de la mise à jour');
            }

            // Check if email was changed
            const emailChanged = userData?.email !== formData.email;

            if (emailChanged) {
                // Show success message before redirecting
                toast({
                    title: "Profil mis à jour",
                    description: "Votre email a été modifié. Vous allez être redirigé vers la page de connexion.",
                });

                // Short delay before signing out to let the toast appear
                setTimeout(() => {
                    // Sign out and redirect to sign in page if email was changed
                    signOut({ callbackUrl: '/admin/profile' });
                }, 2000);
            } else {
                // Just refresh the data if only the name was changed
                applyUserData(await loadProfile());
                setIsEditing(false);

                toast({
                    title: "Profil mis à jour",
                    description: "Vos informations ont été mises à jour avec succès.",
                });
            }
        } catch (err) {
            const errorMessage = err instanceof Error
                ? err.message
                : 'Échec de la mise à jour du profil';
            setError(errorMessage);
            toast({
                title: "Erreur",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleInviteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsInviting(true);
            const response = await fetch('/api/user/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(inviteFormData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Échec de l\'invitation');
            }

            // Fermer le dialogue et réinitialiser le formulaire
            setIsInviteDialogOpen(false);
            setInviteFormData({
                email: '',
                name: '',
                accessLevel: 'user',
                memberType: 'auditeur',
            });

            // Afficher un message de succès
            toast({
                title: "Invitation envoyée",
                description: `La personne ${inviteFormData.email} a été invité avec succès.`,
            });
        } catch (err) {
            const errorMessage = err instanceof Error
                ? err.message
                : 'Échec de l\'invitation de la personne';
            setError(errorMessage);
            toast({
                title: "Erreur",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsInviting(false);
        }
    };

    if (status === 'loading' || isLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-background">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-5xl bg-background">
            <Card className="bg-card border-border shadow-xl">
                {/* En-tête du profil */}
                <CardHeader className="bg-gradient-to-r from-card to-card p-8 border-b border-border">
                    <div className="flex flex-col sm:flex-row items-center justify-between w-full">
                        <div className="flex flex-col sm:flex-row items-center">
                            <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-border mb-4 sm:mb-0 sm:mr-8 bg-card flex items-center justify-center">
                                {userData?.name || userData?.email ? (
                                    <span className="text-3xl sm:text-4xl font-bold text-foreground">
                                        {(userData.name?.charAt(0) || userData.email?.charAt(0) || '?').toUpperCase()}
                                    </span>
                                ) : (
                                    <User size={48} className="text-muted-foreground" />
                                )}
                            </div>
                            <div className="text-center sm:text-left">
                                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                                    {userData?.name || 'Personne'}
                                </h1>
                                <p className="text-muted-foreground mb-1">
                                    Membre depuis {userData?.createdAt && new Date(userData.createdAt).toLocaleDateString('fr-FR')}
                                </p>
                                <p className="text-muted-foreground">
                                    Accès: <span className="text-blue-600 dark:text-blue-400">{userData?.accessLevel}</span>
                                    {' · '}
                                    Type: <span className="text-blue-600 dark:text-blue-400">{userData?.memberType}</span>
                                </p>
                            </div>
                        </div>
                        {/* Sign Out button moved to header */}
                        <Button
                            onClick={() => signOut()}
                            className="bg-transparent hover:bg-muted text-foreground border border-border"
                            size="sm"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            Déconnexion
                        </Button>
                    </div>
                </CardHeader>

                {/* Contenu */}
                <CardContent className="p-8">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md border border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700">
                            <p className="flex items-center">
                                <X className="mr-2 h-5 w-5" />
                                {error}
                            </p>
                        </div>
                    )}

                    {/* Cartes de statistiques */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <StatCard
                            title="Livres"
                            count={userData?._count.books || 0}
                            icon="📚"
                            color="bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800"
                            iconColor="text-emerald-600 dark:text-emerald-400"
                        />
                        <StatCard
                            title="Dernières infos"
                            count={userData?._count.News || 0}
                            icon="📰"
                            color="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800"
                            iconColor="text-amber-600 dark:text-amber-400"
                        />
                        <StatCard
                            title="Listes de livres"
                            count={userData?._count.CoupsDeCoeur || 0}
                            icon="💖"
                            color="bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800"
                            iconColor="text-rose-600 dark:text-rose-400"
                        />
                    </div>

                    {/* Formulaire de modification du profil */}
                    <Card className="bg-card border-border">
                        <CardHeader
                            className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-border">
                            <div>
                                <CardTitle className="text-foreground">Informations du profil</CardTitle>
                                <CardDescription className="text-muted-foreground">
                                    Gérer et modifier vos informations personnelles
                                </CardDescription>
                            </div>
                            <div className="flex space-x-2">
                                {/* Change Password button moved here next to Edit */}
                                <Button
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                    onClick={() => setIsChangePasswordOpen(true)}
                                >
                                    <Lock className="mr-2 h-4 w-4" />
                                    Mot de passe
                                </Button>
                                <Button
                                    className="bg-muted text-foreground border-border hover:bg-muted"
                                    onClick={() => setIsEditing(!isEditing)}
                                >
                                    {isEditing ? (
                                        <>
                                            <X className="mr-2 h-4 w-4"/>
                                            Annuler
                                        </>
                                    ) : (
                                        <>
                                            <Edit className="mr-2 h-4 w-4"/>
                                            Modifier
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="pt-6">
                            {isEditing ? (
                                <form onSubmit={handleSubmit}>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="md:col-span-2">
                                                <label htmlFor="name"
                                                       className="block text-sm font-medium text-foreground mb-1">
                                                    Nom
                                                </label>
                                                <Input
                                                    type="text"
                                                    id="name"
                                                    name="name"
                                                    value={formData.name}
                                                    onChange={handleChange}
                                                    className="w-full px-4 py-2 rounded-md bg-muted text-foreground border-border focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label htmlFor="email"
                                                       className="block text-sm font-medium text-foreground mb-1">
                                                    Email
                                                </label>
                                                <Input
                                                    type="email"
                                                    id="email"
                                                    name="email"
                                                    value={formData.email}
                                                    onChange={handleChange}
                                                    className="w-full px-4 py-2 rounded-md bg-muted text-foreground border-border focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end mt-6">
                                            <Button
                                                type="submit"
                                                disabled={isLoading}
                                                className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:bg-muted disabled:text-muted-foreground"
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <div
                                                            className="animate-spin mr-2 h-4 w-4 border-2 border-b-0 border-white rounded-full"></div>
                                                        Mise à jour...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save className="mr-2 h-4 w-4"/>
                                                        Enregistrer les modifications
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </form>
                            ) : (
                                <div className="bg-muted rounded-md p-5 border border-border">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
                                            <p className="font-medium text-foreground">{userData?.email}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground mb-1">Nom</p>
                                            <p className="font-medium text-foreground">{userData?.name || 'Non défini'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground mb-1">Date
                                                d&apos;inscription</p>
                                            <p className="font-medium text-foreground">
                                                {userData?.createdAt && new Date(userData.createdAt).toLocaleDateString('fr-FR', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground mb-1">Identifiant</p>
                                            <p className="font-medium text-foreground">#{userData?.id}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground mb-1">Niveau d&apos;accès</p>
                                            <p className="font-medium text-foreground">{userData?.accessLevel}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground mb-1">Type de membre</p>
                                            <p className="font-medium text-foreground">{userData?.memberType}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>

                        {/* Section admin visible uniquement pour les super_admin */}
                        {userData?.accessLevel === 'super_admin' && (
                            <CardFooter className="border-t border-border pt-6">
                                <div className="w-full">
                                    <CardTitle className="text-foreground mb-4">Options d&apos;administration</CardTitle>
                                    <Button
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                        onClick={() => setIsInviteDialogOpen(true)}
                                    >
                                        <UserPlus className="mr-2 h-4 w-4"/>
                                        Inviter une nouvelle personne
                                    </Button>
                                </div>
                            </CardFooter>
                        )}
                    </Card>
                </CardContent>
            </Card>

            {/* Modal d'invitation de personne */}
            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                <DialogContent className="bg-card text-foreground border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Inviter une nouvelle personne</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            L&apos;utilisateur recevra un email avec un mot de passe temporaire pour se connecter.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleInviteSubmit}>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="invite-email" className="text-foreground">
                                    Email
                                </Label>
                                <Input
                                    id="invite-email"
                                    name="email"
                                    type="email"
                                    required
                                    value={inviteFormData.email}
                                    onChange={handleInviteChange}
                                    className="bg-muted border-border text-foreground"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invite-name" className="text-foreground">
                                    Nom (optionnel)
                                </Label>
                                <Input
                                    id="invite-name"
                                    name="name"
                                    type="text"
                                    value={inviteFormData.name}
                                    onChange={handleInviteChange}
                                    className="bg-muted border-border text-foreground"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invite-access-level" className="text-foreground">
                                    Niveau d&apos;accès
                                </Label>
                                <select
                                    id="invite-access-level"
                                    name="accessLevel"
                                    value={inviteFormData.accessLevel}
                                    onChange={handleInviteChange}
                                    className="w-full rounded-md bg-muted border-border text-foreground p-2"
                                >
                                    <option value="user">Personne</option>
                                    <option value="admin">Administrateur</option>
                                    <option value="super_admin">Super Administrateur</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invite-member-type" className="text-foreground">
                                    Type de membre
                                </Label>
                                <select
                                    id="invite-member-type"
                                    name="memberType"
                                    value={inviteFormData.memberType}
                                    onChange={handleInviteChange}
                                    className="w-full rounded-md bg-muted border-border text-foreground p-2"
                                >
                                    <option value="auditeur">Auditeur</option>
                                    <option value="lecteur">Lecteur</option>
                                </select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsInviteDialogOpen(false)}
                                className="bg-muted text-foreground border-border hover:bg-muted"
                            >
                                Annuler
                            </Button>
                            <Button
                                type="submit"
                                disabled={isInviting}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {isInviting ? (
                                    <>
                                        <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-0 border-white rounded-full"></div>
                                        Invitation en cours...
                                    </>
                                ) : (
                                    'Envoyer l\'invitation'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ChangePasswordDialog
                open={isChangePasswordOpen}
                onOpenChange={setIsChangePasswordOpen}
            />

        </div>
    );
}

interface StatCardProps {
    title: string;
    count: number;
    icon: string;
    color: string;
    iconColor: string;
}

function StatCard({ title, count, icon, color, iconColor }: StatCardProps) {
    return (
        <div className={`p-6 rounded-lg ${color} flex items-center border`}>
            <div className={`text-4xl mr-5 ${iconColor}`}>{icon}</div>
            <div>
                <p className="text-3xl font-bold mb-1">{count}</p>
                <p className="text-sm opacity-80">{title}</p>
            </div>
        </div>
    );
}