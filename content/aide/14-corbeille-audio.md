---
title: Corbeille audio
slug: corbeille-audio
order: 14
---

# Corbeille audio

Supprimer un fichier audio ne l'efface pas tout de suite : il est d'abord **copié** dans une
corbeille du stockage, la copie est **vérifiée**, et c'est seulement ensuite que le fichier
quitte le dossier du livre. Cette page réunit tous les fichiers ainsi mis de côté, pour
**l'ensemble du catalogue** — l'éditeur audio d'un livre, lui, ne montre que les fichiers de
ce livre.

Elle répond à une question qu'aucun autre écran ne posait : **qu'est-ce qui va être supprimé
pour de bon dans les prochains jours**, et sur quel livre.

L'URL de cette page est https://eca-aveugles.fr/admin/audio-corbeille

![Corbeille audio - les quatre onglets et un groupe replié](/admin/aide/images/corbeille-audio-01.jpg)

## Les quatre onglets

- **Dans la corbeille** — les fichiers encore récupérables, du plus anciennement supprimé au
  plus récent, c'est-à-dire dans l'ordre où la purge automatique les prendra.
- **Sans fiche** — ceux dont **le livre a été supprimé depuis**. Ils restent nommés au titre
  et à l'identifiant qu'avait la fiche au moment de la suppression, et sans cette page,
  personne ne pouvait plus les voir du tout : l'éditeur audio d'un livre disparu n'existe
  plus pour les montrer.
- **Restaurées** — remises en place, avec **qui l'a fait et quand**.
- **Purgées** — définitivement supprimées du stockage. La ligne reste au journal, le fichier
  n'existe plus.

Chaque onglet affiche son total entre parenthèses, et une recherche libre (nom de fichier,
titre de livre, identifiant) filtre la liste sans changer d'onglet.

## Un groupe par livre

Une suppression se fait rarement fichier par fichier : effacer un livre en bloc peut en
laisser **60 ou 80** d'un coup dans la corbeille. Les lister un par un noierait tous les
autres livres de la page sous les fichiers d'un seul.

Les fichiers d'un même livre sont donc réunis sous une seule carte :

- un livre avec **un seul** fichier en corbeille s'affiche directement, sans repli ;
- à partir de **deux**, la carte se replie sur un résumé — nombre de fichiers, poids total,
  échéance la plus proche — et « **Voir les fichiers** » déplie le détail, fichier par
  fichier, avec son propre bouton « Restaurer » pour n'en reprendre qu'un seul.

![Corbeille audio - un groupe déplié, fichier par fichier](/admin/aide/images/corbeille-audio-02.jpg)

« **Restaurer tout** » remet en place en un clic tous les fichiers encore récupérables du
groupe.

## Ce que dit chaque fichier

Sous son nom, chaque ligne indique son poids, la date de suppression et **qui** a supprimé.
En dessous :

- tant qu'il est récupérable, **quand** il sera supprimé du stockage — « supprimé du stockage
  dans *n* jours », ou « au prochain passage de la purge » quand l'échéance est dépassée.
  Un délai de **trois jours ou moins** est signalé par un liseré ambre : c'est la dernière
  fenêtre pour agir ;
- les fichiers supprimés **avant la mise en place de cette purge automatique** en sont
  exemptés et portent la mention « conservé indéfiniment » — aucune échéance ne leur court ;
- une fois restauré ou purgé, la ligne le dit à la place de l'échéance, avec qui a restauré et
  quand pour le premier cas.

## Restaurer

« **Restaurer** » remet le fichier à l'emplacement exact d'où il venait.

La restauration est **refusée** si un autre fichier occupe désormais cette place — l'écraser
reviendrait à détruire un enregistrement en croyant en sauver un autre.

Quand le livre concerné n'existe plus (onglet « Sans fiche »), le fichier est tout de même
remis dans son dossier d'origine. Ce dossier n'appartenant plus à personne, il apparaît alors
dans la file « À traiter » de la page [Audio orphelin](/admin/aide/audio-orphelin), où il peut
être rattaché à un livre existant ou servir à en créer un nouveau.

## Ce que cette page ne fait pas

Elle ne supprime rien de plus : c'est un registre et un moyen de revenir en arrière, pas un
point d'entrée pour effacer un fichier. La suppression elle-même se fait depuis l'éditeur
audio du livre concerné ; cette page n'intervient qu'une fois le fichier déjà mis de côté.

Elle ne change pas non plus l'échéance de la purge — celle-ci tourne chaque nuit,
indépendamment de qui a consulté ou non cette page.
