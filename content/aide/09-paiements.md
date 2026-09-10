---
title: Paiements
slug: paiements
order: 9
---

# Paiements

La page « Paiements » permet de créer toutes les transactions financières et de les affecter à des personnes et à des factures.

Cette page fonctionne de la même manière que toutes les autres pages. Elle comporte (1) un tableau répertoriant les paiements existants, (2) un bouton permettant de créer de nouveaux paiements, (3) une barre de recherche pour rechercher des paiements existants, (4) ainsi que des filtres à appliquer à la recherche et au tableau.

L'URL de cette page est https://eca-aveugles.fr/admin/payments

![Paiements - capture 1](/admin/aide/images/paiements-01.jpg)

## Ajout des paiements

Lorsque vous cliquez sur le bouton « Ajouter un paiement », le model « Ajouter un paiement » s'ouvre. La première chose que vous devez choisir et préciser est le « Type de paiement », car cela déterminera les champs qui s'afficheront ou ne s'afficheront pas.

![Paiements - capture 2](/admin/aide/images/paiements-02.jpg)

Les types de paiement sont les suivants : cotisation, enregistrement, don et divers.

Pour la cotisation, vous devez indiquer (1) l'auditeur concerné, (2) le montant qu'il a versé et (3) l'année de la cotisation.

![Paiements - capture 3](/admin/aide/images/paiements-03.jpg)

Pour l'enregistrement, vous devez d'abord sélectionner l'auditeur ; la liste des factures associées s'affichera alors.

![Paiements - capture 4](/admin/aide/images/paiements-04.jpg)

Le champ « Factures associées » est automatiquement renseigné avec les 10 dernières factures de l'auditeur une fois que vous les aurez sélectionnées.

Pour l'ouvrir, (1) cliquez sur « Sélectionner une facture », puis (2) cliquez sur la ligne correspondant à la facture que vous souhaitez ajouter dans la liste déroulante.

![Paiements - capture 5](/admin/aide/images/paiements-05.jpg)

Une fois sélectionnée, la facture est associée au paiement en cours.

![Paiements - capture 6](/admin/aide/images/paiements-06.jpg)

Les types « Don » et « Divers » se ressemblent, mais ils ne suivent pas la même règle. Un **don exige un donateur** : sans lui, ni reçu fiscal ni relance ne sont possibles, et le formulaire refuse l'enregistrement. Seul **« Divers » peut rester anonyme** — c'est le fourre-tout des encaissements qui ne désignent personne.

Le champ change d'ailleurs de nom selon le type choisi : « Auditeur » pour une cotisation ou un enregistrement, « Donateur » pour un don, « Personne » pour un divers.

![Paiements - capture 7](/admin/aide/images/paiements-07.jpg)

Quel que soit le type, vous pouvez préciser le mode de règlement dans le champ « Méthode de paiement » : chèque, espèce, carte bancaire, virement ou compte Auxi.

Au bas de la page, vous pouvez, si vous le souhaitez, saisir des informations comptables. Pour ce faire, il suffit de cliquer sur la rubrique « Détails comptables ».

![Paiements - capture 8](/admin/aide/images/paiements-08.jpg)

À long terme, cela peut faciliter la clôture comptable de fin d'année grâce à la quantité accrue de données pouvant être filtrées. Sinon, il n'est pas nécessaire de les saisir.

Une fois que vous avez saisi toutes les informations nécessaires, cliquez sur le bouton « Créer le paiement » : celui-ci sera alors enregistré et importé dans la base de données.

![Paiements - capture 9](/admin/aide/images/paiements-09.jpg)

## Modification des paiements

Pour modifier un paiement, cliquez sur la ligne que vous souhaitez modifier

![Paiements - capture 10](/admin/aide/images/paiements-10.jpg)

Cela ouvrira le modal « Modifier le paiement ».

![Paiements - capture 11](/admin/aide/images/paiements-11.jpg)

Ce fonctionnement est identique à celui de la fenêtre contextuelle « Ajouter un paiement », à la différence que vous pouvez également (1) supprimer le paiement en bas de la page en cliquant sur le bouton « Supprimer le paiement ». (2) Pour enregistrer les modifications, cliquez sur le bouton « Enregistrer les modifications » ; cela met à jour l'entrée de la base de données avec les nouvelles informations que vous avez saisies dans les champs.

![Paiements - capture 12](/admin/aide/images/paiements-12.jpg)
