---
title: Attributions
slug: attributions
order: 7
---

# Attributions

Les attributions sont au cœur de la gestion des informations relatives à qui lit quoi et quand. Elles sont toujours liées à des demandes et déterminent certains statuts de ces dernières.

Elles possèdent également leur propre statut, qui va de « en cours » à « terminée ». Elles ont pour but de dissocier la notion de « qui a demandé quoi et quand » de la logistique liée à « qui lit quoi et quand ». Une demande de type « Enregistrement » DOIT être créée AVANT la création d’une nouvelle attribution, et cette nouvelle attribution sera nécessairement liée à cette demande dès le départ.

L'URL de cette page est https://eca-aveugles.fr/admin/assignments.

La page d'accueil comporte (1) un tableau répertoriant les attributions existantes, (2) un champ de recherche permettant d'affiner la recherche, (3) un filtre par livre, (4) un filtre par statut, et un filtre par retard (« En retard », « À surveiller », « À jour »). La recherche porte sur le lecteur, l'auditeur, le livre et le numéro de l'attribution.

Une attribution en attente d'envoi est en retard après 60 jours sans lecteur ; un livre chez le lecteur est « à relancer » après 60 jours et en retard après 90 — les mêmes délais que pour les demandes, détaillés dans [Délais et retards](/admin/aide/demandes#delais-et-retards). Une attribution en retard apparaît sur fond rouge, avec sous son statut la mention « En retard » et depuis combien de temps.

![Attributions - capture 17](/admin/aide/images/attributions-17.jpg)

![Attributions - capture 1](/admin/aide/images/attributions-01.jpg)

