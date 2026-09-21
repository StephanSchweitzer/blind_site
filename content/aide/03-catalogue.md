---
title: Catalogue
slug: catalogue
order: 3
---

# Catalogue

Le Catalogue est la page principale permettant d'ajouter, de modifier et de supprimer des livres. L'URL de cette page est https://eca-aveugles.fr/admin/books. Il s'agit du centre de gestion de tous les ouvrages qui font l'objet de demandes et d'attributions. C'est également ce système qui alimente le catalogue accessible au public avec l'ensemble des ouvrages.

![Catalogue - capture 1](/admin/aide/images/catalogue-01.jpg)

Vous pouvez rechercher les livres présents dans la base de données à l'aide de la barre de recherche.

![Catalogue - capture 2](/admin/aide/images/catalogue-02.jpg)

Vous disposez également de filtres que vous pouvez appliquer.

1. Vous pouvez filtrer la recherche par titre, auteur, ISBN, etc.

2. Vous pouvez filtrer les résultats en fonction des livres pour lesquels un fichier audio est disponible, ainsi que des livres visibles ou non sur le site public.

3. Vous pouvez filtrer les résultats en fonction d'un ou de plusieurs genres.

![Catalogue - capture 3](/admin/aide/images/catalogue-03.jpg)

Vous pouvez créer un nouveau livre en cliquant sur le bouton « Ajouter un livre », situé en haut à droite de la page.

![Catalogue - capture 4](/admin/aide/images/catalogue-04.jpg)

Vous pouvez modifier un livre existant en cliquant sur la ligne correspondante.

Vous pouvez également cliquer sur le bouton audio, situé dans la colonne « Audio », pour ouvrir l'éditeur audio directement depuis le tableau.

![Catalogue - capture 6](/admin/aide/images/catalogue-06.jpg)

## Ajout de livres

Lorsque vous cliquez sur le bouton « Ajouter un livre », le modal permettant de créer un livre s'ouvre.

![Catalogue - capture 7](/admin/aide/images/catalogue-07.jpg)

Vous pouvez soit saisir manuellement les informations relatives au livre, soit utiliser l'API Google Livres pour que les champs soient remplis automatiquement. Pour effectuer une recherche via Google, cliquez sur le bouton « Rechercher sur Google Livres ».

![Catalogue - capture 8](/admin/aide/images/catalogue-08.jpg)

Une petite barre de recherche et une section de résultats s'afficheront alors, vous permettant de rechercher un livre.

![Catalogue - capture 9](/admin/aide/images/catalogue-09.jpg)

(1) Saisissez le titre, l'auteur ou l'ISBN de votre livre, (2) cliquez « Rechercher », (3) puis cliquez sur la ligne correspondante qui s'affiche.

Dans mon exemple, je vais saisir « Notre-Dame de Paris », puis cliquer sur le bouton « Rechercher ».

![Catalogue - capture 10](/admin/aide/images/catalogue-10.jpg)

Dès que je clique sur la ligne, la petite barre de recherche et la section des résultats disparaîtront, et le formulaire sera renseigné avec les informations correspondantes.

![Catalogue - capture 11](/admin/aide/images/catalogue-11.jpg)

Vérifiez toujours que les informations renseignées automatiquement par Google sont correctes et correspondent bien au titre, à l'éditeur et à l'année de publication de votre livre.

C'est à vous de cliquer sur la rubrique « Sélectionner les genres associés » et d'associer un ou plusieurs genres à ce livre.

![Catalogue - capture 12](/admin/aide/images/catalogue-12.jpg)

Je vais rechercher « romain français », puis je cliquerai dessus

![Catalogue - capture 13](/admin/aide/images/catalogue-13.jpg)

![Catalogue - capture 14](/admin/aide/images/catalogue-14.jpg)

Le livre est désormais classé dans la catégorie « Roman français ».

Au bas du modal « Ajouter un livre », vous trouverez deux cases à cocher. La première, « Disponible », indique si le livre dispose d'un enregistrement et s'il est prêt à être envoyé aux Auditeurs s'ils en font la demande.

La seconde, « Masqué du catalogue public », signifie que le livre est « masqué » sur la partie du site accessible au public. Cochez cette case lorsque vous ajoutez une œuvre controversée et que vous ne souhaitez pas qu'elle apparaisse sur le site public.

![Catalogue - capture 15](/admin/aide/images/catalogue-15.jpg)

Enfin, cliquez sur le bouton « Ajouter le livre » situé en bas de la page pour enregistrer votre saisie et l'ajouter à la base de données.

![Catalogue - capture 16](/admin/aide/images/catalogue-16.jpg)

## Modification des livres

Lorsque vous cliquez sur la ligne d'un livre, le modal de modification du livre s'ouvre.

Sous son titre, la ligne « Ce livre : 3 demandes · 1 attribution » indique ce qui existe déjà pour cet ouvrage. Chaque nombre est un lien qui ouvre, dans un nouvel onglet, la liste des [Demandes](/admin/aide/demandes) ou des [Attributions](/admin/aide/attributions) restreinte à ce livre.

![Catalogue - capture 17](/admin/aide/images/catalogue-17.jpg)

Vous pouvez également ouvrir l'éditeur audio ici

