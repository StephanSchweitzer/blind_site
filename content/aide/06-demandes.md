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

Vous pouvez rechercher des demandes existantes à l'aide de la barre de recherche (1) située en haut de la page. La recherche porte sur l'auditeur, sur le livre et sur le numéro de la demande.

![Demandes - capture 2](/admin/aide/images/demandes-02.jpg)

Dans le tableau, cliquez sur le nom de l'auditeur pour ouvrir son [dossier](/admin/aide/membres#le-dossier), ou sur le numéro de la colonne « Attribution » pour ouvrir l'attribution liée.

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

Vous pouvez également saisir un coût spécifique pour la demande. Par défaut, le coût est de **3 € par CD** d'enregistrement, et de 3 € tant que le livre n'est pas encore enregistré.

![Demandes - capture 7](/admin/aide/images/demandes-07.jpg)

Si le livre est déjà enregistré, nous classons la demande comme une (1) duplication. Si le livre doit être lu par quelqu'un, nous classons la demande comme un (2) enregistrement.

![Demandes - capture 8](/admin/aide/images/demandes-08.jpg)

Au bas de la page, vous pouvez (1) ajouter des commentaires supplémentaires si vous le souhaitez, et (2) enregistrer la demande en cliquant sur le bouton « Créer x demande(s) ». Le nombre s'adaptera en fonction du nombre d'ouvrages que vous aurez ajoutés au formulaire.

![Demandes - capture 9](/admin/aide/images/demandes-09.jpg)

### Une demande tarifée à la page (pour les revues)

Certaines demandes ne se paient pas au CD mais **à la page lue** : c'est le cas des revues et magazines — des associations comme l'UNADEV, pour un numéro de magazine — qui réclament une facture pro-forma pour régler. Le bouton qui sert à les saisir est donc libellé « pour les revues ».

Pour un ouvrage de type « Enregistrement », cochez « **Tarifer à la page (pour les revues)** » (1), juste sous les boutons Enregistrement / Duplication. Quatre champs apparaissent :

![Demandes - capture 14](/admin/aide/images/demandes-14.jpg)

- (2) **Pages lues** (obligatoire) : le nombre de pages du document ;
- (3) **Pages comptées (si différent)** : à remplir seulement quand on facture moins de pages qu'on n'en a lu. Par exemple, 42 pages lues comptées comme 14 pages. Laissé vide, ce sont les pages lues qui sont facturées ;
- (4) **Prix par page** : 3,00 € par défaut, modifiable pour cette demande ;
- (5) **Frais d'envoi (WeTransfer)** : le montant, ou rien si l'envoi est gratuit — la facture n'a alors pas de ligne d'envoi.

Le coût de la demande se calcule tout seul, sous les champs : *pages comptées (à défaut, pages lues) × prix par page + frais d'envoi*. Il ne se saisit plus à la main, et il n'est plus recalculé d'après le poids de l'enregistrement. Le champ « Coût » disparaît donc du formulaire tant que la case est cochée.

Une duplication ne peut pas être tarifée à la page : elle n'a pas de lecture à compter. Et une fois la demande rattachée à une facture, on ne peut plus la faire passer d'une tarification au poids à une tarification à la page (ni l'inverse) : détachez-la d'abord.

Quand la demande passe à « Terminé », sa **facture pro-forma** est créée et émise d'office — voir [Les factures pro-forma](/admin/aide/factures#les-factures-pro-forma).

## Modification des demandes

Pour modifier une demande, cliquez sur la ligne correspondante.

![Demandes - capture 10](/admin/aide/images/demandes-10.jpg)

Cela ouvrira le modal de la demande.

En haut de la page, on peut voir les informations générales que nous avons ajoutées lors de la création de la demande.

![Demandes - capture 11](/admin/aide/images/demandes-11.jpg)

En faisant défiler la page vers le bas, on trouve des informations et des liens permettant d'accéder à la (1) facture correspondante (s'il y en a déjà une) et à l'attribution correspondante (2), si la demande concernait un enregistrement.

![Demandes - capture 12](/admin/aide/images/demandes-12.jpg)

Nous pouvons mettre à jour la demande avec les informations que nous avons modifiées à l'aide du bouton (1) « Mettre à jour la demande », ou supprimer la demande à l'aide du bouton (2) « Supprimer la demande ».

![Demandes - capture 13](/admin/aide/images/demandes-13.jpg)

La case « Tarifer à la page (pour les revues) » se retrouve aussi dans ce modal, sous le livre, avec les mêmes champs : voir [Une demande tarifée à la page](#une-demande-tarifee-a-la-page-pour-les-revues). Elle est grisée quand la demande est déjà rattachée à une facture ou qu'il s'agit d'une duplication, et les champs se figent quand la facture est payée ou soldée.

Si vous corrigez le livre d'une demande, l'attribution liée prend automatiquement le même livre.

Si la demande est associée à une attribution ou à une facture déjà émise, la suppression sera refusée. Vous devez d'abord supprimer l'attribution, ou retirer la demande de la facture.

Une demande supprimée n'apparaît plus dans les listes ni les recherches, mais reste consultable en rouvrant un lien qui pointe vers elle (depuis le journal des modifications ou une facture, par exemple) : le modal s'ouvre avec un bandeau rouge « Demande supprimée le … » et tous les champs en lecture seule.
