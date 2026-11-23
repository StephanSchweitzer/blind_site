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

2. Le bouton sous « Filtres » ouvre trois choix : la disponibilité (disponibles ou en attente), l'audio (avec ou sans) et la visibilité sur le site public. Il affiche les filtres en cours — par exemple « En attente · Sans audio » —, ou « Tous les livres ».

3. Vous pouvez filtrer les résultats en fonction d'un ou de plusieurs genres.

![Catalogue - capture 3](/admin/aide/images/catalogue-03.jpg)

Vous pouvez créer un nouveau livre en cliquant sur le bouton « Ajouter un livre », situé en haut à droite de la page.

![Catalogue - capture 4](/admin/aide/images/catalogue-04.jpg)

Vous pouvez modifier un livre existant en cliquant sur la ligne correspondante.

Dans la colonne « Audio », la pastille dit l'état de l'enregistrement : « 3 pistes », « Pas d'audio associé », « Dossier vide »… Cliquez dessus pour ouvrir l'éditeur audio directement depuis le tableau.

![Catalogue - capture 6](/admin/aide/images/catalogue-06.jpg)

### Quand la recherche ne trouve rien

Si aucun livre ne correspond, le catalogue affiche sous le message « Aucun résultat » un encadré « Essayez plutôt » :

- **Un filtre cache le livre.** Si le livre existe mais qu'un filtre l'exclut (par exemple « Disponibles » alors qu'il est en attente), l'encadré le dit : « Le filtre « Disponibles » cache ce livre », avec le livre et la raison (« En attente »). Le bouton « Retirer ce filtre » relance la recherche sans ce filtre. Rien n'est retiré sans votre clic.
- **Un mot est mal orthographié.** L'encadré propose la bonne orthographe, par exemple « Vouliez-vous dire « le front dans les nuages » ? », et montre directement les livres correspondants.
- **Un mot est en trop.** L'encadré propose de chercher sans ce mot.

Dans chaque cas, cliquez sur un livre de l'encadré pour ouvrir sa fiche, ou sur le bouton du bas pour lancer la recherche proposée. Le catalogue public propose les mêmes suggestions à ses visiteurs. Les autres listes du portail font de même : voir [Quand une recherche ne trouve rien](/admin/aide/composants-de-base#quand-une-recherche-ne-trouve-rien).

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

Vérifiez toujours que les informations renseignées automatiquement par Google sont correctes et correspondent bien au titre, à l'éditeur, à l'année de publication et à l'ISBN de votre livre — ces champs se suivent, en haut du formulaire. Viennent ensuite les genres et la description.

C'est à vous de cliquer sur la rubrique « Choisir les genres… » et d'associer un ou plusieurs genres à ce livre.

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

Le reste du formulaire fonctionne de la même manière que le formulaire d'ajout d'un livre. Les deux formulaires ont la même mise en page, car ils proviennent du même modal de base. Seule la « Durée de la lecture » n'apparaît qu'ici : elle se calcule sur les fichiers audio, qu'un livre en cours de création n'a pas encore.

Pour enregistrer le livre, rendez-vous en bas de la page et cliquez sur « Mettre à jour le livre ». Pour le supprimer, rendez-vous en bas de la page et cliquez sur « Supprimer le livre ».

### Supprimer un livre

Lorsque vous cliquez sur « Supprimer le livre », une fenêtre de confirmation s'ouvre.

Si le livre est encore lié à des demandes ou à des attributions, la suppression est refusée et la fenêtre vous indique lesquelles. Traitez-les d'abord, puis recommencez. Le contrôle est refait au dernier moment : si quelqu'un rattache une demande au livre pendant la suppression, elle est refusée de la même façon. Si vous aviez choisi d'envoyer l'audio à la corbeille, les pistes y sont déjà : [restaurez-les depuis la corbeille audio](/admin/aide/corbeille-audio) si le livre doit les garder.

Si le livre possède un enregistrement audio, la fenêtre vous demande ce qu'il faut en faire. Dans le doute, choisissez « Laisser le dossier dans le stockage ». Si vous l'envoyez à la corbeille et que la suppression s'interrompt (connexion coupée), la fiche n'est pas supprimée : la fenêtre affiche alors le nombre de pistes restées dans le dossier, à confirmer pour terminer. Pendant le déplacement, la fenêtre ne se ferme pas, et le navigateur demande confirmation avant de quitter la page.

Si ce dossier audio est aussi celui d'une autre fiche — cas des doublons issus de l'ancienne base —, un cadre orange nomme cette autre fiche et seule l'option « Laisser le dossier dans le stockage » reste possible : les deux autres la priveraient de son enregistrement. Supprimez alors la fiche en trop : l'enregistrement n'est ni copié ni effacé, et l'autre fiche le garde.

### Restaurer un livre supprimé

Un livre supprimé n'est pas effacé : il disparaît des listes, des recherches et des menus, mais sa fiche reste ouvrable depuis un lien, par exemple depuis une ancienne demande ou attribution, ou depuis le [journal des modifications](/admin/aide/statistiques#le-journal-des-modifications). Un bandeau rouge « Fiche supprimée le … » s'affiche alors en haut de la fiche, avec un bouton « **Restaurer** ».

Si des fichiers audio de ce livre sont dans la corbeille, la fenêtre de confirmation vous demande lesquels ramener :

- les fichiers envoyés à la corbeille **avec la suppression** du livre : cochés par défaut ;
- les fichiers **supprimés avant**, un par un, depuis l'éditeur audio : décochés par défaut, car ce sont souvent des prises ratées ou remplacées.

Les fichiers non cochés restent dans la [corbeille audio](/admin/aide/corbeille-audio), d'où vous pourrez les restaurer plus tard. Un dossier volumineux revient en plusieurs étapes : la fenêtre indique combien de pistes sont revenues. Si la restauration s'interrompt, la fiche est déjà restaurée et le message propose « Reprendre » pour ramener les pistes qui restent.

Si un autre livre porte aujourd'hui le même ISBN, la restauration est refusée et la fenêtre indique lequel. C'est souvent le même livre, saisi de nouveau : gardez alors cette autre fiche.

## Éditeur audio

Lorsque vous cliquez sur la pastille audio du catalogue ou sur « Ouvrir l'éditeur audio » dans le modal « Modifier le livre », le modal de « L'éditeur audio » s'ouvre. Pour cet exemple, j'utilise un livre qui est déjà disponible en version audio.

![Catalogue - capture 19](/admin/aide/images/catalogue-19.jpg)

Vous pouvez ici écouter, télécharger, renommer, remplacer ou supprimer chaque piste, et importer des fichiers ou un dossier entier. Les liens d'écoute et de téléchargement sont valables une heure ; passé ce délai, « Écouter » et le bouton de téléchargement les renouvellent d'eux-mêmes. En haut de la fenêtre figurent le poids de l'enregistrement, le nombre de CD qu'il occupe (un CD par tranche de 700 Mo entamée, comme le tarif de la demande) et sa durée totale. Si une piste n'a pas encore été mesurée (« — » sur sa ligne), la durée est « Non calculée » et le bouton « Recalculer » à côté la mesure.

![Catalogue - capture 20](/admin/aide/images/catalogue-20.jpg)

Pour (1) tout télécharger ou (2) tout supprimer, utilisez les deux boutons correspondants situés en haut de la fenêtre.

L'archive de « Tout télécharger (ZIP) » contient les pistes et une liste de lecture, « Liste de lecture.m3u8 », dans l'ordre de lecture. Les fichiers gardent leur nom, sauf dans deux cas. Si un graveur de CD, qui range les noms caractère par caractère, ne les mettrait pas dans l'ordre de lecture (par exemple « 1000 10 » avant « 1000 2 »), chaque fichier est précédé de sa position (« 001 », « 002 »…) ; un message le signale à la fin du téléchargement. Un caractère que Windows refuse dans un nom (« ? », « " »…) est remplacé par une espace. Un fichier de l'archive renvoyé dans le même dossier est reconnu comme déjà présent. Si le téléchargement échoue en cours de route, l'archive n'est pas utilisable : cliquez sur « Réessayer ». Pendant la préparation de l'archive, les boutons qui modifient les pistes (remplacer, renommer, supprimer) sont désactivés : l'archive lit les pistes telles qu'elles étaient au départ.

Si l'enregistrement ne tient pas sur un seul CD, un choix « Archive ZIP » apparaît sous le bouton : « Un seul dossier » ou « Un dossier par CD », avec le nombre de CD entre parenthèses. Par CD, l'archive contient un dossier par disque (« CD 1 sur 3 », « CD 2 sur 3 »…), chacun avec ses pistes et sa propre « Liste de lecture.m3u8 ». Les pistes restent dans l'ordre de lecture, jamais réordonnées pour mieux remplir un disque : chaque CD reprend à la piste qui suit le précédent, et des pistes numérotées gardent leur numéro d'un CD à l'autre (le CD 2 ne recommence pas à « 001 »). Le découpage se fait sur le poids seul, et les CD sont remplis à parts égales : 1,5 Go donne trois CD d'environ 500 Mo. Un CD est compté à 680 Mo, pour garder une marge à la gravure ; un enregistrement d'un peu moins de 700 Mo compte donc un CD au tarif mais en occupe deux ici. Si une piste dépasse à elle seule la capacité d'un CD, elle est seule dans son dossier, et le message de fin du téléchargement la nomme. Ouverte depuis une demande au format « CDR », la fenêtre propose d'abord « Un dossier par CD » ; depuis la fiche du livre ou une attribution, « Un seul dossier ». Le choix n'est pas retenu : il se fait à chaque téléchargement, puisqu'un même livre peut être demandé sur CD par un auditeur et envoyé par internet à un autre.

Si une [attribution](/admin/aide/attributions) de ce livre est encore « En cours », un cadre orange « Lecture en cours : l'audio peut être incomplet » s'affiche en haut de la fenêtre : le lecteur n'a pas fini, et les fichiers présents ne sont peut-être qu'une partie de la lecture — par exemple après la réouverture d'une attribution terminée à tort. Avant d'envoyer cet audio à l'auditeur, vérifiez auprès du permanent nommé dans le cadre : celui qui a rouvert l'attribution, sinon celui qui l'a créée, sinon celui qui traite la demande. Le cadre n'empêche rien : il disparaît dès que l'attribution passe « Terminé ».

Une fois l'audio déposé, ce cadre devient bleu : « Audio déposé : l'attribution n°… est toujours ouverte ». Déposer l'enregistrement ne termine pas l'attribution ; si la lecture est complète, cliquez sur « Terminer l'attribution n°… » pour l'ouvrir et renseigner sa date de retour aux ECA. Si elle ne l'est pas, laissez-la ouverte : l'audio est incomplet, et le cadre le rappelle à qui viendrait le télécharger. Le cadre bleu concerne aussi une attribution encore « Attente envoi vers lecteur », mais pas l'audio d'une lecture antérieure du même livre : il n'apparaît qu'après un dépôt fait depuis le début de la lecture, ou depuis sa réouverture. Ce sont les mêmes attributions que la ligne « Audio déposé » de la [page principale](/admin/aide/page-principale#ce-qui-est-a-suivre).

Si le dossier audio est partagé avec une autre fiche — cas des doublons issus de l'ancienne base —, toute suppression de piste est refusée, qu'elle porte sur un seul fichier ou sur l'ensemble : le message nomme l'autre livre et son identifiant. L'enregistrement étant le même pour les deux fiches, réglez d'abord le doublon : si les deux fiches décrivent le même livre, [supprimez celle qui est en trop](#supprimer-un-livre) en laissant le dossier dans le stockage. Sinon, écrivez à l'informaticien (adresse indiquée dans le message) pour faire séparer les dossiers.

« Tout supprimer » vide un gros dossier en plusieurs étapes, sous une seule barre de progression ; la fenêtre ne se ferme pas pendant ce temps. Si l'opération s'interrompt en route — le dossier a été modifié entre-temps, la connexion a coupé —, le message indique combien de pistes sont déjà dans la corbeille, et la liste se met à jour : relancez « Tout supprimer » pour les autres, rien ne sera déplacé deux fois.

![Catalogue - capture 21](/admin/aide/images/catalogue-21.jpg)

Si la fenêtre indique « Dossier introuvable », l'emplacement noté pour ce livre ne contient plus rien. L'enregistrement existe souvent encore sous un autre nom : cherchez-le dans [Audio orphelin](/admin/aide/audio-orphelin) et rattachez-le plutôt que de l'envoyer à nouveau.

Pour importer un fichier audio, utilisez le cadre en pointillés situé au-dessus de la liste des pistes. Si vous souhaitez importer des fichiers individuels, cliquez sur (1) « Ajouter des fichiers » ; si vous souhaitez importer un dossier entier, cliquez sur (2) « Ajouter un dossier ».

Les fichiers envoyés s'ajoutent toujours après les pistes déjà présentes. Avant l'envoi, un cadre récapitule ce qui va partir : « Voir l'ordre d'envoi » liste les fichiers dans l'ordre où ils seront ajoutés, avec leur numéro de piste et le nom qu'ils prendront dans le dossier ; si le dossier contient déjà des pistes, il le signale, et les fichiers qui y sont déjà (même nom, même taille) sont écartés d'office — « Envoyer » ne propose que ceux qui manquent. Vous pouvez donc choisir à nouveau le même dossier après un envoi interrompu sans créer de doublon. Si le fichier qui manque se trouve au milieu (le chapitre 5 alors que les suivants sont déjà en ligne), il sera tout de même ajouté après la dernière piste, donc joué en dernier : le cadre le signale avant l'envoi, avec la piste avant laquelle il devrait se trouver. Renommez-le ensuite pour le remettre à sa place. Les fichiers envoyés reprennent la numérotation du dossier, avec le même nombre de chiffres que ses pistes (« 18 » après « 17 », « 018 » après « 017 »), pour qu'un CD gravé depuis ce dossier les joue aussi dans l'ordre. Quand ce n'est pas possible — un dossier numéroté « 1 » à « 9 » qui reçoit sa dixième piste, ou dont les numéros n'ont déjà pas tous le même nombre de chiffres —, le cadre l'annonce avant l'envoi : l'ordre reste juste dans le portail, mais sur un CD la nouvelle piste passerait avant une autre. Pour l'éviter, renommez les pistes pour que leurs numéros aient le même nombre de chiffres (« 01 » plutôt que « 1 »). Si certains fichiers ont échoué, le bouton « Renvoyer » affiché sous la liste des fichiers en échec reste le plus simple. Fermer la fenêtre fait perdre cette liste : une confirmation le rappelle avant. Pour remplacer une piste par une nouvelle version — une prise réenregistrée —, cliquez sur « Remplacer » sur sa ligne et choisissez le nouveau fichier : il prend le nom de l'ancienne piste, donc sa place dans l'ordre de lecture, et l'ancienne version part dans la corbeille du livre. Supprimer la piste puis envoyer la nouvelle la placerait en dernier. Tant que la nouvelle version porte son nom, l'ancienne ne peut pas être restaurée : l'onglet « Corbeille » le signale sur sa ligne, et il faut d'abord renommer ou supprimer la piste actuelle. Si l'envoi de la nouvelle version échoue et que l'ancienne est restaurée entre-temps, « Renvoyer » est refusé plutôt que de placer la nouvelle en dernier : cliquez de nouveau sur « Remplacer » sur la ligne de la piste. Quand tous les fichiers d'un envoi sont arrivés, un livre « En attente » est marqué « Disponible », sauf après un « Remplacer » : refaire une prise ne dit pas que l'enregistrement est complet. Si des pistes ont été ajoutées ou retirées et que l'une d'elles ne peut pas être mesurée, la durée de la lecture passe à « Non calculée » plutôt que d'afficher l'ancienne. La durée est mesurée juste après l'envoi ; si la mesure échoue, le bouton « Recalculer la durée » affiché sous le cadre la relance. Un seul envoi à la fois par livre : deux envois simultanés dans le même dossier pourraient s'écraser l'un l'autre. Si quelqu'un — ou vous-même, dans un autre onglet — envoie déjà des fichiers sur ce livre, l'envoi est refusé avant de commencer, et le message indique qui, ainsi que l'heure à laquelle le livre se libère de lui-même si cet envoi a été interrompu (dix minutes au plus). Pendant un envoi, restaurer une piste de ce livre depuis la corbeille, ou renommer une de ses pistes, est refusé de la même façon : l'envoi pourrait écraser le fichier. Pendant un envoi, la fenêtre ne se ferme pas : quitter la page l'interromprait. Si vous cliquez malgré tout sur « Précédent » dans le navigateur, une fenêtre vous demande de confirmer ; « Continuer l'envoi » vous garde sur la page.

![Catalogue - capture 22](/admin/aide/images/catalogue-22.jpg)

Si vous souhaitez (1) télécharger, (2) remplacer par une nouvelle version, (3) renommer ou (4) supprimer un fichier, utilisez les boutons situés à droite de sa ligne.

Les fichiers sont classés dans l'ordre de leurs noms : les nombres dans l'ordre des nombres (« 2 » avant « 10 »), sans tenir compte des majuscules, des accents ni d'une espace entre un mot et son numéro (« Piste 01 » avant « piste 02 », « plage 09 » avant « plage10 »). Si vous souhaitez modifier l'ordre des fichiers, renommez-les en conséquence ; ils se réorganisent automatiquement après une actualisation ou lorsque vous fermez puis rouvrez le modal d'édition audio.

Pendant que vous tapez le nouveau nom, la fenêtre indique la place que la piste prendra (« Deviendra la piste n° 3 »). Si un CD gravé depuis ce dossier la placerait ailleurs que le portail — un graveur range les noms caractère par caractère, « 10 » avant « 2 » —, elle le signale aussi ; le plus sûr est de donner au numéro autant de chiffres que celui des autres pistes. Les caractères \ : * ? " < > |, les caractères invisibles (une tabulation collée avec le texte) et les noms réservés par Windows (« CON », « NUL », « COM1 »…) ne sont pas acceptés : Windows ne pourrait pas créer le fichier. Deux points qui se suivent (« .. ») sont refusés aussi. L'extension (« .mp3 ») est ajoutée d'office : si vous collez le nom complet, celle que vous avez tapée à la fin est ignorée. Un nom déjà porté par une autre piste du dossier est refusé dès la saisie. Un nouveau nom ne peut pas commencer par « ._ » (ni contenir « ._ » après un espace) : c'est la marque des fichiers de métadonnées que crée un Mac, que l'application ignore, et la piste disparaîtrait de la liste. Le renommage est aussi refusé quand le dossier audio est partagé avec une autre fiche, comme la suppression et l'ajout de nouveaux fichiers : ils toucheraient aussi l'enregistrement de l'autre fiche.
