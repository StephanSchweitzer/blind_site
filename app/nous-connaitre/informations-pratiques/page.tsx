import FrontendNavbar from "@/components/Frontend-Navbar";
import { Clock, Euro, BookMarked, HelpCircle, Mail } from "lucide-react";

export default async function InformationsPratique() {
    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">
                {/* Hero Section */}
                <section className="text-center glass-card-lg p-12">
                    <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Informations Pratiques</h1>
                    <p className="text-lg text-gray-700 dark:text-gray-100">Tout ce que vous devez savoir sur nos services</p>
                </section>

                {/* Information Cards */}
                <section className="space-y-8">
                    <div className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                <BookMarked className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex-1">Comment ça marche ?</h2>
                        </div>
                        <div className="space-y-4 text-gray-700 dark:text-gray-100 leading-relaxed">
                            <p>
                                Membre des ECA (vous avez acquitté votre adhésion annuelle de 50 €), vous postez le(s) livre(s) - l&apos;envoi postal est gratuit grâce au cécogramme, franchise postale réservée aux aveugles – ou vous le(s) déposez à l&apos;adresse des ECA - 71 avenue de Breteuil 75015 Paris - en indiquant éventuellement vos consignes de lecture.
                            </p>
                            <p>
                                Ensuite le document est adressé pour enregistrement à un lecteur bénévole. Une fois la lecture terminée, les ECA vous adressent en retour votre livre et l&apos;enregistrement audio au format mp3 (CD, clef USB, plateforme WeTransfer…).
                            </p>
                        </div>
                    </div>

                    <div className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                                <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex-1">Quel est le délai d&apos;enregistrement d&apos;un livre par un lecteur ?</h2>
                        </div>
                        <div className="space-y-4 text-gray-700 dark:text-gray-100 leading-relaxed">
                            <p>
                                <span className="font-semibold text-gray-900 dark:text-white text-lg">4 à 6 semaines</span>, ce délai varie en fonction du nombre de pages et de la difficulté du texte.
                            </p>
                            <p>
                                Une demande urgente (examens, présentation…) est bien évidemment prise en compte.
                            </p>
                        </div>
                    </div>

                    <div className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                                <Euro className="h-6 w-6 text-green-600 dark:text-green-400" />
                            </div>
                            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex-1">Combien ça coûte ?</h2>
                        </div>
                        <div className="space-y-4 text-gray-700 dark:text-gray-100 leading-relaxed">
                            <p>
                                Chaque enregistrement est facturé <span className="font-semibold text-gray-900 dark:text-white text-lg">3 €</span>, il reste votre propriété exclusive (vous n&apos;avez pas à le retourner aux ECA après écoute) et il est réservé à votre usage personnel.
                            </p>
                            <p>
                                La facture vous est adressée pour règlement lorsqu&apos;elle atteint <span className="font-semibold text-gray-900 dark:text-white text-lg">21 €</span>, ou avant en cas de demande sporadique et/ou en fin d&apos;année comptable.
                            </p>
                        </div>
                    </div>

                    <div className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                                <BookMarked className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                            </div>
                            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex-1">Peut-on obtenir des enregistrements déjà demandés par d&apos;autres adhérents-auditeurs ?</h2>
                        </div>
                        <div className="space-y-4 text-gray-700 dark:text-gray-100 leading-relaxed">
                            <p>
                                Bien sûr, le catalogue des livres enregistrés est à la disposition des adhérents et peut être consulté en ligne sur le site : <a href="http://www.eca-aveugles.fr/catalogue" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-medium">www.eca-aveugles.fr/catalogue</a>.
                            </p>
                            <p>
                                Régulièrement les ECA communiquent aux adhérents la liste des livres récemment enregistrés.
                            </p>
                            <p>
                                Il vous suffit de commander la duplication du livre qui vous intéresse par mail, téléphone ou courrier. Chaque duplication coûte <span className="font-semibold text-gray-900 dark:text-white text-lg">3€</span>.
                            </p>
                        </div>
                    </div>

                    <div className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30">
                                <HelpCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex-1">J&apos;ai une question, je cherche un livre, j&apos;ai une réclamation, je n&apos;ai pas compris…</h2>
                        </div>
                        <div className="space-y-4 text-gray-700 dark:text-gray-100 leading-relaxed">
                            <p>
                                N&apos;hésitez pas à nous contacter, les ECA tiennent toute l&apos;année deux permanences hebdomadaires ouvertes au public :
                            </p>
                            <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 p-6 rounded-lg space-y-2">
                                <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                    <Clock className="h-5 w-5" /> Mardi de 9h à 17h
                                </p>
                                <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                    <Clock className="h-5 w-5" /> Jeudi de 9h à 14h
                                </p>
                            </div>
                            <p>
                                Si vous êtes de passage à Paris, en région parisienne, n&apos;hésitez pas à venir nous rencontrer au 71 avenue de Breteuil 75015 Paris.
                            </p>
                            <div className="mt-6 p-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-200 dark:border-blue-800">
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                    <Mail className="h-5 w-5" /> Contact
                                </h3>
                                <p className="text-gray-700 dark:text-gray-100">
                                    <a href="mailto:ecapermanence@gmail.com" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-medium">
                                        ecapermanence@gmail.com
                                    </a>
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}