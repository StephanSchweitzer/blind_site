import FrontendNavbar from "@/components/Frontend-Navbar";

export default async function Home() {
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
                        <h1 className="text-3xl font-bold mb-4 text-white">Bienvenue sur le site ECA !</h1>
                        <h2 className="text-2xl font-semibold mb-2 text-gray-100">ECA: Enregistrements à la Carte pour les Aveugles</h2>
                    </section>

                    <section className="space-y-6">
                        <p className="text-lg text-gray-100">
                            ECA/Délégation des Auxiliaires des Aveugles (&quot;ECA&quot;) propose à ses adhérents un service personnalisé d&apos;enregistrement sur CD MP3 des livres et documents de leur choix. ECA met aussi à leur disposition les quelque 6 000 titres du catalogue <a href="/catalogue" className="text-white font-semibold italic hover:text-blue-300">Lu Pour Vous !</a>, une sélection des meilleurs ouvrages enregistrés ces dernières années qui ne cesse de s&apos;enrichir. ECA met en contact des lecteurs bénévoles formés par l&apos;association et des auditeurs déficients visuels qui accèdent ainsi au plaisir de l&apos;écoute des textes qu&apos;ils ont choisis. Passerelle chaleureuse entre voyants et malvoyants, ECA cherche à se faire mieux connaître et à augmenter le nombre de ses adhérents.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-semibold text-white">Un service à la carte</h3>
                        <p className="text-gray-100">Les lecteurs bénévoles d&apos;ECA lisent VOS livres ! Les adhérents peuvent faire parvenir à ECA tous livres ou documents dont ils souhaitent l&apos;enregistrement vocal pour leurs besoins professionnels ou de formation, ou pour leur divertissement.</p>
                    </section>

                    <section className="space-y-4">
                        <p className="text-gray-100">
                            Grâce à sa vaste unité de stockage, ECA garde en mémoire les meilleurs enregistrements réalisés par ses lecteurs bénévoles.
                            Inscrits au catalogue <a href="/catalogue" className="text-white font-semibold italic hover:text-blue-300">Lu Pour Vous !</a>
                            consultable sur ce site, les livres lus sont ainsi mis à la disposition des adhérents. Mais ECA n&apos;est pas, et ne fonctionne pas, comme une bibliothèque sonore de prêts. L&apos;adhérent, qui choisit un titre dans <a href="/catalogue" className="text-white font-semibold italic hover:text-blue-300">Lu pour Vous !</a>,
                            reçoit un CD-MP3 gravé à son intention qui lui reste acquis.</p>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-semibold text-white">Une cotisation modique</h3>
                        <p className="text-gray-300">La cotisation annuelle est de 40 euros, et donne accès à tous les services et activités d&apos;ECA et des Auxiliaires des Aveugles. Chaque CD-MP3 est facturé 3 euros, qu&apos;il s&apos;agisse d&apos;une lecture à la carte ou d&apos;un choix sur le catalogue. Un adhérent peut envoyer pour enregistrement autant de livres qu&apos;il le souhaite. L&apos;envoi des ouvrages à l&apos;association est totalement gratuit grâce à l&apos;utilisation d&apos;un cécogramme.</p>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-semibold text-white">Auditeurs, Bénévoles et Bienfaiteurs</h3>
                        <p className="text-gray-300">ECA compte aujourd&apos;hui 263 auditeurs déficients visuels et 108 lecteurs bénévoles. D&apos;autre part, un certain nombre de bienfaiteurs, par leurs dons ou cotisations de soutien, permettent à ECA de poursuivre sa mission.</p>
                        <p className="text-sm italic text-gray-400">Note: ECA est depuis Septembre 2018 une délégation des Auxiliaires des Aveugles, association-loi de 1901, à vocation nationale. (Mise à jour décembre 2023)</p>
                    </section>
                </div>
            </div>
        </main>
    );
}