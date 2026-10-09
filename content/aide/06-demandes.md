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

Le statut d'une demande ne se choisit pas : il se déduit de son attribution et de sa date de clôture, comme celui d'une attribution se déduit de ses dates.

Si la demande concerne un enregistrement, elle est « en attente d’envoi vers le lecteur ». Une fois que l'attribution a un lecteur et une date d'envoi, la demande devient « en cours ».

Lorsque l'attribution est terminée (sa date de retour aux ECA est renseignée), la demande passe automatiquement « en attente d'envoi à l'auditeur ». Le jour où vous envoyez l'enregistrement et le livre à l'auditeur demandeur, renseignez la date de clôture de la demande : elle passe « terminé ». Une duplication passe de « à faire » à « terminé » de la même façon, dès que sa date de clôture est renseignée.

L'URL de cette page est https://eca-aveugles.fr/admin/orders.

![Demandes - capture 1](/admin/aide/images/demandes-01.jpg)

Vous pouvez rechercher des demandes existantes à l'aide de la barre de recherche (1) située en haut de la page. La recherche porte sur l'auditeur, sur le livre et sur le numéro de la demande.

![Demandes - capture 2](/admin/aide/images/demandes-02.jpg)

Dans le tableau, cliquez sur le titre du livre (ou n'importe où sur la ligne) pour ouvrir la demande, sur le nom de l'auditeur pour ouvrir son [dossier](/admin/aide/membres#le-dossier), ou sur le numéro de la colonne « Attribution » pour ouvrir l'attribution liée.

Vous pouvez filtrer votre recherche selon les critères suivants :

1. Le livre concerné

2. Le statut de la demande

3. Le statut de la facturation de la demande

4. Le type de la demande : enregistrement ou duplication. Deux choix de plus trient les duplications ouvertes : « Duplication réalisable » (celles qui peuvent être faites dès maintenant — c'est la liste qu'ouvre la ligne « Duplications à faire » de la page principale) et « Duplication en attente » (celles dont le livre est encore en cours d'enregistrement)

5. Si la demande est en retard, à surveiller ou à jour — voir [Délais et retards](/admin/aide/demandes#delais-et-retards) juste en dessous

Le bouton « Effacer les filtres » les retire tous d'un coup.

![Demandes - capture 3](/admin/aide/images/demandes-03.jpg)

### Trier et parcourir la liste

La liste s'ouvre sur les demandes les plus récentes. Cliquez sur le titre d'une colonne — N°, Auditeur, Livre, Date demande, Statut — pour trier selon cette colonne ; un second clic inverse l'ordre. Le tri par statut suit le circuit d'une demande, de « À faire » à « Terminée ».

Au-dessus du tableau, la ligne « 26–50 sur 20 184 demandes » dit quelles demandes sont affichées et combien il y en a en tout. Les flèches à côté passent d'une page à l'autre, et « Lignes par page » affiche 25, 50 ou 100 demandes à la fois. Sous le tableau, les numéros de page mènent directement à une page, et le champ « Aller à la page » à n'importe laquelle — la page 400, par exemple, sans cliquer 399 fois.

Chaque page a sa propre adresse : vous pouvez l'ouvrir dans un nouvel onglet (clic du milieu) ou copier le lien pour l'envoyer à un collègue, avec la recherche, les filtres et le tri qui l'accompagnent. Si le lien mène au-delà de la dernière page — parce que des demandes ont été supprimées depuis, ou que le lien portait une autre recherche — vous arrivez sur la dernière.

## Délais et retards

Une demande passe par plusieurs étapes, et **chaque étape a son propre délai**. Le compteur repart de zéro à chaque nouvelle étape : un livre qui vient de partir chez un lecteur n'est pas « en retard » simplement parce que la demande est ancienne.

| Étape | Statut de la demande | Le délai compte à partir de | À surveiller après | En retard après |
|---|---|---|---|---|
| En attente d'un lecteur | Attente envoi vers lecteur | la date de la demande | 30 jours | 60 jours |
| Chez le lecteur | En cours | la date d'envoi au lecteur (ou de la dernière réattribution) | 60 jours — « à relancer » | 90 jours |
| À expédier à l'auditeur | Attente envoi vers auditeur | la date de retour aux ECA | 3 jours | 7 jours |
| Duplication à faire | À faire | la date de la demande, ou le retour de l'enregistrement qu'elle attendait | 7 jours | 14 jours |

Ces délais viennent de nos propres chiffres : un lecteur est trouvé en moins de trois semaines pour la moitié des demandes, la moitié des livres reviennent de chez le lecteur en moins d'un mois, et neuf sur dix en moins de trois mois. Un livre chez le lecteur depuis deux mois n'est donc pas encore en retard, mais c'est le bon moment pour prendre de ses nouvelles.

Quelques précisions :

- **Une réattribution fait repartir le délai** : le nouveau lecteur a lui aussi ses trois mois.
- **Une duplication « en attente d'enregistrement » n'est jamais en retard** : elle attend un livre qu'un lecteur est encore en train d'enregistrer, et c'est cet enregistrement qui porte le délai. Le sien commence le jour où l'enregistrement revient.
- **Une demande clôturée n'a plus de délai.**

Dans la liste, une demande en retard apparaît sur fond rouge, avec la mention « En retard » et depuis combien de temps sous son statut ; une demande à surveiller porte la mention en orange (« À relancer » quand le livre est chez le lecteur). En passant la souris sur la mention, vous lisez l'étape et le délai qui s'applique.

![Demandes - capture 15](/admin/aide/images/demandes-15.jpg)

La liste des [attributions](/admin/aide/attributions) a le même filtre « Retard », avec les mêmes délais pour les deux premières étapes, et les lignes sous les cartes de la [page principale](/admin/aide/page-principale#ce-qui-est-en-retard) reprennent exactement ces règles.

Les anciennes demandes restées ouvertes apparaissent elles aussi en retard, parfois depuis plusieurs années. Si une demande est en réalité terminée, clôturez-la : elle disparaît du décompte.

## Ajout des demandes

Pour ajouter une demande, cliquez sur le bouton « Ajouter une demande »

![Demandes - capture 4](/admin/aide/images/demandes-04.jpg)

En cliquant dessus, vous ouvrez le modal « Nouvelle demande ».

![Demandes - capture 5](/admin/aide/images/demandes-05.jpg)

Vous pouvez saisir ici le nom de l'auditeur à l'origine de la demande, ainsi que toutes les métadonnées associées à celle-ci. Certaines demandes ne pouvant pas faire l'objet d'une facturation, une option permet de l'indiquer dans le champ « État de facturation », sous les ouvrages, juste avant les notes.

![Demandes - capture 6](/admin/aide/images/demandes-06.jpg)

Vous devrez également ajouter un ouvrage. Vous pouvez soit (1) rechercher un ouvrage déjà présent dans la base de données, soit (2) en créer un nouveau, qui sera lui aussi ajouté à la base de données.

Si vous souhaitez gagner du temps et envoyer plusieurs demandes pour le même auditeur en même temps, vous pouvez (3) cliquer sur le bouton « Ajouter un ouvrage » et saisir le titre d'un autre livre. Vous pouvez répéter cette opération autant de fois que vous le souhaitez ; une nouvelle demande sera créée pour chaque livre. Le bouton de validation n'annonce que les lignes où un livre a été choisi ; une ligne restée vide est signalée « sans livre » et doit être complétée ou retirée avant de valider.

Vous pouvez également saisir un coût spécifique pour la demande. Par défaut, le coût est de **3 € par CD** d'enregistrement, et de 3 € tant que le livre n'est pas encore enregistré.

![Demandes - capture 7](/admin/aide/images/demandes-07.jpg)

Si le livre doit être lu par quelqu'un, nous classons la demande comme un (1) enregistrement. Si le livre est déjà enregistré, nous la classons comme une (2) duplication.

Le portail choisit le type pour vous au moment où vous sélectionnez le livre :

- le livre a déjà un fichier audio → **Duplication** ;
- le livre n'a pas encore d'audio mais il est déjà en cours d'enregistrement (une demande d'enregistrement ouverte, ou une attribution « Attente envoi vers lecteur » ou « En cours ») → **Duplication** : elle pourra être faite au retour de l'enregistrement ;
- sinon → **Enregistrement**. C'est aussi le type d'une ligne tant qu'aucun livre n'est choisi.

Quand le portail choisit « Duplication », une note sous les boutons dit pourquoi. Ce n'est qu'une proposition : cliquez sur l'autre bouton pour la changer, par exemple pour faire relire un livre déjà enregistré. Si vous choisissez « Duplication » pour un livre qui n'a ni audio ni enregistrement en cours, un avertissement rappelle qu'il n'y a rien à dupliquer.

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

Une duplication ne peut pas être tarifée à la page : elle n'a pas de lecture à compter. Si le choix du livre bascule l'ouvrage en « Duplication » (le livre a déjà un fichier audio), ce que vous aviez saisi n'est pas effacé : c'est simplement masqué et non envoyé, et tout réapparaît si vous repassez sur « Enregistrement ». Et une fois la demande rattachée à une facture, on ne peut plus la faire passer d'une tarification au poids à une tarification à la page (ni l'inverse) : détachez-la d'abord.

Quand la demande passe à « Terminé », sa **facture pro-forma** est créée et émise d'office — voir [Les factures pro-forma](/admin/aide/factures#les-factures-pro-forma).

## Modification des demandes

Pour modifier une demande, cliquez sur la ligne correspondante.

![Demandes - capture 10](/admin/aide/images/demandes-10.jpg)

Cela ouvrira le modal de la demande.

En haut de la page, on peut voir les informations générales que nous avons ajoutées lors de la création de la demande.

![Demandes - capture 11](/admin/aide/images/demandes-11.jpg)

Sous le type de la demande viennent, dans l'ordre, l'attribution correspondante (1) si la demande concerne un enregistrement, la date de clôture (2) avec la méthode de livraison à côté, puis le statut (3). Plus bas, on trouve la facture correspondante (4), s'il y en a déjà une.

![Demandes - capture 12](/admin/aide/images/demandes-12.jpg)

La date de clôture est le jour où l'enregistrement est expédié à l'auditeur. Le bouton « Aujourd'hui » la remplit d'un clic ; « Effacer » vide une date que vous venez de saisir. Pour un enregistrement, elle reste grisée tant que l'attribution n'est pas terminée ; une duplication peut être close à tout moment.

Le statut n'est pas un menu : il se lit, et suit l'attribution et la date de clôture. Renseigner la date fait passer la demande « Terminé ». Si l'enregistrement va changer le statut, une ligne sous le statut le dit avant que vous validiez.

Nous pouvons mettre à jour la demande avec les informations que nous avons modifiées à l'aide du bouton (1) « Mettre à jour la demande », ou supprimer la demande à l'aide du bouton (2) « Supprimer la demande ».

![Demandes - capture 13](/admin/aide/images/demandes-13.jpg)

La case « Tarifer à la page (pour les revues) » se retrouve aussi dans ce modal, juste au-dessus du coût, avec les mêmes champs : voir [Une demande tarifée à la page](#une-demande-tarifee-a-la-page-pour-les-revues). Elle est grisée quand la demande est déjà rattachée à une facture ou qu'il s'agit d'une duplication, et les champs se figent quand la facture est payée ou soldée.

Si vous corrigez le livre d'une demande, l'attribution liée prend automatiquement le même livre.

### Rouvrir une demande terminée

Une demande « Terminé » se rouvre par le bouton « **Rouvrir la demande** », sous son statut, comme une [attribution](/admin/aide/attributions). Une fenêtre indique ce que deviendra la demande, et vous pouvez y donner la raison de la réouverture : elle est ajoutée aux notes avec la date du jour. La date de clôture est alors effacée, et le statut retombe sur celui que donne l'attribution (ou « À faire » pour une duplication). Les autres modifications du formulaire sont enregistrées en même temps.

Si la demande figure sur un brouillon de facture, elle en est retirée et y reviendra une fois close de nouveau. Si elle figure sur une facture déjà émise, elle ne peut pas être rouverte : sa date de clôture peut être corrigée, mais plus effacée, car la facture annonce la prestation comme rendue. Rouvrez la facture et retirez-en la demande d'abord.

### Changer l'auditeur d'une demande

Tant que la demande figure sur une facture, même un brouillon, son auditeur est verrouillé : c'est lui qui décide à qui la facture est adressée. La note sous le champ donne le numéro de la facture, avec un lien pour l'ouvrir dans un nouvel onglet : retirez-y la demande (« Retirer de la facture »), puis revenez corriger l'auditeur.

Si la demande est déjà « Terminé », elle ne rejoindra plus de brouillon toute seule, puisque c'est le **passage** à « Terminé » qui l'y fait entrer. Dès que vous choisissez le nouvel auditeur, une case « **Facturer cette demande à …** » apparaît, cochée par défaut : à l'enregistrement, la demande est ajoutée au brouillon du nouvel auditeur (un brouillon est ouvert s'il n'en a pas), et une fenêtre vous indique lequel. Si ce brouillon atteint alors le seuil de facturation, il est émis, comme pour une demande qui vient d'être terminée. Une demande tarifée à la page reçoit sa facture pro-forma.

Décochez la case si la demande ne doit pas être facturée, par exemple une ancienne demande déjà réglée que vous corrigez seulement pour l'historique : elle reste « Terminé » sans facture. La case n'apparaît pas pour une demande « Non facturable ».

Si la demande est associée à une attribution ou à une facture déjà émise, la suppression sera refusée. Vous devez d'abord supprimer l'attribution, ou retirer la demande de la facture.

Une demande supprimée n'apparaît plus dans les listes ni les recherches, mais reste consultable en rouvrant un lien qui pointe vers elle (depuis le journal des modifications ou une facture, par exemple) : le modal s'ouvre avec un bandeau rouge « Demande supprimée le … » et tous les champs en lecture seule.

Le bouton « Restaurer » du bandeau annule la suppression. Si la demande était rattachée à une facture qui a depuis évolué (émise, payée ou soldée), la restauration la détache de cette facture plutôt que de rouvrir un document déjà verrouillé — un message le précise avant de confirmer, avec un lien vers la facture concernée. La demande peut alors être refacturée séparément si besoin.

Si le livre de la demande a été supprimé du catalogue entre-temps, la restauration est refusée : une demande ne peut pas vivre sur un livre supprimé. La fenêtre donne un lien vers la fiche livre : [restaurez d'abord le livre](/admin/aide/catalogue#restaurer-un-livre-supprime), puis la demande.
