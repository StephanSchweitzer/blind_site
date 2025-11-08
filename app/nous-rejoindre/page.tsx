import FrontendNavbar from "@/components/Frontend-Navbar";
import { Headphones, BookOpen, Clock, Heart } from "lucide-react";

export default async function NousRejoindre() {
    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">
                {/* Hero Section */}
                <section className="text-center glass-card-lg p-12">
                    <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Nous rejoindre</h1>
                    <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto mb-6"></div>
                    <p className="text-lg text-gray-700 dark:text-gray-100 max-w-2xl mx-auto">
                        Adhérer à ECA, c&apos;est s&apos;engager dans une association qui croit au partage
                        de la culture et à l&apos;échange entre voyants et malvoyants.
                    </p>
                </section>

                {/* Membership Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Auditeur Card */}
                    <section className="glass-card overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
                        <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-4 flex items-center">
                            <Headphones className="h-8 w-8 text-white mr-3" />
                            <h2 className="text-2xl font-semibold text-white">Auditeur</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-gray-700 dark:text-gray-100">
                                Vous êtes aveugle ou malvoyant. Après paiement de votre cotisation annuelle,
                                vous devenez auditeur membre d&apos;ECA et avez également accès à tous les services
                                et activités de l&apos;association Auxiliaires des Aveugles (AA).
                            </p>
                            <p className="text-gray-700 dark:text-gray-100">
                                En ce qui concerne les enregistrements, vous pouvez faire parvenir à ECA les livres,
                                revues ou documents qui vous intéressent. Ce sont VOS livres que lisent les lecteurs.
                            </p>
                            <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 p-4 rounded-lg">
                                <p className="text-gray-900 dark:text-gray-100">
                                    <span className="font-semibold">Cotisation annuelle</span> : <span className="text-xl font-bold text-blue-600 dark:text-blue-300">50€</span>
                                </p>
                                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-2 space-y-1 text-sm">
                                    <li>Non déductible des impôts, au titre de l&apos;accession à un service</li>
                                    <li>Permet de voter à l&apos;assemblée générale des Auxiliaires des Aveugles</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Lecteur Card */}
                    <section className="glass-card overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
                        <div className="bg-gradient-to-r from-green-600 to-green-500 p-4 flex items-center">
                            <BookOpen className="h-8 w-8 text-white mr-3" />
                            <h2 className="text-2xl font-semibold text-white">Lecteur</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-gray-700 dark:text-gray-100">
                                Vous aimez lire à haute voix, vous avez une voix agréable, bien timbrée et vous articulez
                                clairement. Vous avez du temps libre et votre environnement est calme.
                            </p>
                            <p className="text-gray-700 dark:text-gray-100">
                                Rejoignez l&apos;équipe de lecteurs, vivant dans toute la France, et qui, pour certains,
                                peuvent lire en allemand, anglais, arabe, espagnol, grec, italien.
                            </p>
                            <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 p-4 rounded-lg">
                                <p className="text-gray-900 dark:text-gray-100">
                                    <span className="font-semibold">Cotisation annuelle</span> : <span className="text-xl font-bold text-green-600 dark:text-green-300">20€</span>
                                </p>
                                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-2 space-y-1 text-sm">
                                    <li>Déductible des impôts</li>
                                    <li>Permet d&apos;être assuré et de voter à l&apos;assemblée générale des Auxiliaires des Aveugles</li>
                                </ul>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Second Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Animateur Card */}
                    <section className="glass-card overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
                        <div className="bg-gradient-to-r from-amber-600 to-amber-500 p-4 flex items-center">
                            <Clock className="h-8 w-8 text-white mr-3" />
                            <h2 className="text-2xl font-semibold text-white">Animateur de permanence</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-gray-700 dark:text-gray-100">
                                Vous avez du temps libre et vous pouvez consacrer régulièrement une ou une demi-journée
                                par semaine pour venir au siège afin d&apos;accueillir lecteurs ou mal voyants, gérer les
                                livres reçus ou envoyés, participer ou initier des actions de communication, ou encore
                                assurer la comptabilité.
                            </p>
                            <p className="text-gray-700 dark:text-gray-100 font-semibold">
                                En un mot, mettre vos compétences à la disposition d&apos;ECA.
                            </p>
                            <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 p-4 rounded-lg">
                                <p className="text-gray-900 dark:text-gray-100">
                                    <span className="font-semibold">Cotisation annuelle</span> : <span className="text-xl font-bold text-amber-600 dark:text-amber-300">20€</span>
                                </p>
                                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-2 space-y-1 text-sm">
                                    <li>Mêmes conditions que pour les lecteurs</li>
                                    <li>Permet d&apos;être assuré pendant vos activités</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Bienfaiteur Card */}
                    <section className="glass-card overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
                        <div className="bg-gradient-to-r from-red-600 to-red-500 p-4 flex items-center">
                            <Heart className="h-8 w-8 text-white mr-3" />
                            <h2 className="text-2xl font-semibold text-white">Bienfaiteur</h2>
                        </div>
                        <div className="p-6 flex flex-col justify-between h-full space-y-4">
                            <div>
                                <p className="text-gray-700 dark:text-gray-100 text-lg">
                                    Nous ne bénéficions d&apos;aucune subvention. Grâce à votre don, vous permettez à ECA de poursuivre sa mission.
                                </p>
                                <p className="text-gray-600 dark:text-gray-300 mt-4">
                                    Vos dons nous permettent d&apos;acquérir du matériel d&apos;enregistrement,
                                    de former nos lecteurs et d&apos;améliorer nos services pour les personnes
                                    malvoyantes.
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 p-4 rounded-lg">
                                <p className="text-gray-900 dark:text-gray-100">
                                    <span className="font-semibold">Avantage fiscal</span> : Vos dons sont déductibles des impôts à hauteur de 66% dans la limite de 20% de votre revenu imposable.
                                </p>
                            </div>
                            <div className="text-center pt-4">
                                <a href="/faire-un-don" className="inline-block bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-medium py-3 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105">
                                    Faire un don
                                </a>
                            </div>
                        </div>
                    </section>
                </div>

                {/* CTA Section */}
                <section className="glass-card-lg p-8 text-center bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Prêt à nous rejoindre ?</h2>
                    <p className="text-gray-700 dark:text-gray-100 mb-6 max-w-lg mx-auto">
                        Quelle que soit la forme de votre engagement, votre participation est précieuse pour faire vivre notre mission
                        d&apos;accessibilité à la lecture.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <a href="/contact" className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 font-medium py-3 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105">
                            Nous contacter
                        </a>
                        <a href="/formulaire-adhesion" className="bg-transparent border-2 border-blue-600 dark:border-white text-blue-600 dark:text-white hover:bg-blue-600 dark:hover:bg-white hover:text-white dark:hover:text-gray-900 font-medium py-3 px-8 rounded-lg transition-all duration-300">
                            Formulaire d&apos;adhésion
                        </a>
                    </div>
                </section>
            </div>
        </main>
    );
}