import { authOptions } from '@/lib/auth';
import { getServerSession } from "next-auth";
import FrontendNavbar from "@/components/Frontend-Navbar";
import { LoginButton, LogoutButton } from "@/app/auth";

export default async function Home() {
    const session = await getServerSession(authOptions);

    return (
        <main className="min-h-screen relative">
            {/* Decorative borders - only visible on larger screens */}
            <div className="hidden lg:block fixed inset-y-0 w-full">
                <div className="h-full max-w-6xl mx-auto">
                    <div className="h-full flex">
                        <div className="w-16 h-full bg-gradient-to-r from-transparent to-gray-100"></div>
                        <div className="flex-1"></div>
                        <div className="w-16 h-full bg-gradient-to-l from-transparent to-gray-100"></div>
                    </div>
                </div>
            </div>

            <div className="relative">
                <FrontendNavbar />

                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12 bg-white">
                    <section className="text-center">
                        <h1 className="text-3xl font-bold mb-4">Bienvenue sur le site ECA !</h1>
                        <h2 className="text-2xl font-semibold mb-2">ECA: Enregistrements à la Carte pour les Aveugles</h2>
                    </section>

                    <section className="space-y-6">
                        <p className="text-lg">
                            ECA/Délégation des Auxiliaires des Aveugles ("ECA") propose à ses adhérents un service personnalisé d'enregistrement sur CD MP3 des livres et documents de leur choix. ECA met aussi à leur disposition les quelque 6 000 titres du catalogue <a href="/catalogue" className="text-blue-600 font-semibold italic hover:text-blue-800">Lu Pour Vous !</a>, une sélection des meilleurs ouvrages enregistrés ces dernières années qui ne cesse de s'enrichir. ECA met en contact des lecteurs bénévoles formés par l'association et des auditeurs déficients visuels qui accèdent ainsi au plaisir de l'écoute des textes qu'ils ont choisis. Passerelle chaleureuse entre voyants et malvoyants, ECA cherche à se faire mieux connaître et à augmenter le nombre de ses adhérents.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-semibold text-blue-600">Un service à la carte</h3>
                        <p>Les lecteurs bénévoles d'ECA lisent VOS livres ! Les adhérents peuvent faire parvenir à ECA tous livres ou documents dont ils souhaitent l'enregistrement vocal pour leurs besoins professionnels ou de formation, ou pour leur divertissement.</p>
                    </section>

                    <section className="space-y-4">
                        <p>Grâce à sa vaste unité de stockage, ECA garde en mémoire les meilleurs enregistrements réalisés par ses lecteurs bénévoles. Inscrits au catalogue <a href="/catalogue" className="text-blue-600 font-semibold italic hover:text-blue-800">Lu Pour Vous !</a> consultable sur ce site, les livres lus sont ainsi mis à la disposition des adhérents. Mais ECA n'est pas, et ne fonctionne pas, comme une bibliothèque sonore de prêts. L'adhérent, qui choisit un titre dans <a href="/catalogue" className="text-blue-600 font-semibold italic hover:text-blue-800">Lu pour Vous !</a>, reçoit un CD-MP3 gravé à son intention qui lui reste acquis.</p>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-semibold text-blue-600">Une cotisation modique</h3>
                        <p>La cotisation annuelle est de 40 euros, et donne accès à tous les services et activités d'ECA et des Auxiliaires des Aveugles. Chaque CD-MP3 est facturé 3 euros, qu'il s'agisse d'une lecture à la carte ou d'un choix sur le catalogue. Un adhérent peut envoyer pour enregistrement autant de livres qu'il le souhaite. L'envoi des ouvrages à l'association est totalement gratuit grâce à l'utilisation d'un cécogramme.</p>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-semibold text-blue-600">Auditeurs, Bénévoles et Bienfaiteurs</h3>
                        <p>ECA compte aujourd'hui 263 auditeurs déficients visuels et 108 lecteurs bénévoles. D'autre part, un certain nombre de bienfaiteurs, par leurs dons ou cotisations de soutien, permettent à ECA de poursuivre sa mission.</p>
                        <p className="text-sm italic">Note: ECA est depuis Septembre 2018 une délégation des Auxiliaires des Aveugles, association-loi de 1901, à vocation nationale. (Mise à jour décembre 2023)</p>
                    </section>

                    <LoginButton/>
                    <LogoutButton/>

                </div>
            </div>


        </main>
    );
}