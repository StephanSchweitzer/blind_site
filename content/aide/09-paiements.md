---
title: Paiements
slug: paiements
order: 9
---

# Paiements

La page « Paiements » permet de créer toutes les transactions financières et de les affecter à des personnes et à des factures.

Cette page fonctionne de la même manière que toutes les autres pages. Elle comporte (1) un tableau répertoriant les paiements existants, (2) un bouton permettant de créer de nouveaux paiements, (3) une barre de recherche pour rechercher des paiements existants, (4) ainsi que des filtres à appliquer à la recherche et au tableau.

L'URL de cette page est https://eca-aveugles.fr/admin/payments

![Paiements - capture 0](/admin/aide/images/paiements-00.jpg)

## Retrouver un paiement

Vous pouvez rechercher un paiement par le nom de la personne, le numéro du paiement, le numéro de la facture ou la référence de règlement (un numéro de chèque, par exemple).

(1) « **Exporter (CSV)** » enregistre la liste telle qu'elle est affichée. (2) Le bouton « **Filtres** » ouvre les filtres : type, méthode de paiement et (3) période.

![Paiements - capture 1](/admin/aide/images/paiements-01.jpg)

## Ajout des paiements

Lorsque vous cliquez sur le bouton « Ajouter un paiement », le formulaire « Ajouter un paiement » s'ouvre. La première chose que vous devez choisir et préciser est le « Type de paiement », car cela déterminera les champs qui s'afficheront ou ne s'afficheront pas.

Les types de paiement sont les suivants : **cotisation**, **enregistrement**, **don** et **divers**.

![Paiements - capture 2](/admin/aide/images/paiements-02.jpg)

Pour la cotisation, vous devez indiquer (1) le type, (2) l'auditeur concerné, (3) le montant qu'il a versé et (4) l'année de la cotisation. (5) « Créer le paiement » enregistre le paiement.

![Paiements - capture 3](/admin/aide/images/paiements-03.jpg)

Pour l'enregistrement, vous devez d'abord sélectionner l'auditeur ; le champ « Facture liée » s'affichera alors.

![Paiements - capture 4](/admin/aide/images/paiements-04.jpg)

Ce champ montre les 10 dernières factures émises de l'auditeur. Pour l'ouvrir, cliquez sur le champ « Rechercher une facture », puis cliquez sur la ligne correspondant à la facture voulue.

![Paiements - capture 5](/admin/aide/images/paiements-05.jpg)

Une fois sélectionnée, la facture est associée au paiement en cours. Si le paiement couvre le total, la facture passe « Payée » toute seule.

![Paiements - capture 6](/admin/aide/images/paiements-06.jpg)

Les types « Don » et « Divers » ne nécessitent qu'un montant. Un don doit toutefois être associé à un donateur ; un paiement « Divers » peut rester anonyme.

![Paiements - capture 7](/admin/aide/images/paiements-07.jpg)

Quel que soit le type, vous pouvez préciser le mode de règlement dans le champ « Méthode de paiement » : chèque, espèce, carte bancaire, virement ou compte Auxi.

Au bas de la page, vous pouvez, si vous le souhaitez, saisir des informations comptables. Pour ce faire, il suffit de cliquer sur la rubrique « Détails comptables ».

À long terme, cela peut faciliter la clôture comptable de fin d'année grâce à la quantité accrue de données pouvant être filtrées. Sinon, il n'est pas nécessaire de les saisir.

![Paiements - capture 8](/admin/aide/images/paiements-08.jpg)

Une fois que vous avez saisi toutes les informations nécessaires, cliquez sur le bouton « Créer le paiement » : celui-ci sera alors enregistré et importé dans la base de données.

Un paiement lié à une facture affiche la facture correspondante.

![Paiements - capture 9](/admin/aide/images/paiements-09.jpg)

## Modification des paiements

Pour modifier un paiement, cliquez sur la ligne que vous souhaitez modifier. Cela ouvrira le modal « Modifier le paiement ».

Ce fonctionnement est identique à celui de la fenêtre « Ajouter un paiement », à la différence que vous pouvez également (1) supprimer le paiement en bas de la page en cliquant sur le bouton « Supprimer le paiement ». (2) Pour enregistrer les modifications, cliquez sur le bouton « Enregistrer les modifications » ; cela met à jour l'entrée de la base de données avec les nouvelles informations que vous avez saisies dans les champs.

![Paiements - capture 10](/admin/aide/images/paiements-10.jpg)

C'est ici, et non sur la facture, que l'on corrige la référence, la méthode ou la date d'un règlement.

La suppression vous demande une confirmation.

![Paiements - capture 11](/admin/aide/images/paiements-11.jpg)
