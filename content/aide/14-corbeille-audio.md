---
title: Corbeille audio
slug: corbeille-audio
order: 14
---

# Corbeille audio

Un fichier audio supprimé n'est pas effacé tout de suite : il passe d'abord par la corbeille, d'où il peut être restauré pendant 14 jours. Cette page montre tous les fichiers de la corbeille, pour l'ensemble du catalogue.

L'URL de cette page est https://eca-aveugles.fr/admin/audio-corbeille

![Corbeille audio - les onglets et un groupe replié](/admin/aide/images/corbeille-audio-01.jpg)

## Les trois onglets

- **Dans la corbeille** — les fichiers que l'on peut encore restaurer, y compris ceux dont le livre a été supprimé : leur carte indique « fiche supprimée », avec la date quand la fiche existe encore.
- **Restaurées** — les fichiers remis en place.
- **Purgées** — les fichiers supprimés définitivement, par la purge automatique ou avec « Supprimer définitivement ». Chacun indique qui l'a supprimé, ou « par la purge automatique ».

Les suppressions les plus récentes apparaissent en premier, dans tous les onglets.

La barre de recherche permet de retrouver un fichier par son nom ou par le titre du livre.

## Un groupe par livre

Les fichiers d'un même livre sont regroupés sur une seule carte, qui indique la date de suppression et qui l'a faite. Cliquez sur « **Voir les fichiers** » pour afficher le détail, dans l'ordre des pistes.

Chaque carte nomme le livre, même quand elle ne contient qu'un fichier. Chaque fichier indique qui l'a supprimé, quand, et dans combien de jours il sera supprimé définitivement. Un liseré ambre signale qu'il reste trois jours ou moins. S'il y en a, un bandeau ambre en haut de l'onglet les compte : ce sont les suppressions les plus anciennes, donc en fin de liste. « **Afficher ces fichiers** », dans le bandeau, n'affiche qu'eux, le plus proche de sa purge en premier ; « Tout afficher » revient à la liste complète.

## Restaurer

(1) « **Restaurer tout** » remet en place tous les fichiers du livre. (2) « **Réduire** » masque le détail. (3) « **Restaurer** » remet en place un seul fichier. Sur un livre qui a beaucoup de fichiers, « Restaurer tout » se fait en plusieurs étapes : un message indique combien sont déjà revenus.

![Corbeille audio - un groupe déplié, fichier par fichier](/admin/aide/images/corbeille-audio-02.jpg)

Si le livre n'existe plus, la carte le signale avant le clic : le fichier restauré apparaît dans la page [Audio orphelin](/admin/aide/audio-orphelin), où vous pourrez le rattacher à un livre. Si une fiche a repris ce dossier entre-temps, le fichier rejoint son enregistrement, et le message de restauration la nomme.

Si la fiche a été supprimée mais existe encore (« fiche supprimée le … »), le fichier restauré revient dans son dossier, qui reste invisible tant que la fiche est supprimée. Pour retrouver le livre avec ses fichiers, ouvrez plutôt la fiche depuis le lien de la carte et cliquez sur « Restaurer » : sa fenêtre propose les fichiers de la corbeille.

Certains fichiers ne peuvent pas revenir, et la page le signale sur leur ligne, bouton « Restaurer » désactivé :

- **un fichier du dossier porte de nouveau ce nom** — souvent la nouvelle version qui l'a remplacé avec « Remplacer ». Renommez ou supprimez d'abord ce fichier depuis l'éditeur audio du livre ;
- **la copie de sauvegarde n'est plus dans le stockage** — le fichier est perdu pour la corbeille. « **Retirer de la corbeille** » range la ligne dans l'onglet « Purgées » ; rien d'autre n'est effacé.

« Restaurer tout » laisse ces fichiers de côté, et la carte du livre dit combien il y en a.

Un fichier ne revient que dans le dossier audio que sa fiche utilise aujourd'hui. Si la fiche a changé de dossier depuis la suppression — son enregistrement a été transféré à un autre livre, ou la fiche a absorbé un doublon dont elle n'a pas gardé le dossier —, la restauration est refusée et le motif s'affiche : le fichier irait sinon grossir l'enregistrement d'un autre livre. Elle est refusée de même quand le dossier est aussi celui d'une autre fiche. Pendant qu'un envoi de fichiers est en cours sur le livre, la restauration est refusée elle aussi, le temps que l'envoi se termine : il pourrait écraser le fichier restauré.

## Supprimer définitivement

Un fichier supprimé volontairement — une mauvaise prise, un doublon — n'a pas besoin d'attendre 14 jours dans la corbeille. Tant qu'il y est, il reste compté dans l'onglet « Corbeille » de l'éditeur audio du livre, et proposé à nouveau si le livre est restauré.

« **Supprimer définitivement** » efface un seul fichier du stockage tout de suite ; « **Tout supprimer définitivement** », sur la carte d'un livre, efface tous ses fichiers encore dans la corbeille. Une fenêtre de confirmation rappelle les fichiers concernés et leur poids avant d'agir ; pour plusieurs fichiers, il faut y taper leur nombre.

**Cette suppression est irréversible.** Le fichier ne peut plus être restauré : c'est souvent la seule copie de l'enregistrement. En cas de doute, laissez la purge automatique s'en charger.

Le fichier passe alors dans l'onglet « Purgées », avec le nom de la personne qui l'a supprimé, et disparaît de la corbeille du livre. Cela vaut aussi pour les fichiers conservés indéfiniment (supprimés avant la mise en place de la purge).
