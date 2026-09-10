---
title: Doublons
slug: doublons
order: 12
---

# Doublons

La page « Doublons » sert à réunir les fiches d'un même ouvrage. Elle existe à cause de la
reprise de l'ancienne base : des livres y ont été saisis deux fois, parfois à des années
d'intervalle, avec une orthographe ou un éditeur légèrement différents. Le système repère ces
paires probables et vous les présente une par une — c'est vous qui tranchez, jamais lui.

L'URL de cette page est https://eca-aveugles.fr/admin/review

Chaque carte porte **un livre signalé**, avec son numéro de fiche. En dessous, le système
propose ce qu'il a trouvé de plus proche dans le catalogue, sous « **Livres au titre proche** ».
Quand il ne trouve rien, il le dit — « Aucun correspondant trouvé » — plutôt que de rapprocher
au hasard.

Trois gestes depuis cette carte :

- « **Comparer** » ouvre les deux fiches côte à côte, avec un tableau des **champs divergents** :
  titre, auteur, éditeur, ISBN, nombre de pages. La décision se prend sur les écarts, pas sur
  l'impression générale.
- « **Écouter** » fait entendre l'enregistrement rattaché, quand il y en a un. C'est souvent
  le moyen le plus rapide de savoir si deux fiches désignent le même livre.
- « **Pas un doublon** » retire la carte de la file.

Si aucun des rapprochements proposés ne convient, le champ « **ou chercher un autre livre** »
accepte un titre, un auteur, un ISBN ou un numéro de fiche.

![Doublons - la file de révision](/admin/aide/images/doublons-01.jpg)

## Fusionner deux fiches

Quand les deux fiches désignent bien le même livre, la fusion les réunit en une seule.

Avant de valider, vous choisissez **champ par champ** ce qui doit être conservé : si la fiche
à supprimer porte un meilleur titre ou un ISBN que l'autre n'a pas, vous le reprenez sur la
fiche survivante.

Ce que la fusion fait pour vous, sans vous le demander :

- les **demandes** rattachées à la fiche supprimée sont repointées sur la fiche conservée ;
- l'**enregistrement** suit automatiquement — vous n'avez jamais à choisir un fichier audio ;
- l'opération est inscrite au journal **à votre nom**, pas « par Système » : une fusion
  supprime un livre et déplace des demandes, cela ne s'archive pas anonymement.

**La fusion est irréversible.** Le système vous le dit avant de valider ; prenez-le au mot.

## Quand la fusion est refusée : deux enregistrements différents

Si les deux fiches portent **chacune un enregistrement, et que ce ne sont pas les mêmes**, le
bouton de fusion est désactivé. Ce n'est pas une précaution excessive : fusionner reviendrait
à faire disparaître l'un des deux audios, et rien dans l'interface ne permet de savoir lequel
garder.

Dans ce cas, deux issues seulement :

1. **Pas un doublon** — les deux fiches sont bien deux ouvrages distincts (un tome 1 et un
   tome 2, par exemple). Écartez la carte, elle ne reviendra plus.
2. **Signaler le doublon** — un message part avec les deux fiches. Sur un conflit
   d'enregistrement la précision est facultative, le blocage étant évident ; dans tous les
   autres cas, **dites ce qui ne va pas**. Un signalement sans explication ne dit rien de plus
   que « regardez ».

## Écarter une paire

« Pas un doublon » retire la carte de la file sans rien supprimer. Les deux
fiches restent au catalogue, chacune de son côté. C'est le geste courant : la file propose des
rapprochements *probables*, et beaucoup n'en sont pas.

## Supprimer une fiche

La suppression d'une fiche existe pour les cas où il n'y a rien à fusionner — une saisie vide,
un doublon strict sans aucune donnée à récupérer. Elle est elle aussi **irréversible**, et le
système le rappelle avant de l'exécuter.
