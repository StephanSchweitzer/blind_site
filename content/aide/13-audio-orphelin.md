---
title: Audio orphelin
slug: audio-orphelin
order: 13
---

# Audio orphelin

Les enregistrements vivent dans un espace de stockage, rangés par dossier. Normalement chaque
dossier appartient à un livre du catalogue. Un dossier **orphelin** est un dossier que plus
aucun livre ne revendique : un enregistrement déposé avant que la fiche existe, un livre
supprimé depuis, un dossier créé à la main avec un nom qui ne correspond à rien.

Cette page les rassemble pour qu'aucun enregistrement ne se perde faute d'avoir été rattaché.

L'URL de cette page est https://eca-aveugles.fr/admin/audio-orphelins

![Audio orphelin - les dossiers à traiter](/admin/aide/images/audio-orphelin-01.jpg)

## Les trois onglets

- **À traiter** — personne n'a encore rien décidé. C'est la file de travail.
- **Rattachés** — un livre pointe désormais sur le dossier. L'affaire est close.
- **Écartés** — le dossier ne vaut rien (essai, doublon de stockage, rebut). Il reste listé
  ici pour que la synchronisation cesse de le remettre dans la file à chaque passage.

Un détail qui a son importance : un dossier n'est « rattaché » que tant que **le livre auquel
il est rattaché existe encore**. Si ce livre est supprimé plus tard — lors d'une fusion sur la
page [Doublons](/admin/aide/doublons), par exemple — le dossier redevient orphelin et **revient dans « À traiter »**.
Il ne disparaît pas en silence en se prétendant réglé.

## Rattacher un dossier à un livre existant

C'est le cas le plus fréquent : l'enregistrement est bon, la fiche existe, personne ne les
avait reliés. Recherchez le livre, sélectionnez-le, et le dossier lui est attribué. La page
propose d'elle-même des livres dont le titre ressemble au nom du dossier.

## Créer un livre pour ce dossier

Quand l'enregistrement existe mais que la fiche n'a jamais été créée, le bouton
« **Créer un livre pour ce dossier** » ouvre un formulaire pré-rempli à partir du nom du
dossier. Le livre est ajouté au catalogue et le dossier lui est rattaché dans la foulée.

Vérifiez le titre proposé avant de valider : il vient d'un nom de dossier, pas d'un
catalogue — ponctuation et accents y sont souvent approximatifs.

## Écarter un dossier

Écarter demande un **motif**. Ce n'est pas une formalité : un dossier écarté ne réapparaît
plus, et dans six mois le motif sera la seule trace de la raison. Un dossier écarté par erreur
peut être **restauré** depuis l'onglet « Écartés ».

## Détacher

Sur un dossier rattaché, « détacher » défait le lien sans toucher aux fichiers : le dossier
retourne dans « À traiter ». À utiliser quand le rattachement s'est fait sur le mauvais livre.

## Corbeille audio

L'URL de cette page est https://eca-aveugles.fr/admin/audio-corbeille

Supprimer un fichier audio ne l'efface pas : il est d'abord copié dans une corbeille, la copie
est vérifiée, et seulement ensuite le fichier quitte le dossier du livre. Cette page réunit
**tous** les fichiers ainsi mis de côté, pour l'ensemble du catalogue — l'éditeur audio d'un
livre ne montre que les siens.

Quatre onglets :

- **Dans la corbeille** — les fichiers encore récupérables, du plus anciennement supprimé au
  plus récent, c'est-à-dire dans l'ordre où la purge les prendra.
- **Sans fiche** — ceux dont le livre a été supprimé depuis. Ils restent nommés au titre et à
  l'identifiant qu'avait la fiche au moment de la suppression.
- **Restaurées** — remises en place, avec qui l'a fait et quand.
- **Purgées** — définitivement supprimées du stockage. La ligne reste, le fichier non.

Les fichiers d'un même livre sont regroupés sous une seule carte — une suppression en bloc peut
en laisser 60 ou 80 d'un coup, et les lister un par un noierait tous les autres livres de la
page. Un livre avec un seul fichier en corbeille s'affiche directement ; à partir de deux,
la carte se replie sur un résumé (nombre de fichiers, poids total, échéance la plus proche).
« Restaurer tout » remet en place tous les fichiers encore récupérables du groupe en un clic ;
« Voir les fichiers » déplie le détail, fichier par fichier, avec son propre bouton
« Restaurer » pour n'en reprendre qu'un seul. Chaque fichier dit quand il sera supprimé du
stockage ; un délai de trois jours ou moins est signalé. Les fichiers supprimés avant la mise
en place de cette purge automatique en sont exemptés et portent la mention « conservé
indéfiniment ».

« **Restaurer** » remet le fichier à l'emplacement exact d'où il venait. La restauration est
refusée si un autre fichier occupe désormais cette place — l'écraser reviendrait à détruire un
enregistrement en croyant en sauver un autre. Quand le livre n'existe plus, le fichier est tout
de même remis dans son dossier d'origine : ce dossier n'appartenant à personne, il apparaît
ensuite dans la file « À traiter » de cette page, où il peut être rattaché à un livre.

