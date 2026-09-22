---
title: Composants de base
slug: composants-de-base
order: 1
---

# Composants de base

## Un modal

Un modal est un formulaire contextuel que j'utilise pour faciliter l'ajout, la suppression et la modification d'informations. Elle s'affiche au-dessus du contenu actuellement affiché. Pour la fermer, vous pouvez soit cliquer sur le bouton « Annuler », soit cliquer en dehors de du modal.

## Une tableau

Une tableau affiche les résultats de la recherche et présente des lignes cliquables qui vous permettent de modifier le contenu de votre recherche ou d'ajouter de nouvelles lignes à la base de données.

## Quand une recherche ne trouve rien

Dans toutes les listes (demandes, attributions, factures, paiements, membres, catalogue, genres, dernières infos, listes de livres, doublons, corbeille et audio orphelin), une recherche sans résultat affiche un encadré « Essayez plutôt ». Il montre directement ce que vous cherchiez probablement, pas seulement d'autres mots :

- **Un filtre le cache.** « Le filtre « Statut : À faire » cache cette demande », avec la demande et ce qui l'écarte du filtre. Le bouton « Retirer ce filtre » relance la recherche sans lui. Rien n'est retiré sans votre clic.
- **Il est dans un autre onglet.** Par exemple, une personne cherchée parmi les auditeurs alors qu'elle est lectrice : « Trouvé dans « Lecteurs » ».
- **Un mot est mal orthographié ou en trop.** « Vouliez-vous dire … ? » ou « Chercher sans … », avec les résultats correspondants.

Cliquez sur une ligne de l'encadré pour ouvrir directement sa fiche, ou sur le bouton du bas pour lancer la recherche proposée.

Dans les champs de recherche des formulaires (choisir un auditeur, un livre, un lecteur…), la suggestion affiche aussi les personnes ou les livres trouvés. Un clic les sélectionne comme dans la liste habituelle.

## Un formulaire

Un formulaire est l'élément de base de la plupart des interactions sur le Web. Il comporte des champs contenant des informations et, une fois validé, modifie, crée ou supprime les entrées correspondantes dans la base de données. La plupart de nos formulaires sont intégrés dans des fenêtres modales pour faciliter la tâche des permanents.

## Un champ

Un champ est une partie d'un formulaire dans laquelle il est possible de saisir des informations afin de modifier le contenu de la base de données lors de l'enregistrement du formulaire. Les informations modifiées dans les champs seront mises à jour lors de l'enregistrement et de l'envoi du formulaire.

## Les messages d'erreur

Quand une action échoue, un message rouge s'affiche. Il en existe trois sortes :

- **« Erreur » ou « … impossible »** : le portail a refusé l'action pour une raison qu'il explique, par exemple un livre encore lié à des demandes. Le message dit quoi faire ; rien n'a été modifié, sauf s'il indique le contraire.
- **« Connexion interrompue »** : la demande n'est pas parvenue au serveur, ou sa réponse ne vous est pas parvenue. L'action a donc pu être faite quand même : rechargez la page pour vérifier avant de recommencer.
- **« Erreur inattendue »** : personne ne sait encore pourquoi l'action a échoué. Le message dit ce qui a pu être fait ou non, et reste affiché jusqu'à ce que vous le fermiez. Cliquez sur l'adresse e-mail qu'il contient : le courriel se prépare avec la **référence** (« ERR-… »), la page et l'heure. Ajoutez ce que vous faisiez et envoyez-le. La référence permet de retrouver l'erreur exacte.
