---
title: Factures
slug: factures
order: 8
---

# Factures

La page « Factures » vous permet de consulter les factures que les utilisateurs doivent régler pour leurs demandes. Lorsqu'une demande est finalisée, elle est automatiquement ajoutée à une facture brouillon existante de l'utilisateur ou une nouvelle facture brouillon est créée. Chaque utilisateur dispose d'un seuil de facturation (**21 € par défaut**, modifiable sur sa fiche) ; dès que ce montant est atteint, la facture passe automatiquement du statut « brouillon » à « émise ».

Lorsque vous ouvrez la fenêtre contextuelle « Facture », vous pouvez générer des fichiers PDF des factures à envoyer aux auditeurs pour leur demander le paiement.

Une facture porte l'un de ces quatre états :

- **Brouillon** — la facture se remplit encore avec les demandes terminées.
- **Émise** — la facture a été envoyée à l'auditeur. Son contenu ne peut plus changer.
- **Payée** — un paiement couvre la facture. Elle passe « Payée » toute seule dès que le paiement est enregistré.
- **Soldée** — on ne réclame plus rien, sans qu'un paiement ait été reçu.

Sur la page principale des factures, on trouve (1) un tableau présentant les factures existantes, (2) la barre de recherche et (3) quelques filtres que l'on peut appliquer à la recherche et au tableau. Vous pouvez filtrer les résultats par état et/ou par factures en retard. Une facture en retard est une facture « Émise » depuis **plus de 30 jours** et pas encore réglée.

L'URL de cette page est https://eca-aveugles.fr/admin/bills

![Factures - capture 1](/admin/aide/images/factures-01.jpg)

## Ajout des factures

En règle générale, les factures sont générées automatiquement à partir des demandes ; leur gestion manuelle est donc assez simple. Cela dit, si vous devez créer une facture pour une raison quelconque et que celle dont vous avez besoin n'existe pas encore, cliquez sur le bouton « Ajouter une facture ».

Cela ouvrira le formulaire « Créer une facture ».

![Factures - capture 2](/admin/aide/images/factures-02.jpg)

Pour associer un auditeur et ses demandes disponibles, cliquez sur le champ « Rechercher un auditeur ... », saisissez un nom ou une adresse électronique, puis cliquez sur la ligne de votre choix.

![Factures - capture 3](/admin/aide/images/factures-03.jpg)

Cela affichera alors les demandes facturables de l'auditeur. Cochez les cases correspondant aux demandes que vous souhaitez joindre à cette facture. Un message en ambre signale une demande qui n'est pas encore terminée ou qui n'a pas de tarif.

![Factures - capture 4](/admin/aide/images/factures-04.jpg)

Compte tenu de la génération automatique des factures et de leur lien automatique avec les demandes, vous devez faire très attention lorsque vous effectuez cette opération afin de ne pas associer des demandes qui ont déjà été facturées automatiquement.

Enfin, pour la nouvelle facture, vous pouvez :

(1) Choisir l'auditeur concerné

(2) Sélectionner l'état de la facture

(3) Indiquer une date de création

(4) Indiquer la date d'émission

(5) Enregistrer la facture et la verser dans la base de données.

![Factures - capture 6](/admin/aide/images/factures-06.jpg)

Le montant total se calcule tout seul à partir des demandes cochées.

### Saisir une facture déjà réglée

Si le règlement est déjà arrivé, cochez la case « **Facture déjà réglée** », puis renseignez la méthode et la date de paiement. La facture et son paiement sont créés en même temps ; le paiement apparaît ensuite dans la page [Paiements](/admin/aide/paiements).

![Factures - capture 7](/admin/aide/images/factures-07.jpg)

## Modification et impression des factures

Pour modifier une facture ou télécharger la version PDF à envoyer au client, cliquez sur la ligne correspondante. Cela ouvre le modal de modification de la facture.

### Un brouillon

Sur un brouillon, les fonctions de base sont les suivantes :

(1) La section « **Changer le statut** » permet d'émettre la facture

(2) « **Ajouter une demande** » ajoute une demande à la facture. Encore une fois, je ne le ferais pas, sauf dans des circonstances exceptionnelles, car les demandes sont automatiquement ajoutées aux factures dès qu'elles atteignent le statut « terminé ».

(3) « **Supprimer la facture** » supprime définitivement la facture

![Factures - capture 9](/admin/aide/images/factures-09.jpg)

### Une facture émise

Une fois la facture émise, vous pouvez :

(1) « **Imprimer la facture** », en haut, pour générer le PDF à envoyer à l'auditeur

(2) « **Remettre en brouillon** » pour la corriger

(3) « **Marquer comme payée** »

(4) « **Solder la facture** » si l'on ne réclame plus rien

![Factures - capture 10](/admin/aide/images/factures-10.jpg)

Le bloc « **Paiements** » indique ce qui a déjà été encaissé et ce qui reste à payer. Cliquez sur un paiement pour l'ouvrir. Pour enregistrer un nouveau paiement, cliquez sur « **Enregistrer un paiement** » (voir [Paiements](/admin/aide/paiements)).

Pour corriger la référence, la méthode ou la date d'un règlement, ouvrez le paiement : elles se modifient là, et non sur la facture.

### Une facture finalisée

Une facture « Payée » ou « Soldée » ne peut plus être modifiée. Pour la corriger, cliquez sur (1) « **Rouvrir la facture** » : elle repasse à « émise ».

![Factures - capture 11](/admin/aide/images/factures-11.jpg)

### L'historique

Vous pouvez consulter l'historique des modifications apportées à la facture en cliquant sur la section « **Historique de la facture** ».

![Factures - capture 12](/admin/aide/images/factures-12.jpg)

### Supprimer une facture

Seul un brouillon peut être supprimé. « Supprimer la facture » vous demande une confirmation.

![Factures - capture 13](/admin/aide/images/factures-13.jpg)

## L'avis d'impression

Lorsqu'une facture doit être imprimée — par exemple quand le seuil de facturation vient de l'émettre —, une fenêtre s'ouvre avec le bouton d'impression. Imprimez-la et envoyez-la à l'auditeur.
