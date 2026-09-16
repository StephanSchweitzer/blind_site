---
title: Demandes
slug: demandes
order: 6
---

# Demandes

Les « demandes » constituent la base de nos interactions avec nos clients. Tous les auditeurs font des « demandes » pour un livre spécifique, et nous leur envoyons l'enregistrement correspondant.

Il s'agit de l'élément fondamental qui régit la manière dont nos auditeurs formulent leurs demandes. Toutes les demandes transitent par les « demandes », et l'ensemble du travail y est répertorié. Ce système ne gère pas la délégation des enregistrements ni la logistique ; il se contente de recenser « qui a demandé quoi, quand, et à quel coût ».

Il existe deux types de demandes : les doublons et les enregistrements. Les doublons correspondent à des livres qui ont déjà été lus, enregistrés et sauvegardés dans Arbre Rose. Un enregistrement signifie que quelqu’un devra lire et enregistrer le livre pour que la demande soit validée.

Certains de ses états peuvent être modifiés par les permanents, tandis que d'autres sont gérés directement par le système afin d'assurer la synchronisation entre les factures et les attributions.

Ces statuts pour les demandes sont diffèrent selon qu’il s’agit d’une duplication ou d’un enregistrement. Les statuts des duplications sont soit « duplication à faire », soit « terminé », en raison de la rapidité avec laquelle un fichier peut être copié et envoyé.

Pour l’enregistrement, c’est plus compliqué car il existe un processus dédié à la lecture et à l’enregistrement des livres.

Lorsque l'attribution est marquée comme « terminée », le statut de la demande reste automatiquement « en attente d'envoi à l'auditeur ». Un membre du personnel devra venir définir manuellement ce statut comme « terminé » une fois qu'il aura envoyé l'enregistrement et le livre à l'auditeur demandeur.

Si la demande concerne un enregistrement, elle est « en attente d’envoi vers le lecteur ». Une fois que vous avez créé une attribution et désigné un lecteur, la demande devient « en cours ».

Lorsque l'attribution est marquée comme « terminée », le statut de la demande reste automatiquement « en attente d'envoi à l'auditeur ». Un membre du personnel devra venir définir manuellement ce statut comme « terminé » une fois qu'il aura envoyé l'enregistrement et le livre à l'auditeur demandeur.

L'URL de cette page est https://eca-aveugles.fr/admin/orders.

![Demandes - capture 1](/admin/aide/images/demandes-01.jpg)

