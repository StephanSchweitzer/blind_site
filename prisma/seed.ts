import { hash } from 'bcrypt'
import { prisma } from '@/lib/prisma';

async function main() {
    const password = await hash('test', 12)
    const user = await prisma.user.upsert({
        where: { email: 'test@test.com' },
        update: {},
        create: {
            email: 'test@test.com',
            name: 'Test User',
            password
        }
    })

    await prisma.genre.createMany({
        data: [
            { name: 'Non classé', description: 'Ouvrages qui ne correspondent à aucune catégorie spécifique' },
            { name: 'Autobiographies-Mémoires', description: 'Récits personnels relatant la vie et les expériences de leurs auteurs' },
            { name: 'Romans étrangers', description: 'Œuvres de fiction traduites de langues étrangères' },
            { name: 'Religion - Spiritualité', description: 'Ouvrages traitant des croyances religieuses et des pratiques spirituelles' },
            { name: 'Histoire-Politique', description: 'Livres analysant les événements historiques et leur contexte politique' },
            { name: 'Romans français', description: 'Œuvres de fiction écrites par des auteurs français' },
            { name: 'Policiers - Thrillers', description: 'Romans à suspense mettant en scène des enquêtes criminelles' },
            { name: 'Sciences - Médecine', description: 'Ouvrages scientifiques et médicaux pour professionnels et grand public' },
            { name: 'Essais - Chroniques', description: 'Textes analytiques et réflexifs sur des sujets variés' },
            { name: 'Contes - Nouvelles', description: 'Courts récits de fiction, histoires traditionnelles et contemporaines' },
            { name: 'Biographies', description: 'Récits de vie de personnalités marquantes' },
            { name: 'Témoignages', description: 'Récits personnels d\'expériences vécues' },
            { name: 'Psychologie - Développement personnel', description: 'Ouvrages sur la compréhension de soi et l\'épanouissement personnel' },
            { name: 'Voyages', description: 'Récits d\'aventures et guides de destinations' },
            { name: 'Philosophie', description: 'Réflexions sur les questions fondamentales de l\'existence et de la pensée' },
            { name: 'Vie Domestique', description: 'Guides pratiques pour la gestion du foyer et la vie quotidienne' },
            { name: 'Arts - Culture', description: 'Ouvrages sur les expressions artistiques et les phénomènes culturels' },
            { name: 'Théâtre - Poésie', description: 'Œuvres dramatiques et poétiques' },
            { name: 'Divers', description: 'Ouvrages aux thématiques variées ne correspondant pas aux autres catégories' },
            { name: 'Ouvrages scolaires', description: 'Manuels et supports pédagogiques pour l\'enseignement' },
            { name: 'Langue et langues', description: 'Livres sur la linguistique et l\'apprentissage des langues' },
            { name: 'Economie- Finance', description: 'Analyses des phénomènes économiques et financiers' },
            { name: 'Droit - Economie', description: 'Ouvrages juridiques et économiques' },
            { name: 'Littérature Jeunesse', description: 'Livres destinés aux jeunes lecteurs' },
            { name: 'Technologies', description: 'Ouvrages sur les innovations et avancées technologiques' },
            { name: 'Périodiques', description: 'Publications régulières : magazines, revues et journaux' },
            { name: 'Sociologie', description: 'Études des phénomènes sociaux et des comportements collectifs' },
            { name: 'Bande dessinée', description: 'Romans graphiques et bandes dessinées' },
            { name: 'Roman Historique', description: 'Romans se déroulant dans un contexte historique précis' },
            { name: 'Politique', description: 'Analyses des systèmes et événements politiques' },
            { name: 'Archéologie', description: 'Études des civilisations anciennes à travers leurs vestiges' },
            { name: 'Arts', description: 'Ouvrages dédiés aux différentes formes d\'expression artistique' },
            { name: 'Spiritualité', description: 'Exploration des pratiques et croyances spirituelles' },
            { name: 'Essai', description: 'Textes réflexifs sur des sujets divers' },
            { name: 'Histoire', description: 'Études des événements et périodes historiques' },
            { name: 'Poésie', description: 'Œuvres poétiques et analyses de la poésie' },
            { name: 'Biographies, Religion - Spiritualité', description: 'Biographies de figures religieuses et spirituelles' },
            { name: 'Alimentation', description: 'Ouvrages sur la nutrition et la gastronomie' },
            { name: 'Arts, Essai, Histoire-Politique', description: 'Ouvrages multidisciplinaires mêlant art, réflexion et contexte historique' },
            { name: 'Histoire, Romans étrangers', description: 'Romans historiques d\'auteurs étrangers' },
            { name: 'Biographies, Témoignages', description: 'Récits biographiques et témoignages personnels' }
        ],
        skipDuplicates: true, // This will skip any duplicates based on the unique constraint
    })
}
main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })