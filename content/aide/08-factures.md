---
title: Factures
slug: factures
order: 8
---

# Factures

La page « Factures » vous permet de consulter les factures que les utilisateurs doivent régler pour leurs demandes. Lorsqu'une demande est finalisée, elle est automatiquement ajoutée à une facture brouillon existante de l'utilisateur ou une nouvelle facture brouillon est créée. Chaque utilisateur dispose d'un seuil de facturation (**21 € par défaut**) ; dès que ce seuil est atteint, la facture passe automatiquement du statut « brouillon » à « émise ».

Le seuil se compte en **euros, et non en nombre de demandes** : c'est le *montant* du brouillon qui déclenche l'émission. Il se règle par personne, sur sa fiche.

Lorsque vous ouvrez la fenêtre contextuelle « Facture », vous pouvez générer des fichiers PDF des factures à envoyer aux auditeurs pour leur demander le paiement.

Une facture porte l'un de ces **quatre états** :

- **Brouillon** — la facture s'accumule encore. Les demandes terminées viennent s'y rattacher toutes seules, et peuvent encore en être retirées.
- **Émise** — la facture a été imprimée et envoyée à l'auditeur. Son contenu est désormais verrouillé.
- **Payée** — au moins un règlement lui est rattaché. Une facture ne peut pas être « Payée » sans paiement enregistré.
- **Soldée** — la créance est abandonnée : le compte est clos et on ne réclame plus rien. C'est justement pour cela qu'une facture soldée ne porte aucun paiement — il ne faut pas inventer un encaissement pour clore une petite créance.

Il n'existe pas d'état « terminée ».

Sur la page principale des factures, on trouve (1) un tableau présentant les factures existantes, (2) la barre de recherche et (3) quelques filtres que l'on peut appliquer à la recherche et au tableau. Vous pouvez filtrer les résultats par état et/ou par factures en retard. Une facture en retard est une facture encore à l'état « Émise » dont la date d'émission remonte à **plus de 30 jours**. Dès qu'elle passe « Payée » ou « Soldée », elle cesse d'être comptée en retard.

Le tableau porte **trois dates** et non deux : création, émission, et **date de paiement**. Cette dernière ne se saisit pas ici — elle remonte du paiement rattaché à la facture, et reste vide tant qu'il n'y en a pas.

L'URL de cette page est https://eca-aveugles.fr/admin/bills

![Factures - capture 1](/admin/aide/images/factures-01.jpg)

## Ajout des factures

En règle générale, les factures sont générées automatiquement à partir des demandes ; leur gestion manuelle est donc assez simple. Cela dit, si vous devez créer une facture pour une raison quelconque et que celle dont vous avez besoin n'existe pas encore, cliquez sur le bouton « Ajouter une facture ».

Cela ouvrira le formulaire « Créer une facture ».

![Factures - capture 2](/admin/aide/images/factures-02.jpg)

Pour associer un auditeur et ses demandes disponibles, cliquez sur le champ « Rechercher un auditeur ... », saisissez un nom ou une adresse électronique, puis cliquez sur la ligne de votre choix.

![Factures - capture 3](/admin/aide/images/factures-03.jpg)

Cela affichera alors les demandes facturables de l'auditeur ; vous pourrez choisir celles que vous souhaitez joindre à la facture.

**Aucune case n'est cochée d'avance, et c'est voulu.** Le formulaire cochait autrefois tout ce qu'il trouvait : ouvrir la fiche d'un auditeur et valider suffisait alors à facturer des demandes qui n'étaient pas rendues, et des demandes sans tarif comptées pour zéro. Chaque ligne annonce donc désormais ce qui cloche, en ambre :

- « **Prestation pas encore terminée** » — la demande n'est pas au statut « Terminé ». La facturer reste possible, mais c'est un geste délibéré.
- « **Aucun tarif renseigné — serait facturée 0,00 €** » — personne n'a jamais fixé de prix pour cette demande. Cochée telle quelle, elle ajoute zéro euro au total.

La petite flèche au bout de la ligne ouvre la demande dans un nouvel onglet, pour aller vérifier avant de cocher.

![Factures - capture 4](/admin/aide/images/factures-04.jpg)

Compte tenu de la génération automatique des factures et de leur lien automatique avec les demandes, vous devez faire très attention lorsque vous effectuez cette opération afin de ne pas associer des demandes qui ont déjà été facturées automatiquement.

Enfin, pour la nouvelle facture, vous pouvez :

(1) Choisir l'auditeur concerné — c'est lui qui commande les demandes proposées juste en dessous

(2) Sélectionner l'état de la facture. À la création, seuls « Brouillon », « Émise » et « Payée » sont proposés : « Soldée » s'applique plus tard, depuis la facture elle-même.

(3) Indiquer une date de création

(4) Indiquer la date d'émission. Elle devient **obligatoire** dès que la facture est portée à « Payée » — une facture réglée a forcément été envoyée.

(5) Enregistrer la facture et la verser dans la base de données.

Le **montant total** ne se saisit pas : il s'affiche en bas du formulaire, et n'est que la somme des demandes cochées.

![Factures - capture 6](/admin/aide/images/factures-06.jpg)

### Saisir une facture déjà réglée

Il arrive qu'on enregistre après coup une facture dont le règlement est déjà arrivé. La case « **Facture déjà réglée** » évite alors de faire en deux temps ce qui n'est qu'un seul geste.

Cette case et le menu « État de la facture » **désignent la même chose** : cocher la case pose le menu sur « Payée », et choisir « Payée » coche la case. Ce ne sont pas deux réglages à accorder, mais deux vues d'un même état. La case n'apparaît pas sur un brouillon, qui n'a rien à encaisser.

