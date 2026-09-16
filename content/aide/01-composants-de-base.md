---
title: Composants de base
slug: composants-de-base
order: 1
---

# Composants de base

## La barre de recherche

Toutes les barres de recherche du back-office fonctionnent de la même façon, que
vous cherchiez une demande, une attribution, une facture, un paiement, un livre
ou une personne.

**Elle cherche par mots, pas par phrase exacte.** Votre saisie est découpée en
mots, et chaque mot doit se retrouver quelque part sur la ligne — mais pas
forcément au même endroit. Vous pouvez donc mélanger dans une seule saisie ce
que vous avez sous les yeux : un auteur *et* un titre (« camus étranger »), un
prénom *et* un nom (« marie lusson »), un nom d'auditeur *et* le livre qu'il
a demandé. L'ordre des mots n'a aucune importance : « lusson marie » donne le
même résultat.

En contrepartie, un mot en trop réduit la liste à rien : « bernard morvan
facture » ne trouve rien si « facture » ne figure nulle part sur la ligne. Si
une recherche ne rend rien alors qu'elle devrait, **enlevez un mot**.

**L'apostrophe n'a pas d'importance.** Celle du clavier (`'`), celle des
traitements de texte (`’`), celle des vieilles fiches importées : les trois se
valent. « L'étranger » et « L’étranger » trouvent le même livre, quelle que
soit celle qui a été enregistrée dans la fiche.

**Le trait d'union non plus.** « Marie-Line », « Marie Line » et « MarieLine »
trouvent la même personne, que le nom ait été saisi avec un tiret ou sans.

**Les majuscules et les accents ne comptent pas** dans le catalogue et les
listes de livres : « etranger » trouve « L'Étranger ».

**Un numéro cherche un numéro.** Tapé seul, il désigne la ligne portant ce
numéro — la demande n° 1234, la facture n° 412 — et le « # » qu'affichent les
fiches (« #1234 ») peut être collé tel quel. Un numéro cherche aussi le texte :
« 100 » ramène la ligne 100 *et* les titres contenant 100, car les deux
lectures sont légitimes.

## Un modal

Un modal est un formulaire contextuel que j'utilise pour faciliter l'ajout, la suppression et la modification d'informations. Elle s'affiche au-dessus du contenu actuellement affiché. Pour la fermer, vous pouvez soit cliquer sur le bouton « Annuler », soit cliquer en dehors de du modal.

## Une tableau

Une tableau affiche les résultats de la recherche et présente des lignes cliquables qui vous permettent de modifier le contenu de votre recherche ou d'ajouter de nouvelles lignes à la base de données.

## Un formulaire

Un formulaire est l'élément de base de la plupart des interactions sur le Web. Il comporte des champs contenant des informations et, une fois validé, modifie, crée ou supprime les entrées correspondantes dans la base de données. La plupart de nos formulaires sont intégrés dans des fenêtres modales pour faciliter la tâche des permanents.

## Un champ

Un champ est une partie d'un formulaire dans laquelle il est possible de saisir des informations afin de modifier le contenu de la base de données lors de l'enregistrement du formulaire. Les informations modifiées dans les champs seront mises à jour lors de l'enregistrement et de l'envoi du formulaire.