Vous pouvez rechercher des demandes existantes à l'aide de la barre de recherche située en haut de la page. La recherche porte sur l'auditeur (nom, prénom, adresse électronique), sur le livre (titre, sous-titre, auteur) et sur le numéro de la demande — et vous pouvez mélanger les trois dans une même saisie : « morvan étranger » trouve la demande de M. Morvan portant ce titre. Voir [La barre de recherche](/admin/aide/composants-de-base#la-barre-de-recherche).

![Demandes - capture 2](/admin/aide/images/demandes-02.jpg)

Le nom de l'auditeur, dans le tableau, mène à son [dossier](/admin/aide/membres) — onglet « Demandes », celui que vous étiez en train de consulter. C'est le chemin le plus court vers tout ce qui le concerne : ses demandes, ses factures, ses paiements et ses attributions.

La colonne « Attribution » du tableau indique si la demande est déjà attribuée : elle affiche le numéro de l'attribution et son statut, et un clic sur ce numéro ouvre directement l'attribution. Une duplication, qui n'a jamais d'attribution, y est signalée comme telle ; un tiret signifie qu'aucune attribution n'existe encore.

Pour voir toutes les demandes d'un même livre, utilisez le filtre « Livre » au-dessus du tableau : cherchez le livre par titre, par auteur ou par numéro, puis choisissez-le dans la liste proposée. Chaque résultat affiche son numéro, ce qui permet de distinguer deux volumes d'une même série qui portent le même titre. La liste se restreint alors à ce livre, avec un bandeau qui le rappelle ; « Retirer ce filtre » revient à la liste complète.

C'est le même filtre qui s'applique lorsque vous suivez le lien « Ce livre : … demandes » depuis la fiche du livre dans le [Catalogue](/admin/aide/catalogue), ou depuis le modal d'une demande ou d'une attribution.

Ce filtre est séparé de la barre de recherche à dessein : un numéro tapé dans la recherche désigne une **demande**, jamais un livre. Les deux séries de numéros se chevauchent, et les confondre ramènerait la demande cherchée noyée parmi celles du livre portant le même numéro.

Vous pouvez filtrer votre recherche selon les critères suivants :

1. Le livre concerné

2. Le statut de la demande

3. Le statut de la facturation de la demande

4. Le type de la demande (enregistrement et duplication)

5. Si la demande est en retard ou non (une demande est considérée comme en retard si elle a été déposée il y a plus de 3 mois)

![Demandes - capture 3](/admin/aide/images/demandes-03.jpg)

## Ajout des demandes

Pour ajouter une demande, cliquez sur le bouton « Ajouter une demande »

![Demandes - capture 4](/admin/aide/images/demandes-04.jpg)

En cliquant dessus, vous ouvrez le modal « Nouvelle demande ».

![Demandes - capture 5](/admin/aide/images/demandes-05.jpg)

Vous pouvez saisir ici le nom de l'auditeur à l'origine de la demande, ainsi que toutes les métadonnées associées à celle-ci. Certaines demandes ne pouvant pas faire l'objet d'une facturation, une option permet de l'indiquer dans le champ « État de facturation ».

![Demandes - capture 6](/admin/aide/images/demandes-06.jpg)

Vous devrez également ajouter un ouvrage. Vous pouvez soit (1) rechercher un ouvrage déjà présent dans la base de données, soit (2) en créer un nouveau, qui sera lui aussi ajouté à la base de données.

Si vous souhaitez gagner du temps et envoyer plusieurs demandes pour le même auditeur en même temps, vous pouvez (3) cliquer sur le bouton « Ajouter un ouvrage » et saisir le titre d'un autre livre. Vous pouvez répéter cette opération autant de fois que vous le souhaitez ; une nouvelle demande sera créée pour chaque livre.

Vous pouvez également saisir un coût spécifique pour la demande. Le coût n'est plus un forfait : il est **conseillé à partir du poids de l'enregistrement**, à raison de **3 € par CD entamé** (un CD = 700 Mo). Un livre qui tient sur un CD est donc conseillé à 3 €, un livre de trois CD à 9 €.

Tant que le poids n'est pas connu — livre pas encore enregistré — la demande retombe sur le plancher d'un CD, c'est-à-dire 3 €. Le champ reste modifiable à la main, et le tarif se recalcule tout seul au dépôt de l'audio, tant que la demande n'est pas rattachée à une facture émise.

![Demandes - capture 7](/admin/aide/images/demandes-07.jpg)

Si le livre est déjà enregistré, nous classons la demande comme une (1) duplication. Si le livre doit être lu par quelqu'un, nous classons la demande comme un (2) enregistrement.

![Demandes - capture 8](/admin/aide/images/demandes-08.jpg)

Au bas de la page, vous pouvez (1) ajouter des commentaires supplémentaires si vous le souhaitez, et (2) enregistrer la demande en cliquant sur le bouton « Créer x demande(s) ». Le nombre s'adaptera en fonction du nombre d'ouvrages que vous aurez ajoutés au formulaire.

![Demandes - capture 9](/admin/aide/images/demandes-09.jpg)

## Modification des demandes

Pour modifier une demande, cliquez sur la ligne correspondante.

![Demandes - capture 10](/admin/aide/images/demandes-10.jpg)

Cela ouvrira le modal de la demande.

En haut de la page, on peut voir les informations générales que nous avons ajoutées lors de la création de la demande.

![Demandes - capture 11](/admin/aide/images/demandes-11.jpg)

En faisant défiler la page vers le bas, on trouve des informations et des liens permettant d'accéder à la (1) facture correspondante (s'il y en a déjà une) et à l'attribution correspondante (2), si la demande concernait un enregistrement.

Sous le livre, la ligne « Ce livre : … demandes · … attributions » mène aux autres demandes et attributions portant sur le même ouvrage (la demande ouverte y est comptée) — utile pour repérer une demande saisie deux fois.

![Demandes - capture 12](/admin/aide/images/demandes-12.jpg)

Nous pouvons mettre à jour la demande avec les informations que nous avons modifiées à l'aide du bouton (1) « Mettre à jour la demande », ou supprimer la demande à l'aide du bouton (2) « Supprimer la demande ».

![Demandes - capture 13](/admin/aide/images/demandes-13.jpg)

### Corriger le livre d'une demande

Le livre d'une demande reste modifiable, même une fois la demande terminée ou facturée : c'est ce qui permet de corriger une erreur de saisie. Deux choses suivent automatiquement :

- **L'attribution liée prend le même livre.** Si elle est déjà chez un lecteur ou terminée, le formulaire vous prévient : ce qui a été lu porte sur l'ancien livre, vérifiez que l'enregistrement se trouve bien dans le dossier audio du nouveau.
- **Le coût** est recalculé sur le poids du nouveau livre tant que la demande n'est sur aucune facture ou sur un brouillon. Sur une facture **émise, payée ou soldée**, le coût facturé est conservé — l'auditeur n'a pas à payer une erreur des ECA. La facture n'est pas bloquée, mais elle est à réimprimer pour que le livre corresponde.

La suppression est refusée dans deux cas : (1) si une attribution active est associée à la demande — supprimez d'abord l'attribution ; (2) si la demande figure sur une facture **déjà émise, payée ou soldée** — détachez-la de la facture, ou rouvrez celle-ci d'abord.

Lorsqu'une modification ou une suppression est refusée à cause de l'attribution — suppression, passage en duplication, clôture alors que l'enregistrement n'est pas terminé, statut qui contredirait les dates de l'attribution — le message d'erreur comporte un lien « Voir l'attribution #… » qui l'ouvre dans un nouvel onglet.

En revanche, une demande posée sur un simple **brouillon** peut être supprimée directement : elle sort d'elle-même du total de la facture.

À noter : supprimer une demande est une **suppression logique**. La demande disparaît des listes, mais son historique de traitement est conservé — c'est lui qui alimente « Demandes traitées » dans les statistiques.
