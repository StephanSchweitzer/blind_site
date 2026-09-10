---
title: Statistiques
slug: statistiques
order: 15
---

# Statistiques

La page « Statistiques » répond à deux questions différentes : **où en est l'association** et
**qui a modifié quoi**. Elle est réservée aux Super Admins.

L'URL de cette page est https://eca-aveugles.fr/admin/stats

Si vous n'êtes pas Super Admin, cette adresse ne donne pas « accès refusé » : elle répond que
la page **n'existe pas**. C'est voulu. Un refus poli apprendrait à qui le lit qu'il y a
quelque chose à cet endroit ; une page introuvable n'apprend rien.

## Les indicateurs

En haut de page, une **période** : 2 semaines, 4 semaines, 3 mois, 6 mois. Tout ce qui suit
s'y rapporte. Un mois creux ne veut rien dire seul ; c'est la série qui parle.

Les compteurs sont rangés en trois familles — **Production**, **Demandes**, **Facturation** —
et le nombre affiché sur chaque onglet est le total de la période. La famille *Production*
suit ce que l'association fabrique : livres ajoutés, listes de livres, actualités publiées,
pistes audio modifiées.

Chaque carte porte le même dispositif : un **grand nombre** — le total sur la période — et
en dessous les **totaux hebdomadaires**, qui disent si ce total est régulier ou s'il tient
à une seule semaine. Une carte sans rien à montrer l'écrit (« Aucune donnée ») plutôt que
de dessiner une courbe plate qu'on prendrait pour une panne.

(1) La période, qui commande toute la page — (2) une carte et sa série hebdomadaire

![Statistiques - les indicateurs d'activité](/admin/aide/images/statistiques-01.jpg)

Les deux autres familles se lisent de la même façon. **Demandes** suit le flux des demandes
reçues et traitées ; **Facturation** suit les écritures de facturation — factures émises,
payées, soldées, et les règlements encaissés. C'est là qu'on regarde si le mois a rapporté
ce qu'il devait rapporter.

![Statistiques - la famille Facturation](/admin/aide/images/statistiques-02.jpg)

## Activité des permanents

Au-dessous, une grille : **une ligne par permanent, une colonne par jour**, et une case
d'autant plus foncée que la personne a fait plus de choses ce jour-là. L'échelle se lit en
bas, de « Moins » à « Plus ».

Les boutons au-dessus choisissent **ce que la grille compte** : livres ajoutés, événements de
facturation, demandes traitées, attributions traitées, listes de livres, actualités publiées,
pistes audio modifiées, ou toutes les modifications tracées. La grille ne montre qu'**une
seule** de ces mesures à la fois — c'est le bouton actif qui dit laquelle, et changer de
bouton change la lecture de toute la grille.

**Survolez une case** et elle dit la personne, le jour et le compte. **Cliquez-la** et le
détail s'ouvre : les enregistrements exacts qui font ce chiffre. C'est ce qui distingue cette
grille d'un tableau de bord décoratif — on peut toujours descendre jusqu'aux faits.

(1) Le bouton qui décide de ce que la grille compte

![Statistiques - l'activité des permanents](/admin/aide/images/statistiques-03.jpg)

Un mot d'usage : cette grille dit qui a fait *combien d'écritures*, pas qui a été utile. Une
permanente qui passe une matinée au téléphone avec une auditrice n'y laisse aucune trace.

## Membres

La dernière carte compte les membres, avec un filtre **Tous / Lecteurs / Auditeurs / Autres** :
l'effectif, les inscriptions de la période, les changements de statut, et les paiements
encaissés.

Sous ces quatre chiffres, un tableau reprend la même chose **par type de membre**, et sépare
deux choses qu'on confond volontiers : l'**effectif d'aujourd'hui** (total, actifs,
indisponibles, inactifs) et ce qui s'est passé **sur la période** (inscriptions, changements
de statut, encaissé). Un effectif ne varie pas ; ce qui varie, c'est la colonne de droite.

La barre du bas montre les sept derniers jours, inscriptions et changements de statut comptés
séparément.

![Statistiques - la carte Membres](/admin/aide/images/statistiques-04.jpg)

## Le journal des modifications

La seconde moitié de la page est un **journal** : chaque écriture faite dans Arbre Rose y
laisse une ligne — qui, quand, sur quelle fiche, et quelle valeur a remplacé quelle autre.

Il sert à répondre à « qui a changé cela, et quand ? » sans avoir à demander à la ronde. On
le filtre par **enregistrement** (titre, auteur, nom, adresse email), par **type
d'enregistrement**, par **auteur** de la modification, par **opération** — création,
modification, suppression, restauration — et par **période**. « Réinitialiser » remet tous
les filtres à zéro d'un coup.

Chaque ligne porte l'heure, la nature de l'opération, la fiche touchée avec son numéro, un
résumé lisible, l'auteur, et **le nombre de champs modifiés**. La flèche à gauche déplie le
détail : chaque champ touché, avec l'ancienne et la nouvelle valeur.

![Statistiques - le journal des modifications](/admin/aide/images/statistiques-05.jpg)

Certaines modifications peuvent être **annulées** depuis le journal. Toutes ne le peuvent pas :
quand la remise en état n'est plus possible — parce que ce qui a été modifié depuis rendrait
le retour incohérent — le système le dit plutôt que de faire semblant.

**Le journal ne conserve pas tout indéfiniment.** La base a une limite de taille, et au-delà
elle passerait en lecture seule : le journal se rogne donc tout seul, les lignes les plus
anciennes en premier. L'en-tête l'annonce sans détour — le nombre d'événements conservés, la
fenêtre encore couverte, et la place occupée. Si une vérification porte sur des faits anciens,
ne comptez pas la faire dans six mois : lisez cette ligne d'abord, elle dit jusqu'où le
journal remonte aujourd'hui.
