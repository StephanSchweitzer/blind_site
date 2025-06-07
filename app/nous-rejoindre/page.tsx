import FrontendNavbar from "@/components/Frontend-Navbar";
import { Headphones, BookOpen, Clock, Heart } from "lucide-react";

export default async function NousRejoindre() {
    return (
        <main className="min-h-screen relative bg-gray-900">
            <div className="hidden lg:block fixed inset-y-0 w-full">
                <div className="h-full max-w-6xl mx-auto">
                    <div className="h-full flex">
                        <div className="w-16 h-full bg-gradient-to-r from-transparent to-gray-800"></div>
                        <div className="flex-1"></div>
                        <div className="w-16 h-full bg-gradient-to-l from-transparent to-gray-800"></div>
                    </div>
                </div>
            </div>

            <div className="relative">
                <FrontendNavbar />

                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12 bg-gray-800">
                    <section className="text-center">
                        <h1 className="text-3xl font-bold mb-4 text-white">Nous rejoindre</h1>
                        <div className="w-24 h-1 bg-blue-500 mx-auto mb-6"></div>
                        <p className="text-lg text-gray-100 max-w-2xl mx-auto">
                            Adhérer à ECA, c&apos;est s&apos;engager dans une association qui croit au partage
                            de la culture et à l&apos;échange entre voyants et malvoyants.
                        </p>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <section className="bg-gray-700 rounded-lg overflow-hidden transition-all hover:shadow-lg hover:shadow-blue-500/20">
                            <div className="bg-blue-600 p-4 flex items-center">
                                <Headphones className="h-8 w-8 text-white mr-3" />
                                <h2 className="text-2xl font-semibold text-white">Auditeur</h2>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-gray-100">
                                    Vous êtes aveugle ou malvoyant. Après paiement de votre cotisation annuelle,
                                    vous devenez auditeur membre d&apos;ECA et avez également accès à tous les services
                                    et activités de l&apos;association Auxiliaires des Aveugles (AA).
                                </p>
                                <p className="text-gray-100">
                                    En ce qui concerne les enregistrements, vous pouvez faire parvenir à ECA les livres,
                                    revues ou documents qui vous intéressent. Ces sont VOS livres que lisent les lecteurs.
                                </p>
                                <div className="bg-gray-800 p-4 rounded-lg">
                                    <p className="text-gray-100">
                                        <span className="font-semibold">Cotisation annuelle</span> : <span className="text-xl font-bold text-blue-300">40€</span>
                                    </p>
                                    <ul className="list-disc list-inside text-gray-300 mt-2 space-y-1">
                                        <li>Obligatoire mais non déductible des impôts, au titre de l&apos;accession à un service</li>
                                        <li>Permet de voter à l&apos;assemblée générale des Auxiliaires des Aveugles</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section className="bg-gray-700 rounded-lg overflow-hidden transition-all hover:shadow-lg hover:shadow-green-500/20">
                            <div className="bg-green-600 p-4 flex items-center">
                                <BookOpen className="h-8 w-8 text-white mr-3" />
                                <h2 className="text-2xl font-semibold text-white">Lecteur</h2>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-gray-100">
                                    Vous aimez lire à haute voix, vous avez une voix agréable, bien timbrée et vous articulez
                                    clairement. Vous avez du temps libre et votre environnement est calme.
                                </p>
                                <p className="text-gray-100">
                                    Rejoignez l&apos;équipe de lecteurs, vivant dans toute la France, et qui, pour certains,
                                    peuvent lire en allemand, anglais, arabe, espagnol, grec, italien.
                                </p>
                                <div className="bg-gray-800 p-4 rounded-lg">
                                    <p className="text-gray-100">
                                        <span className="font-semibold">Cotisation annuelle</span> : <span className="text-xl font-bold text-green-300">18€</span>
                                    </p>
                                    <ul className="list-disc list-inside text-gray-300 mt-2 space-y-1">
                                        <li>Obligatoire et déductible des impôts</li>
                                        <li>Permet d&apos;être assuré et de voter à l&apos;assemblée générale des Auxiliaires des Aveugles</li>
                                    </ul>
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <section className="bg-gray-700 rounded-lg overflow-hidden transition-all hover:shadow-lg hover:shadow-amber-500/20">
                            <div className="bg-amber-600 p-4 flex items-center">
                                <Clock className="h-8 w-8 text-white mr-3" />
                                <h2 className="text-2xl font-semibold text-white">Animateur de permanence</h2>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-gray-100">
                                    Vous avez du temps libre et vous pouvez consacrer régulièrement une ou une demi-journée
                                    par semaine pour venir au siège afin d&apos;accueillir lecteurs ou mal voyants, gérer les
                                    livres reçus ou envoyés, participer ou initier des actions de communication, ou encore
                                    assurer la comptabilité.
                                </p>
                                <p className="text-gray-100 font-semibold">
                                    En un mot, mettre vos compétences à la disposition d&apos;ECA.
                                </p>
                                <div className="bg-gray-800 p-4 rounded-lg">
                                    <p className="text-gray-100">
                                        <span className="font-semibold">Cotisation annuelle</span> : <span className="text-xl font-bold text-amber-300">18€</span>
                                    </p>
                                    <ul className="list-disc list-inside text-gray-300 mt-2 space-y-1">
                                        <li>Mêmes conditions que pour les lecteurs</li>
                                        <li>Permet d&apos;être assuré pendant vos activités</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section className="bg-gray-700 rounded-lg overflow-hidden transition-all hover:shadow-lg hover:shadow-red-500/20">
                            <div className="bg-red-600 p-4 flex items-center">
                                <Heart className="h-8 w-8 text-white mr-3" />
                                <h2 className="text-2xl font-semibold text-white">Bienfaiteur</h2>
                            </div>
                            <div className="p-6 flex flex-col justify-between h-full space-y-4">
                                <div>
                                    <p className="text-gray-100 text-lg">
                                        Nous ne bénéficions d&apos;aucune subvention. Grâce à votre don, vous permettez à ECA de poursuivre sa mission.
                                    </p>
                                    <p className="text-gray-300 mt-4">
                                        Vos dons nous permettent d&apos;acquérir du matériel d&apos;enregistrement,
                                        de former nos lecteurs et d&apos;améliorer nos services pour les personnes
                                        malvoyantes.
                                    </p>
                                </div>
                                <div className="bg-gray-800 p-4 rounded-lg">
                                    <p className="text-gray-100">
                                        <span className="font-semibold">Avantage fiscal</span> : Vos dons sont déductibles des impôts à hauteur de 66% dans la limite de 20% de votre revenu imposable.
                                    </p>
                                </div>
                                <div className="text-center pt-4">
                                    <a href="/faire-un-don" className="inline-block bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-6 rounded-md transition-colors">
                                        Faire un don
                                    </a>
                                </div>
                            </div>
                        </section>
                    </div>

                    <section className="bg-gradient-to-r from-blue-900 to-blue-700 rounded-lg p-8 text-center">
                        <h2 className="text-2xl font-bold text-white mb-4">Prêt à nous rejoindre ?</h2>
                        <p className="text-gray-100 mb-6 max-w-lg mx-auto">
                            Quelle que soit la forme de votre engagement, votre participation est précieuse pour faire vivre notre mission
                            d&apos;accessibilité à la lecture.
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center gap-4">
                            <a href="/contact" className="bg-white text-blue-800 hover:bg-gray-100 font-medium py-2 px-6 rounded-md transition-colors">
                                Nous contacter
                            </a>
                            <a href="/formulaire-adhesion" className="bg-transparent border-2 border-white text-white hover:bg-white/10 font-medium py-2 px-6 rounded-md transition-colors">
                                Formulaire d&apos;adhésion
                            </a>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}