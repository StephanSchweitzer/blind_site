// app/profile/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { User, Edit, Save, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

    useEffect(() => {
        // Rediriger si non authentifié
        if (status === 'unauthenticated') {
            router.push('/signin');
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

            // Rafraîchir les données utilisateur
            await fetchUserData();
            setIsEditing(false);
        } catch (err) {
            const errorMessage = err instanceof Error
                ? err.message
                : 'Échec de la mise à jour du profil';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
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
                            title="Articles"
                            count={userData?._count.News || 0}
                            icon="📰"
                            color="bg-amber-900/30 text-amber-200 border-amber-800"
                            iconColor="text-amber-400"
                        />
                        <StatCard
                            title="Coups de Cœur"
                            count={userData?._count.CoupsDeCoeur || 0}
                            icon="💖"
                            color="bg-rose-900/30 text-rose-200 border-rose-800"
                            iconColor="text-rose-400"
                        />
                    </div>

                    {/* Formulaire de modification du profil */}
                    <Card className="bg-gray-800 border-gray-700">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-gray-700">
                            <div>
                                <CardTitle className="text-gray-100">Informations du profil</CardTitle>
                                <CardDescription className="text-gray-400">
                                    Gérer et modifier vos informations personnelles
                                </CardDescription>
                            </div>
                            <Button
                                className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                                onClick={() => setIsEditing(!isEditing)}
                            >
                                {isEditing ? (
                                    <>
                                        <X className="mr-2 h-4 w-4" />
                                        Annuler
                                    </>
                                ) : (
                                    <>
                                        <Edit className="mr-2 h-4 w-4" />
                                        Modifier
                                    </>
                                )}
                            </Button>
                        </CardHeader>

                        <CardContent className="pt-6">
                            {isEditing ? (
                                <form onSubmit={handleSubmit}>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="md:col-span-2">
                                                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
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
                                                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
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
                                                        <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-0 border-white rounded-full"></div>
                                                        Mise à jour...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save className="mr-2 h-4 w-4" />
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
                                            <p className="text-sm font-medium text-gray-400 mb-1">Date d&apos;inscription</p>
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
                    </Card>
                </CardContent>
            </Card>
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