Dans le tableau, cliquez sur le nom du lecteur pour ouvrir son [dossier](/admin/aide/membres#le-dossier), ou sur « ↳ demande n°… » pour ouvrir la demande liée.

## Ajout des attributions

Pour ajouter une attribution, cliquez sur le bouton « Ajouter une attribution »

![Attributions - capture 2](/admin/aide/images/attributions-02.jpg)

Cela ouvrira le modal « Créer une attribution ».

![Attributions - capture 3](/admin/aide/images/attributions-03.jpg)

À partir de là, vous devez sélectionner le lecteur en cliquant sur le champ « Sélectionner un lecteur ». Cela ouvrira la barre de recherche des lecteurs, dans laquelle vous trouverez votre lecteur.

![Attributions - capture 4](/admin/aide/images/attributions-04.jpg)

(1) Recherchez votre lecteur et (2) cliquez sur la ligne que vous souhaitez ajouter

![Attributions - capture 5](/admin/aide/images/attributions-05.jpg)

Cela permettra d'associer le lecteur à l’attribution.

![Attributions - capture 6](/admin/aide/images/attributions-06.jpg)

Passons maintenant à l'ajout d'une demande. Nous suivons la même procédure et (1) cliquons sur le champ « Sélectionner une demande ». Cela nous permettra d'afficher les (2) 10 demandes les plus récentes qui ont été enregistrées, dont le statut est « en attente » et qui nécessitent une attribution automatique.

![Attributions - capture 7](/admin/aide/images/attributions-07.jpg)

Une demande qui a déjà une attribution apparaît grisée et ne peut pas être choisie.

Nous pouvons aussi (1) en rechercher une autre si nous le souhaitons. (2) Cliquez sur la ligne correspondant à la demande que vous souhaitez associer à cette attribution.

![Attributions - capture 8](/admin/aide/images/attributions-08.jpg)

Une fois que vous aurez cliqué dessus, la demande et le livre associé à celle-ci seront ajoutés à notre formulaire d'attribution.

![Attributions - capture 9](/admin/aide/images/attributions-09.jpg)

En faisant défiler la page vers le bas, on peut voir d’autres champs, notamment la date de réception de l’attribution, la date d’envoi au lecteur et la date de retour à l’ECA. Le statut n’est pas directement modifiable afin de préserver la cohérence de nos données. Il est déterminé en fonction des dates renseignées.

Ainsi, si seule la (1) « Date de réception » est renseignée, le statut est « en attente d'envoi au lecteur ». Si (2) la « Date d'envoi au lecteur » est renseignée, le statut est « en cours », et lorsque (3) la « Date de retour aux ECA » est renseignée, le statut est « Terminé ». Pour modifier une date, il suffit de cliquer sur le champ correspondant.

![Attributions - capture 10](/admin/aide/images/attributions-10.jpg)

Ces trois dates se remplissent dans cet ordre. Une attribution ne peut pas passer « Terminé » tant que l'enregistrement n'a pas été déposé dans l'éditeur audio du livre, depuis le [Catalogue](/admin/aide/catalogue).

Une exception : les revues. Quand la demande liée est [tarifée à la page](/admin/aide/demandes#une-demande-tarifee-a-la-page-pour-les-revues), son prix ne dépend pas de l'enregistrement, et l'attribution peut passer « Terminé » sans audio. Au moment d'enregistrer, une fenêtre demande confirmation : « Vous n'avez déposé aucun audio pour cette attribution. Êtes-vous sûr de vouloir la passer au statut « Terminé » ? ». Répondez « Oui » pour terminer l'attribution sans audio, « Non » pour revenir au formulaire. Les duplications du même livre restent alors en attente : il n'y a toujours rien à dupliquer.

Pour l'enregistrer, cliquez sur le bouton « Créer l'attribution » situé tout en bas du modal.

![Attributions - capture 11](/admin/aide/images/attributions-11.jpg)

## Modification des attributions

Pour modifier une attribution, cliquez sur la ligne correspondante dans le tableau des attributions.

![Attributions - capture 12](/admin/aide/images/attributions-12.jpg)

Cela ouvrira le modal de modification des attributions.

![Attributions - capture 13](/admin/aide/images/attributions-13.jpg)

Il peut arriver qu'un lecteur ne parvienne pas à terminer son attribution ; dans ce cas, depuis cette fenêtre modale de modification d'attribution, nous pouvons réattribuer un lecteur en cliquant sur le champ « Lecteur ».

![Attributions - capture 14](/admin/aide/images/attributions-14.jpg)

Suivez la même procédure que précédemment pour attribuer un nouveau lecteur : cliquez sur les champs, effectuez une recherche, puis cliquez sur la ligne correspondant au nouveau lecteur que vous souhaitez associer.

(1) Vous pouvez ajouter un commentaire ou indiquer le motif de cette réattribution si vous le souhaitez.

(2) Lorsque vous êtes prêt à valider, cliquez sur « Réattribuer ».

![Attributions - capture 15](/admin/aide/images/attributions-15.jpg)

Lorsque vous cliquez sur ce bouton, l'attribution est immédiatement mise à jour ; il n'est donc pas nécessaire d'enregistrer l'ensemble du formulaire par la suite. Veillez donc à bien réfléchir avant de cliquer dessus.

La réattribution fait repartir le délai « chez le lecteur » de la demande : le nouveau lecteur n'hérite pas du retard du précédent (voir [Délais et retards](/admin/aide/demandes#delais-et-retards)).

### Changer la demande d'une attribution

Si une attribution a été rattachée à la mauvaise demande, choisissez la bonne dans le champ « Demande » puis enregistrez. La nouvelle demande doit porter sur le même livre, ne pas être une duplication et ne pas avoir déjà sa propre attribution.

Les deux demandes suivent : la nouvelle prend le statut de l'attribution, et l'ancienne, qui n'a plus d'attribution, revient à « Attente envoi vers lecteur », comme si l'attribution avait été supprimée. Si l'une des deux figure sur une facture déjà émise et devait quitter « Terminé », le changement est refusé ; sur un brouillon, elle en est retirée.

### Rouvrir une attribution terminée

Il arrive qu'une attribution ait été passée « Terminé » à tort — par exemple, un lecteur a envoyé une partie de sa lecture seulement, et enverra la suite plus tard. Dans ce cas, cliquez sur le bouton « Rouvrir l'attribution », sous le statut. Une fenêtre de confirmation s'ouvre :

- la date de retour aux ECA est effacée, et l'attribution repasse « En cours », tout comme sa demande ;
- l'audio déjà déposé est conservé : inutile de le supprimer, le reste s'ajoutera à côté dans l'éditeur audio. Tant que l'attribution est « En cours », l'[éditeur audio](/admin/aide/catalogue#editeur-audio) du livre avertit que l'audio peut être incomplet et nomme la personne qui l'a rouverte, pour que personne ne l'envoie à l'auditeur par erreur ;
- le livre repasse « En attente » dans le [catalogue](/admin/aide/catalogue) : il ne redevient « Disponible » qu'une fois un nouvel enregistrement déposé et confirmé ;
- vous pouvez indiquer la raison de la réouverture ; elle est ajoutée aux notes de l'attribution, avec la date du jour.

Si la demande figure déjà sur une [facture](/admin/aide/factures) en brouillon, elle en est retirée automatiquement, et y reviendra lorsqu'elle sera de nouveau terminée. Si la facture a déjà été émise, la réouverture est refusée : rouvrez d'abord la facture et retirez-en la demande.

Une attribution déjà terminée reste modifiable (notes, méthode de livraison…) même si son audio a été retiré depuis ; seul le passage à « Terminé » exige un enregistrement.

Le reste de la fenêtre contextuelle fonctionne de la même manière que celle permettant d'ajouter une attribution. Pour corriger le livre, modifiez-le sur la [demande](/admin/aide/demandes) : l'attribution suit automatiquement.

En bas de la fenêtre, vous trouverez (1) le bouton « Mettre à jour l'attribution », qui enregistrera vos modifications, et (2) le bouton « Supprimer l'attribution », qui supprimera l'attribution.

![Attributions - capture 16](/admin/aide/images/attributions-16.jpg)
