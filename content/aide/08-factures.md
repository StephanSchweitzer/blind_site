---
title: Factures
slug: factures
order: 8
---

# Factures

La page « Factures » vous permet de consulter les factures que les utilisateurs doivent régler pour leurs demandes. Lorsqu'une demande est finalisée, elle est automatiquement ajoutée à une facture brouillon existante de l'utilisateur ou une nouvelle facture brouillon est créée. Chaque utilisateur dispose d'un seuil de facturation (21 par défaut) ; dès que ce seuil est dépassé, la facture passe automatiquement du statut « brouillon » à « émise ».

Lorsque vous ouvrez la fenêtre contextuelle « Facture », vous pouvez générer des fichiers PDF des factures à envoyer aux auditeurs pour leur demander le paiement.

Une facture porte l'un de ces **quatre états** :

- **Brouillon** — la facture s'accumule encore. Les demandes terminées viennent s'y rattacher toutes seules, et peuvent encore en être retirées.
- **Émise** — la facture a été imprimée et envoyée à l'auditeur. Son contenu est désormais verrouillé.
- **Payée** — au moins un règlement lui est rattaché. Une facture ne peut pas être « Payée » sans paiement enregistré.
- **Soldée** — la créance est abandonnée : le compte est clos et on ne réclame plus rien. C'est justement pour cela qu'une facture soldée ne porte aucun paiement — il ne faut pas inventer un encaissement pour clore une petite créance.

Il n'existe pas d'état « terminée ».

Sur la page principale des factures, on trouve (1) un tableau présentant les factures existantes, (2) la barre de recherche et (3) quelques filtres que l'on peut appliquer à la recherche et au tableau. Vous pouvez filtrer les résultats par état et/ou par factures en retard. Une facture en retard est une facture encore à l'état « Émise » dont la date d'émission remonte à **plus de 30 jours**. Dès qu'elle passe « Payée » ou « Soldée », elle cesse d'être comptée en retard.

L'URL de cette page est https://eca-aveugles.fr/admin/bills

![Factures - capture 1](/admin/aide/images/factures-01.jpg)

## Ajout des factures

En règle générale, les factures sont générées automatiquement à partir des demandes ; leur gestion manuelle est donc assez simple. Cela dit, si vous devez créer une facture pour une raison quelconque et que celle dont vous avez besoin n'existe pas encore, cliquez sur le bouton « Ajouter une facture ».

![Factures - capture 2](/admin/aide/images/factures-02.jpg)

Cela ouvrira le modele « Créer une facture ».

![Factures - capture 3](/admin/aide/images/factures-03.png)

Pour associer un auditeur et ses demandes disponibles (si vous le souhaitez), (1) cliquez sur le champ « Rechercher un auditeur... » pour rechercher et associer un auditeur, puis (2) cliquez sur la ligne de votre choix.

![Factures - capture 4](/admin/aide/images/factures-04.jpg)

Cela affichera alors toutes les demandes de l'auditeur ; vous pourrez alors choisir celles que vous souhaitez joindre à la facture. Cochez les cases correspondant aux demandes que vous souhaitez joindre à cette facture.

![Factures - capture 5](/admin/aide/images/factures-05.jpg)

Compte tenu de la génération automatique des factures et de leur lien automatique avec les demandes, vous devez faire très attention lorsque vous effectuez cette opération afin de ne pas associer des demandes qui ont déjà été facturées automatiquement.

Enfin, pour la nouvelle demande de facture, vous pouvez :

(1) Sélectionnez l'état de la facture. À la création, seuls « Brouillon », « Émise » et « Payée » sont proposés : « Soldée » s'applique plus tard, depuis la facture elle-même.

(2) Indiquez une date de création

(3) Si vous choisissez « Payée », la date d'émission devient obligatoire — une facture réglée a forcément été envoyée — et vous pourrez saisir le règlement (référence, date, méthode) juste en dessous

(4) Enregistrez la facture et téléchargez-la dans la base de données.

![Factures - capture 6](/admin/aide/images/factures-06.jpg)

## Modification et imprimant des factures

Pour modifier une facture ou télécharger la version PDF à envoyer au client, cliquez sur la ligne correspondante.

![Factures - capture 7](/admin/aide/images/factures-07.jpg)

Cela ouvrira le modal de modification de la facture.

![Factures - capture 8](/admin/aide/images/factures-08.jpg)

Les fonctions de base permettant de modifier la demande sont les suivantes :

(1) Vous pouvez modifier le statut de la facture en cliquant sur le bouton situé dans la section « CHANGER LE STATUT »

(2) Vous pouvez ajouter d'autres demandes en cliquant sur le bouton « Ajouter une demande » situé au milieu. Encore une fois, je ne le ferais pas, sauf dans des circonstances exceptionnelles, car les demandes sont automatiquement ajoutées aux factures dès qu'elles atteignent le statut « terminé ».

(3) Vous pouvez cliquer sur le bouton « Supprimer la facture » pour supprimer définitivement la facture

(4) Vous pouvez ajouter une référence de paiement en cliquant sur l'icône en forme de crayon située sous la section « RÉF. PAIEMENT »

![Factures - capture 9](/admin/aide/images/factures-09.jpg)

Les fonctions de base permettant de consulter les détails de la demande et de générer le fichier PDF à envoyer par e-mail à l'auditeur sont les suivantes :

(1) Vous pouvez générer le fichier PDF en cliquant sur le bouton « Exporter en PDF » situé en haut de la page

(2) Vous pouvez consulter l'historique des modifications apportées à la facture en cliquant sur la section « Historique de la facture »

![Factures - capture 10](/admin/aide/images/factures-10.jpg)
