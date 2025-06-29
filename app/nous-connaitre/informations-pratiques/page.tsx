import FrontendNavbar from "@/components/Frontend-Navbar";

export default async function InformationsPratique() {
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
                        <h1 className="text-3xl font-bold mb-4 text-white">Informations Pratiques</h1>
                        <p className="text-lg text-gray-100">Tout ce que vous devez savoir sur nos services</p>
                    </section>

                    <section className="space-y-8">
                        <div className="bg-gray-700 rounded-lg p-6 shadow-lg">
                            <h2 className="text-2xl font-semibold mb-4 text-white">Comment ça marche ?</h2>
                            <div className="space-y-4 text-gray-100">
                                <p>
                                    Membre des ECA (vous avez acquitté votre adhésion annuelle de 50 €), vous postez le(s) livre(s) - l’envoi postal est gratuit grâce au cécogramme, franchise postale réservée aux aveugles – ou vous le(s) déposez à l’adresse des ECA - 71 avenue de Breteuil 75015 Paris - en indiquant éventuellement vos consignes de lecture.                                </p>
                                <p>
                                    Ensuite le document est adressé pour enregistrement à un lecteur bénévole. Une fois la lecture terminée, les ECA vous adressent en retour votre livre et l&apos;enregistrement audio au format mp3 (CD, clef USB, plateforme WeTransfer…).
                                </p>
                            </div>
                        </div>

                        <div className="bg-gray-700 rounded-lg p-6 shadow-lg">
                            <h2 className="text-2xl font-semibold mb-4 text-white">Quel est le délai d&apos;enregistrement d&apos;un livre par un lecteur ?</h2>
                            <div className="space-y-4 text-gray-100">
                                <p>
                                    <span className="font-semibold text-white">4 à 6 semaines</span>, ce délai varie en fonction du nombre de pages et de la difficulté du texte.
                                </p>
                                <p>
                                    Une demande urgente (examens, présentation…) est bien évidemment prise en compte.
                                </p>
                            </div>
                        </div>

                        <div className="bg-gray-700 rounded-lg p-6 shadow-lg">
                            <h2 className="text-2xl font-semibold mb-4 text-white">Combien ça coûte ?</h2>
                            <div className="space-y-4 text-gray-100">
                                <p>
                                    Chaque enregistrement est facturé <span className="font-semibold text-white">3 €</span>, il reste votre propriété exclusive (vous n&apos;avez pas à le retourner aux ECA après écoute) et il est réservé à votre usage personnel.
                                </p>
                                <p>
                                    La facture vous est adressée pour règlement lorsqu&apos;elle atteint <span className="font-semibold text-white">21 €</span>, ou avant en cas de demande sporadique et/ou en fin d&apos;année comptable.
                                </p>
                            </div>
                        </div>

                        <div className="bg-gray-700 rounded-lg p-6 shadow-lg">
                            <h2 className="text-2xl font-semibold mb-4 text-white">Peut-on obtenir des enregistrements déjà demandés par d&apos;autres adhérents-auditeurs ?</h2>
                            <div className="space-y-4 text-gray-100">
                                <p>
                                    Bien sûr, le catalogue des livres enregistrés est à la disposition des adhérents et peut être consulté en ligne sur le site : <a href="http://www.eca-aveugles.fr/catalogue" className="text-blue-400 hover:text-blue-300 underline">www.eca-aveugles.fr/catalogue</a>.
                                </p>
                                <p>
                                    Régulièrement les ECA communiquent aux adhérents la liste des livres récemment enregistrés.
                                </p>
                                <p>
                                    Il vous suffit de commander la duplication du livre qui vous intéresse par mail, téléphone ou courrier. Chaque duplication coûte <span className="font-semibold text-white">3€</span>.
                                </p>
                            </div>
                        </div>

                        <div className="bg-gray-700 rounded-lg p-6 shadow-lg">
                            <h2 className="text-2xl font-semibold mb-4 text-white">J&apos;ai une question, je cherche un livre, j&apos;ai une réclamation, je n&apos;ai pas compris …</h2>
                            <div className="space-y-4 text-gray-100">
                                <p>
                                    N&apos;hésitez pas à nous contacter, les ECA tiennent toute l&apos;année deux permanences hebdomadaires ouvertes au public :
                                </p>
                                <div className="bg-gray-600 p-4 rounded-md space-y-2">
                                    <p className="font-medium text-white">🕘 Mardi de 9h à 17h</p>
                                    <p className="font-medium text-white">🕘 Jeudi de 9h à 14h</p>
                                </div>
                                <p>
                                    Si vous êtes de passage à Paris, en région parisienne, n&apos;hésitez pas à venir nous rencontrer au 71 avenue de Breteuil 75015 Paris.
                                </p>
                                <div className="mt-6 p-4 bg-blue-900 rounded-md">
                                    <h3 className="font-semibold text-white mb-2">Contact</h3>
                                    <p className="text-blue-100">
                                        📧 <a href="mailto:ecapermanence@gmail.com" className="text-blue-300 hover:text-blue-200 underline">ecapermanence@gmail.com</a>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}