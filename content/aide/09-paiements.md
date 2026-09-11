---
title: Paiements
slug: paiements
order: 9
---

# Paiements

La page « Paiements » permet de créer toutes les transactions financières et de les affecter à des personnes et à des factures.

Cette page fonctionne de la même manière que toutes les autres pages. Elle comporte (1) un tableau répertoriant les paiements existants, (2) un bouton permettant de créer de nouveaux paiements, (3) une barre de recherche pour rechercher des paiements existants, (4) ainsi que des filtres à appliquer à la recherche et au tableau.

L'URL de cette page est https://eca-aveugles.fr/admin/payments

## Retrouver un paiement

La **recherche** ne se limite pas au nom de la personne. Elle accepte aussi le **numéro du paiement**, le **numéro de la facture** à laquelle il est rattaché, et la **référence de règlement** — un numéro de chèque, par exemple. C'est en général le chemin le plus court : on a rarement le nom sous les yeux, souvent le chèque.

Le bouton « **Filtres** », à droite de la barre de recherche, déplie le panneau des filtres. La pastille bleue qu'il porte compte ceux qui sont posés ; le panneau lui-même reste replié tant qu'on ne le demande pas, pour laisser le tableau commencer haut dans la page.

Le panneau filtre **par type** et **par méthode de paiement**, puis sur une **période**, qui demande d'abord *sur quelle date* elle porte : la **date de création** de l'écriture, ou la **date de paiement**. Les deux diffèrent souvent — un chèque de décembre saisi en janvier — et la distinction compte au moment de rapprocher les comptes. Les champs « Du » et « Au » bornent alors la période. Deux cases terminent le panneau, sous « Rapprochement » : « **Sans facture liée** » ne garde que les paiements qu'aucune facture ne réclame, « **Non affectés** » ceux qui n'ont jamais été affectés.

Chaque filtre posé s'affiche alors sous la barre de recherche, sous forme d'étiquette. C'est là qu'on lit pourquoi la liste est plus courte qu'attendu, sans rouvrir le panneau : la croix d'une étiquette retire ce filtre-là, et « **Tout réinitialiser** » les enlève tous, recherche et tri compris.

Enfin, les colonnes **ID**, **Date de création**, **Date de paiement** et **Montant** se trient : cliquez sur l'en-tête pour changer le sens.

Le bouton « **Exporter (CSV)** » enregistre **la sélection telle qu'elle est affichée** — mêmes filtres, même tri, même contenu. Ce n'est pas un export de toute la base : ce que vous voyez est ce que vous obtenez, ce qui rend l'export utilisable tel quel pour une clôture.

(1) L'export CSV de la sélection affichée — (2) le bouton qui déplie les filtres — (3) la période et la date sur laquelle elle porte

![Paiements - capture 1](/admin/aide/images/paiements-01.jpg)

## Ajout des paiements

Lorsque vous cliquez sur le bouton « Ajouter un paiement », le formulaire « Ajouter un paiement » s'ouvre. La première chose que vous devez choisir et préciser est le « Type de paiement », car cela déterminera les champs qui s'afficheront ou ne s'afficheront pas.

Les types de paiement sont les suivants : **cotisation**, **enregistrement**, **don** et **divers**.

![Paiements - capture 2](/admin/aide/images/paiements-02.jpg)

Pour la cotisation, vous devez indiquer (1) le type, (2) l'auditeur concerné, (3) le montant qu'il a versé et (4) l'année de la cotisation — un champ que ce type est seul à porter. (5) « Créer le paiement » enregistre l'écriture.

![Paiements - capture 3](/admin/aide/images/paiements-03.jpg)

Pour l'enregistrement, vous devez d'abord sélectionner l'auditeur ; le champ « Facture liée » s'affichera alors.

![Paiements - capture 4](/admin/aide/images/paiements-04.jpg)

Ce champ montre par défaut les 10 dernières factures de l'auditeur, les plus récentes en premier. **Les brouillons n'y figurent pas** : une facture qui n'a pas encore été envoyée n'a rien à encaisser, et un paiement ne se rattache qu'à une facture émise. La date de paiement, elle, ne peut pas précéder la date d'émission de la facture.

