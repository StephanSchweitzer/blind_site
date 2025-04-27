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
    role: string;
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
        role: 'user',
    });
    const [isInviting, setIsInviting] = useState(false);

    useEffect(() => {
        // Rediriger si non authentifié
        if (status === 'unauthenticated') {
            router.push('/api/auth/signin');
        }

        // Récupérer les données utilisateur si authentifié
        if (status === 'authenticated' && session?.user?.email) {
            fetchUserData();
        }
    }, [status, session, router]);

    const fetchUserData = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/user/profile');
            if (!response.ok) {
                throw new Error('Échec de récupération des données utilisateur');
            }
            const data = await response.json();
            setUserData(data);
            setFormData({
                name: data.name || '',
                email: data.email,
            });
        } catch (err) {
            setError('Erreur lors du chargement des données du profil');
            if (err instanceof Error) {
                console.error(err.message);
            } else {
                console.error('Une erreur inconnue est survenue');
            }
        } finally {
            setIsLoading(false);
        }
    };

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
                await fetchUserData();
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
                role: 'user',
            });

            // Afficher un message de succès
            toast({
                title: "Invitation envoyée",
                description: `L'utilisateur ${inviteFormData.email} a été invité avec succès.`,
            });
        } catch (err) {
            const errorMessage = err instanceof Error
                ? err.message
                : 'Échec de l\'invitation de l\'utilisateur';
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
            <div className="flex justify-center items-center min-h-screen bg-gray-950">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-5xl bg-gray-950">
            <Card className="bg-gray-900 border-gray-800 shadow-xl">
                {/* En-tête du profil */}
                <CardHeader className="bg-gradient-to-r from-gray-800 to-gray-900 p-8 border-b border-gray-700">
                    <div className="flex flex-col sm:flex-row items-center justify-between w-full">
                        <div className="flex flex-col sm:flex-row items-center">
                            <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-gray-700 mb-4 sm:mb-0 sm:mr-8 bg-gray-800 flex items-center justify-center">
                                {userData?.name || userData?.email ? (
                                    <span className="text-3xl sm:text-4xl font-bold text-gray-200">
                                        {(userData.name?.charAt(0) || userData.email?.charAt(0) || '?').toUpperCase()}
                                    </span>
                                ) : (
                                    <User size={48} className="text-gray-400" />
                                )}
                            </div>
                            <div className="text-center sm:text-left">
                                <h1 className="text-2xl sm:text-3xl font-bold text-gray-100 mb-2">
                                    {userData?.name || 'Utilisateur'}
                                </h1>
                                <p className="text-gray-400 mb-1">
                                    Membre depuis {userData?.createdAt && new Date(userData.createdAt).toLocaleDateString('fr-FR')}
                                </p>
                                <p className="text-gray-400">
                                    Rôle: <span className="text-blue-400">{userData?.role === 'user' ? 'Utilisateur' : userData?.role}</span>
                                </p>
                            </div>
                        </div>
                        {/* Sign Out button moved to header */}
                        <Button
                            onClick={() => signOut()}
                            className="bg-transparent hover:bg-gray-800 text-gray-300 border border-gray-700"
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
                        <div className="mb-6 p-4 bg-red-900/40 text-red-200 rounded-md border border-red-700">
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
                            color="bg-emerald-900/30 text-emerald-200 border-emerald-800"
                            iconColor="text-emerald-400"
                        />
                        <StatCard
                            title="Dernières infos"
                            count={userData?._count.News || 0}
                            icon="📰"
                            color="bg-amber-900/30 text-amber-200 border-amber-800"
                            iconColor="text-amber-400"
                        />
                        <StatCard
                            title="Listes de livres"
                            count={userData?._count.CoupsDeCoeur || 0}
                            icon="💖"
                            color="bg-rose-900/30 text-rose-200 border-rose-800"
                            iconColor="text-rose-400"
                        />
                    </div>

                    {/* Formulaire de modification du profil */}
                    <Card className="bg-gray-800 border-gray-700">
                        <CardHeader
                            className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-gray-700">
                            <div>
                                <CardTitle className="text-gray-100">Informations du profil</CardTitle>
                                <CardDescription className="text-gray-400">
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
                                    className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
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
                                                       className="block text-sm font-medium text-gray-300 mb-1">
                                                    Nom
                                                </label>
                                                <Input
                                                    type="text"
                                                    id="name"
                                                    name="name"
                                                    value={formData.name}
                                                    onChange={handleChange}
                                                    className="w-full px-4 py-2 rounded-md bg-gray-700 text-gray-200 border-gray-600 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label htmlFor="email"
                                                       className="block text-sm font-medium text-gray-300 mb-1">
                                                    Email
                                                </label>
                                                <Input
                                                    type="email"
                                                    id="email"
                                                    name="email"
                                                    value={formData.email}
                                                    onChange={handleChange}
                                                    className="w-full px-4 py-2 rounded-md bg-gray-700 text-gray-200 border-gray-600 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end mt-6">
                                            <Button
                                                type="submit"
                                                disabled={isLoading}
                                                className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:bg-gray-700 disabled:text-gray-400"
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
                                <div className="bg-gray-750 rounded-md p-5 border border-gray-700">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                                        <div>
                                            <p className="text-sm font-medium text-gray-400 mb-1">Email</p>
                                            <p className="font-medium text-gray-200">{userData?.email}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-400 mb-1">Nom</p>
                                            <p className="font-medium text-gray-200">{userData?.name || 'Non défini'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-400 mb-1">Date
                                                d&apos;inscription</p>
                                            <p className="font-medium text-gray-200">
                                                {userData?.createdAt && new Date(userData.createdAt).toLocaleDateString('fr-FR', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-400 mb-1">Identifiant</p>
                                            <p className="font-medium text-gray-200">#{userData?.id}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>

                        {/* Section admin visible uniquement pour les super_admin */}
                        {userData?.role === 'super_admin' && (
                            <CardFooter className="border-t border-gray-700 pt-6">
                                <div className="w-full">
                                    <CardTitle className="text-gray-100 mb-4">Options d&apos;administration</CardTitle>
                                    <Button
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                        onClick={() => setIsInviteDialogOpen(true)}
                                    >
                                        <UserPlus className="mr-2 h-4 w-4"/>
                                        Inviter un nouvel utilisateur
                                    </Button>
                                </div>
                            </CardFooter>
                        )}
                    </Card>
                </CardContent>
            </Card>

            {/* Modal d'invitation d'utilisateur */}
            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                <DialogContent className="bg-gray-800 text-gray-100 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">Inviter un nouvel utilisateur</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            L&apos;utilisateur recevra un email avec un mot de passe temporaire pour se connecter.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleInviteSubmit}>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="invite-email" className="text-gray-300">
                                    Email
                                </Label>
                                <Input
                                    id="invite-email"
                                    name="email"
                                    type="email"
                                    required
                                    value={inviteFormData.email}
                                    onChange={handleInviteChange}
                                    className="bg-gray-700 border-gray-600 text-gray-200"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invite-name" className="text-gray-300">
                                    Nom (optionnel)
                                </Label>
                                <Input
                                    id="invite-name"
                                    name="name"
                                    type="text"
                                    value={inviteFormData.name}
                                    onChange={handleInviteChange}
                                    className="bg-gray-700 border-gray-600 text-gray-200"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invite-role" className="text-gray-300">
                                    Rôle
                                </Label>
                                <select
                                    id="invite-role"
                                    name="role"
                                    value={inviteFormData.role}
                                    onChange={handleInviteChange}
                                    className="w-full rounded-md bg-gray-700 border-gray-600 text-gray-200 p-2"
                                >
                                    <option value="user">Utilisateur</option>
                                    <option value="admin">Administrateur</option>
                                    <option value="super_admin">Super Administrateur</option>
                                </select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsInviteDialogOpen(false)}
                                className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
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