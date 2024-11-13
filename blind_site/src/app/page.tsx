import type { NextPage } from "next";
import Head from "next/head";

const Home: NextPage = () => {
    return (
        <>
            <Head>
                <title>Enregistrements à la Carte</title>
            </Head>
            <main className="container mx-auto p-4">
                <h1 className="text-4xl font-bold">Bienvenue sur le site ECA !</h1>
                <p className="mt-4">
                    ECA : Enregistrements à la Carte pour les Aveugles propose à ses adhérents un service personnalisé d'enregistrement sur CD MP3 des livres et documents de leur choix. Nous mettons à leur disposition plus de 6 000 titres de notre catalogue <em>Lu Pour Vous !</em>, une sélection des meilleurs ouvrages enregistrés par nos bénévoles.
                </p>

                <section className="mt-8">
                    <h2 className="text-2xl font-semibold">Un service à la carte</h2>
                    <p className="mt-2">
                        Les lecteurs bénévoles d’ECA lisent VOS livres ! Vous pouvez nous envoyer tout document ou livre que vous souhaitez faire enregistrer, que ce soit pour des besoins professionnels, de formation, ou de divertissement.
                    </p>
                </section>

                <section className="mt-8">
                    <h2 className="text-2xl font-semibold">Catalogue <em>Lu Pour Vous !</em></h2>
                    <p className="mt-2">
                        Grâce à notre vaste catalogue, nous conservons en mémoire les meilleurs enregistrements réalisés. Ces ouvrages sont à votre disposition sous forme de CD-MP3, que vous conservez une fois reçus. Contrairement à une bibliothèque sonore, les titres choisis vous sont définitivement acquis.
                    </p>
                </section>

                <section className="mt-8">
                    <h2 className="text-2xl font-semibold">Une cotisation modique</h2>
                    <p className="mt-2">
                        La cotisation annuelle est de 40 €, donnant accès à tous nos services. Chaque CD-MP3 est facturé 3 €, qu'il s'agisse d'une lecture à la carte ou d'un choix dans le catalogue <em>Lu Pour Vous !</em>. L'envoi des ouvrages est gratuit grâce à l'utilisation d'un cécogramme.
                    </p>
                </section>

                <section className="mt-8">
                    <h2 className="text-2xl font-semibold">Auditeurs, Bénévoles et Bienfaiteurs</h2>
                    <p className="mt-2">
                        Aujourd'hui, ECA compte 263 auditeurs déficients visuels et 108 lecteurs bénévoles. De plus, des bienfaiteurs soutiennent notre mission par leurs dons et cotisations, permettant ainsi à ECA de continuer à offrir ses services. Depuis septembre 2018, ECA est une délégation des Auxiliaires des Aveugles, une association reconnue au niveau national.
                    </p>
                </section>

                <footer className="mt-8">
                    <p className="text-sm text-gray-600">Mise à jour: décembre 2023</p>
                </footer>
            </main>
        </>
    );
};

export default Home;