Pour l'ouvrir, cliquez sur le champ « Rechercher une facture », tapez tout ou partie du numéro de facture, du livre, de l'auteur ou de la référence de paiement pour filtrer la liste, puis cliquez sur la ligne correspondant à la facture voulue.

![Paiements - capture 5](/admin/aide/images/paiements-05.jpg)

Une fois sélectionnée, la facture est associée au paiement en cours.

![Paiements - capture 6](/admin/aide/images/paiements-06.jpg)

Les types « Don » et « Divers » se ressemblent, mais ils ne suivent pas la même règle. Un **don exige un donateur** : sans lui, ni reçu fiscal ni relance ne sont possibles, et le formulaire refuse l'enregistrement. Seul **« Divers » peut rester anonyme** — c'est le fourre-tout des encaissements qui ne désignent personne.

Le champ change d'ailleurs de nom selon le type choisi : « Auditeur » pour une cotisation ou un enregistrement, « Donateur » pour un don, « Personne » pour un divers.

![Paiements - capture 7](/admin/aide/images/paiements-07.jpg)

Quel que soit le type, vous pouvez préciser le mode de règlement dans le champ « Méthode de paiement » : chèque, espèce, carte bancaire, virement ou compte Auxi.

Au bas de la page, vous pouvez, si vous le souhaitez, saisir des informations comptables. Pour ce faire, il suffit de cliquer sur la rubrique « Détails comptables ».

À long terme, cela peut faciliter la clôture comptable de fin d'année grâce à la quantité accrue de données pouvant être filtrées. Sinon, il n'est pas nécessaire de les saisir.

![Paiements - capture 8](/admin/aide/images/paiements-08.jpg)

Une fois que vous avez saisi toutes les informations nécessaires, cliquez sur le bouton « Créer le paiement » : celui-ci sera alors enregistré et importé dans la base de données.

## Le paiement d'une facture est un paiement comme un autre

Un règlement de facture n'est pas rangé à part : c'est **une écriture de cette page**, de type « Enregistrement », rattachée à une facture. C'est ce qui explique deux choses.

D'abord, une facture saisie « déjà réglée » (voir [Factures](/admin/aide/factures)) ne crée pas une mention dans un coin : elle crée un paiement, qui apparaît ici et se corrige ici.

Ensuite, **la référence, la méthode et la date du règlement se saisissent sur le paiement**, jamais sur la facture. La facture les affiche, mais elle ne fait que les refléter. Le crayon qui permettait autrefois de les corriger depuis la facture a été retiré pour cette raison : il réécrivait une valeur dérivée, et faisait diverger la facture du règlement qu'elle décrivait.

Un paiement ouvert depuis une facture affiche la facture à laquelle il se rattache.

![Paiements - capture 9](/admin/aide/images/paiements-09.jpg)

## Modification des paiements

Pour modifier un paiement, cliquez sur la ligne que vous souhaitez modifier. Cela ouvrira le modal « Modifier le paiement ».

Ce fonctionnement est identique à celui de la fenêtre « Ajouter un paiement », à la différence que vous pouvez également (1) supprimer le paiement en bas de la page en cliquant sur le bouton « Supprimer le paiement ». (2) Pour enregistrer les modifications, cliquez sur le bouton « Enregistrer les modifications » ; cela met à jour l'entrée de la base de données avec les nouvelles informations que vous avez saisies dans les champs.

![Paiements - capture 10](/admin/aide/images/paiements-10.jpg)

L'enregistrement **ne réécrit que ce que vous avez modifié**. Corriger une observation sur une cotisation ancienne, saisie sans année, la laisse sans année — elle ne devient pas une cotisation de l'année en cours. De même, les cases « Fiscalité » et « Affectée » gardent leur valeur d'origine, et la date d'attribution avec, tant que vous ne les changez pas.

La suppression demande confirmation. Si le paiement était rattaché à une facture, retirer le règlement change ce que cette facture réclame — la confirmation le dit avant d'agir.

![Paiements - capture 11](/admin/aide/images/paiements-11.jpg)