Une fois cochée, trois champs s'ouvrent : la **référence de paiement** (facultative — un numéro de chèque, une référence de virement), la **méthode de paiement**, et la **date de paiement**, elle obligatoire.

À l'enregistrement, la facture est créée émise, son paiement est enregistré, puis elle passe payée — en une seule opération. **Le règlement devient un paiement à part entière** : il apparaît dans « [Paiements](/admin/aide/paiements) » et se corrige là-bas. La facture ne fait que le refléter.

![Factures - capture 7](/admin/aide/images/factures-07.jpg)

## Modification et impression des factures

Pour modifier une facture ou télécharger la version PDF à envoyer au client, cliquez sur la ligne correspondante. Cela ouvre le modal de modification de la facture.

Le haut du modal se lit d'un bloc : l'**auditeur**, l'**état actuel**, et les trois dates — création, émission, paiement. La flèche à côté du nom ouvre la fiche de l'auditeur dans un nouvel onglet.

### Un brouillon

Sur un brouillon, les fonctions de base sont les suivantes :

(1) « **Enregistrer un paiement** » saisit un règlement pour cette facture

(2) La section « **Changer le statut** » ne propose ici qu'« Émettre la facture » : c'est la seule suite qu'un brouillon connaisse

(3) « **Ajouter une demande** » rattache une demande de plus. Ce bouton **n'existe que sur un brouillon** — une fois la facture émise, son contenu est verrouillé. Là encore, mieux vaut s'en abstenir sauf circonstance exceptionnelle, les demandes venant s'y ranger toutes seules dès qu'elles atteignent « Terminé ».

(4) « **Supprimer la facture** » supprime définitivement la facture

> « **Enregistrer un paiement** » ouvre la fenêtre « Ajouter un paiement ». Pour tout ce qui concerne les [paiements](/admin/aide/paiements), reportez-vous à [cette page](/admin/aide/paiements).

![Factures - capture 9](/admin/aide/images/factures-09.jpg)

### Une facture émise

Une fois la facture émise, ce sont d'autres gestes qui s'offrent :

(1) « **Imprimer la facture** », en haut, engendre le PDF à envoyer à l'auditeur

(2) « **Remettre en brouillon** » rouvre la facture pour la corriger

(3) « **Marquer comme payée** » constate le règlement

(4) « **Solder la facture** » abandonne la créance

Au-dessus, le bloc « **Paiements** » répond d'un coup d'œil à « cette facture est-elle réglée ? » : *Encaissé 0,00 € sur 30,00 €*, puis *Reste à payer 30,00 €*. Chaque paiement rattaché s'y affiche avec son montant, sa méthode, sa date et sa référence, et **la ligne entière ouvre le paiement** dans « [Paiements](/admin/aide/paiements) ».

L'écart entre l'encaissé et le total est affiché en gris, sans alerte. C'est délibéré : **un paiement rattaché vaut règlement**. C'est le rattachement qui dit qu'une facture est réglée, pas l'arithmétique — sans quoi un écart de saisie de quelques centimes réclamerait de l'argent sur une facture que quelqu'un a déjà encaissée.

![Factures - capture 10](/admin/aide/images/factures-10.jpg)

### La référence de paiement ne se saisit plus ici

Un crayon permettait autrefois de corriger la référence du paiement depuis la facture. **Il a disparu, et il ne faut pas le chercher.** La référence, la méthode et la date de règlement vivent sur le *paiement* ; la facture ne fait que les refléter. Les modifier ici aurait réécrit une valeur dérivée, et fait diverger la facture du règlement qu'elle décrit.

Pour corriger une référence, ouvrez donc le paiement — depuis la liste « Paiements » du modal, ou depuis la page [Paiements](/admin/aide/paiements).

### Une facture finalisée

Une facture « Payée » ou « Soldée » est finalisée : son contenu ne bouge plus. Un bandeau ambre le dit et propose la seule issue, « **Rouvrir la facture** ».

Rouvrir la fait repasser à « émise ». Si elle portait des paiements, **ils en sont détachés** — ils restent dans « [Paiements](/admin/aide/paiements) », et leur numéro part à l'historique. Si elle était soldée sans paiement, elle redevient une créance à réclamer.

![Factures - capture 11](/admin/aide/images/factures-11.jpg)

### L'historique

« **Historique de la facture** » déplie la liste des écritures faites sur cette facture : qui, quand, et quelle valeur a remplacé quelle autre. C'est un registre en ajout seul — rien n'y est jamais modifié ni effacé.

![Factures - capture 12](/admin/aide/images/factures-12.jpg)

### Supprimer une facture

« Supprimer la facture » demande confirmation avant d'agir, et annonce ce que la suppression entraîne pour les demandes qui y sont rattachées.

![Factures - capture 13](/admin/aide/images/factures-13.jpg)

## L'avis d'impression

Il arrive que l'application vous annonce d'elle-même qu'une facture doit sortir de l'imprimante. Une boîte de dialogue s'ouvre alors, avec le bouton d'impression dedans.

Trois situations la déclenchent, et dans les trois personne n'a rien demandé de tel — c'est tombé d'une modification faite ailleurs :

- le seuil de facturation vient d'émettre une facture ;
- un coût modifié a changé le total d'une facture déjà envoyée ;
- un élément imprimé sur la facture a changé.

C'est une boîte de dialogue et non un message qui s'efface tout seul, précisément parce qu'**un document doit partir au courrier** : un message fugace peut n'être jamais lu. « Voir la facture » reste disponible en lien discret, pour vérifier les lignes avant d'engager du papier.
