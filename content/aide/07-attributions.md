---
title: Attributions
slug: attributions
order: 7
---

# Attributions

Les attributions sont au cœur de la gestion des informations relatives à qui lit quoi et quand. Elles sont toujours liées à des demandes et déterminent certains statuts de ces dernières.

Elles possèdent également leur propre statut, qui va de « en cours » à « terminée ». Elles ont pour but de dissocier la notion de « qui a demandé quoi et quand » de la logistique liée à « qui lit quoi et quand ». Une demande de type « Enregistrement » DOIT être créée AVANT la création d’une nouvelle attribution, et cette nouvelle attribution sera nécessairement liée à cette demande dès le départ.

L'URL de cette page est https://eca-aveugles.fr/admin/assignments.

La page d'accueil comporte (1) un tableau répertoriant les attributions existantes, (2) un champ de recherche permettant d'affiner la recherche, et (3) un filtre par statut.

![Attributions - capture 1](/admin/aide/images/attributions-01.jpg)

## Ajout des attributions

Pour ajouter une attribution, cliquez sur le bouton « Ajouter une attribution »

![Attributions - capture 2](/admin/aide/images/attributions-02.jpg)

Cela ouvrira le modal « Créer une attribution ».

![Attributions - capture 3](/admin/aide/images/attributions-03.jpg)

À partir de là, vous devez sélectionner le lecteur en cliquant sur le champ « Sélectionner un lecteur ». Cela ouvrira la barre de recherche des lecteurs, dans laquelle vous trouverez votre lecteur.

![Attributions - capture 4](/admin/aide/images/attributions-04.jpg)

- Recherchez votre lecteur et (2) cliquez sur la ligne que vous souhaitez ajouter

![Attributions - capture 5](/admin/aide/images/attributions-05.jpg)

Cela permettra d'associer le lecteur à l’attribution.

![Attributions - capture 6](/admin/aide/images/attributions-06.jpg)

Passons maintenant à l'ajout d'une demande. Nous suivons la même procédure et (1) cliquons sur le champ « Sélectionner une demande ». Cela nous permettra d'afficher les (2) 10 demandes les plus récentes qui ont été enregistrées, dont le statut est « en attente » et qui nécessitent une attribution automatique.

![Attributions - capture 7](/admin/aide/images/attributions-07.jpg)

Nous pouvons aussi (1) en rechercher une autre si nous le souhaitons. (2) Cliquez sur la ligne correspondant à la demande que vous souhaitez associer à cette attribution.

![Attributions - capture 8](/admin/aide/images/attributions-08.jpg)

Une fois que vous aurez cliqué dessus, la demande et le livre associé à celle-ci seront ajoutés à notre formulaire d'attribution.

![Attributions - capture 9](/admin/aide/images/attributions-09.jpg)

En faisant défiler la page vers le bas, on peut voir d’autres champs, notamment la date de réception de l’attribution, la date d’envoi au lecteur et la date de retour à l’ECA. Le statut n’est pas directement modifiable afin de préserver la cohérence de nos données. Il est déterminé en fonction des dates renseignées.

Ainsi, si seule la (1) « Date de réception » est renseignée, le statut est « en attente d'envoi au lecteur ». Si (2) la « Date d'envoi au lecteur » est renseignée, le statut est « en cours », et lorsque (3) la « Date de retour aux ECA » est renseignée, le statut est « Terminé ». Pour modifier une date, il suffit de cliquer sur le champ correspondant.

Ces trois dates se remplissent **dans cet ordre**. Chacune affirme que le livre est physiquement passé par l'étape précédente, si bien qu'une date de retour sans date d'envoi est refusée.

**Une attribution ne peut pas passer « Terminé » tant qu'aucun enregistrement n'a été déposé pour le livre.** Le système répond alors : « Impossible de terminer l'attribution : aucun enregistrement n'a été déposé pour ce livre. » Déposez l'audio dans le dossier du livre — l'éditeur audio du [Catalogue](/admin/aide/catalogue) — puis repassez l'attribution « Terminé ».

Ce contrôle existe parce que le coût de la demande se calcule sur le poids de l'enregistrement : terminer une attribution sans audio figerait un tarif plancher sur une facture que l'on ne pourrait plus corriger. L'inverse n'est volontairement pas vrai — déposer l'audio ne termine jamais une attribution tout seul, car le retour du lecteur est un fait qu'un permanent constate.

![Attributions - capture 10](/admin/aide/images/attributions-10.jpg)

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

Le reste de la fenêtre contextuelle fonctionne de la même manière que celle permettant d'ajouter une attribution.

En bas de la fenêtre, vous trouverez (1) le bouton « Mettre à jour l'attribution », qui enregistrera vos modifications, et (2) le bouton « Supprimer l'attribution ». Là aussi il s'agit d'une **suppression logique** : l'attribution quitte les listes, son historique est conservé.

![Attributions - capture 16](/admin/aide/images/attributions-16.jpg)