![Catalogue - capture 18](/admin/aide/images/catalogue-18.jpg)

Le reste du formulaire fonctionne de la même manière que le formulaire d'ajout d'un livre. Les deux formulaires ont la même mise en page, car ils proviennent du même modal de base.

Pour enregistrer le livre, rendez-vous en bas de la page et cliquez sur « Mettre à jour le livre ». Pour le supprimer, rendez-vous en bas de la page et cliquez sur « Supprimer le livre ».

### Supprimer un livre

Lorsque vous cliquez sur « Supprimer le livre », une fenêtre de confirmation s'ouvre.

Si le livre est encore lié à des demandes ou à des attributions, la suppression est refusée et la fenêtre vous indique lesquelles. Traitez-les d'abord, puis recommencez.

Si le livre possède un enregistrement audio, la fenêtre vous demande ce qu'il faut en faire. Dans le doute, choisissez « Laisser le dossier dans le stockage ».

Si ce dossier audio est aussi celui d'une autre fiche — cas des doublons issus de l'ancienne base —, un cadre orange nomme cette autre fiche et seule l'option « Laisser le dossier dans le stockage » reste possible : les deux autres la priveraient de son enregistrement. Supprimez alors la fiche en trop : l'enregistrement n'est ni copié ni effacé, et l'autre fiche le garde.

### Restaurer un livre supprimé

Un livre supprimé n'est pas effacé : il disparaît des listes, des recherches et des menus, mais sa fiche reste ouvrable depuis un lien, par exemple depuis une ancienne demande ou attribution, ou depuis le [journal des modifications](/admin/aide/statistiques#le-journal-des-modifications). Un bandeau rouge « Fiche supprimée le … » s'affiche alors en haut de la fiche, avec un bouton « **Restaurer** ».

Si des fichiers audio de ce livre sont dans la corbeille, la fenêtre de confirmation vous demande lesquels ramener :

- les fichiers envoyés à la corbeille **avec la suppression** du livre : cochés par défaut ;
- les fichiers **supprimés avant**, un par un, depuis l'éditeur audio : décochés par défaut, car ce sont souvent des prises ratées ou remplacées.

Les fichiers non cochés restent dans la [corbeille audio](/admin/aide/corbeille-audio), d'où vous pourrez les restaurer plus tard.

Si un autre livre porte aujourd'hui le même ISBN, la restauration est refusée et la fenêtre indique lequel. C'est souvent le même livre, saisi de nouveau : gardez alors cette autre fiche.

## Éditeur audio

Lorsque vous cliquez sur l'éditeur audio depuis la page d'accueil ou depuis le modal « Modifier le livre », le modal de « L'éditeur audio » s'ouvre. Pour cet exemple, j'utilise un livre qui est déjà disponible en version audio.

![Catalogue - capture 19](/admin/aide/images/catalogue-19.jpg)

Vous pouvez ici importer des fichiers ou des dossiers, ainsi que supprimer des fichiers ou des dossiers. Pour tout télécharger ou tout supprimer, utilisez les deux boutons correspondants situés en haut de la page.

Si une [attribution](/admin/aide/attributions) de ce livre est encore « En cours », un cadre orange « Lecture en cours : l'audio peut être incomplet » s'affiche en haut de la fenêtre : le lecteur n'a pas fini, et les fichiers présents ne sont peut-être qu'une partie de la lecture — par exemple après la réouverture d'une attribution terminée à tort. Avant d'envoyer cet audio à l'auditeur, vérifiez auprès du permanent nommé dans le cadre : celui qui a rouvert l'attribution, sinon celui qui l'a créée, sinon celui qui traite la demande. Le cadre n'empêche rien : il disparaît dès que l'attribution passe « Terminé ».

Si le dossier audio est partagé avec une autre fiche — cas des doublons issus de l'ancienne base —, toute suppression de piste est refusée, qu'elle porte sur un seul fichier ou sur l'ensemble : le message nomme l'autre livre et son identifiant. L'enregistrement étant le même pour les deux fiches, réglez d'abord le doublon : si les deux fiches décrivent le même livre, [supprimez celle qui est en trop](#supprimer-un-livre) en laissant le dossier dans le stockage. Sinon, écrivez à l'informaticien (adresse indiquée dans le message) pour faire séparer les dossiers.

![Catalogue - capture 20](/admin/aide/images/catalogue-20.jpg)

Pour importer un fichier audio, faites défiler la page jusqu'en bas. Si vous souhaitez importer des fichiers individuels, cliquez sur « Ajouter les fichiers » ; si vous souhaitez importer un dossier entier, cliquez sur « Ajouter un dossier ».

![Catalogue - capture 21](/admin/aide/images/catalogue-21.jpg)

Si vous souhaitez (1) télécharger, (2) modifier les noms de fichiers ou (3) supprimer des fichiers individuels, utilisez les boutons situés à droite de la ligne correspondante.

![Catalogue - capture 22](/admin/aide/images/catalogue-22.jpg)

Les fichiers sont classés par ordre alphabétique. Si vous souhaitez modifier l'ordre des fichiers, renommez-les en conséquence ; ils se réorganisent automatiquement après une actualisation ou lorsque vous fermez puis rouvrez le modal d'édition audio.
