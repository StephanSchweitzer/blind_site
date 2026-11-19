---
title: Paiements
slug: paiements
order: 9
---

# Paiements

La page « Paiements » permet de créer toutes les transactions financières et de les affecter à des personnes et à des factures.

Cette page fonctionne de la même manière que toutes les autres pages. Elle comporte (1) un tableau répertoriant les paiements existants, (2) un bouton permettant de créer de nouveaux paiements, (3) une barre de recherche pour rechercher des paiements existants, (4) ainsi que des filtres à appliquer à la recherche et au tableau.

L'URL de cette page est https://eca-aveugles.fr/admin/payments

![Paiements - capture 0](/admin/aide/images/paiements-00.jpg)

## Retrouver un paiement

Vous pouvez rechercher un paiement par le nom de la personne, le numéro du paiement, le numéro de la facture ou la référence de règlement (un numéro de chèque, par exemple).

(1) « **Exporter (CSV)** » enregistre la liste telle qu'elle est affichée (il n'apparaît pas sur une liste vide). (2) Le bouton « **Filtres** » ouvre les filtres : type, méthode de paiement, statut et (3) période.

Dès qu'une recherche ou un filtre est posé, « **Montant total** », sous le titre, donne la somme des paiements encaissés trouvés. Si la sélection contient aussi des paiements demandés mais pas encore reçus, la ligne se dédouble : « **Encaissé** » d'un côté, « **En attente** » de l'autre — les deux sommes ne s'additionnent pas. Dans le dossier d'une personne, elle donne ce qu'elle a payé ; les filtres n'y apparaissent qu'à partir de deux pages de paiements.

![Paiements - capture 1](/admin/aide/images/paiements-01.jpg)

## Ajout des paiements

Lorsque vous cliquez sur le bouton « Ajouter un paiement », le formulaire « Ajouter un paiement » s'ouvre. La première chose que vous devez choisir et préciser est le « Type de paiement », car cela déterminera les champs qui s'afficheront ou ne s'afficheront pas.

Les types de paiement sont les suivants : **cotisation**, **enregistrement**, **don** et **divers**.

![Paiements - capture 2](/admin/aide/images/paiements-02.jpg)

Pour la cotisation, vous devez indiquer (1) le type, (2) l'auditeur concerné, (3) l'année de la cotisation, juste sous l'auditeur, et (4) le montant qu'il a versé. (5) « Créer le paiement » enregistre le paiement.

![Paiements - capture 3](/admin/aide/images/paiements-03.jpg)

Pour l'enregistrement, vous devez d'abord sélectionner l'auditeur ; le champ « Facture liée » s'affichera alors.

![Paiements - capture 4](/admin/aide/images/paiements-04.jpg)

Ce champ montre les 10 dernières factures émises de l'auditeur. Pour l'ouvrir, cliquez sur le champ « Rechercher une facture », puis cliquez sur la ligne correspondant à la facture voulue.

![Paiements - capture 5](/admin/aide/images/paiements-05.jpg)

Une fois sélectionnée, la facture est associée au paiement en cours. Si le paiement couvre le total, la facture passe « Payée » toute seule.

![Paiements - capture 6](/admin/aide/images/paiements-06.jpg)

Les types « Don » et « Divers » ne nécessitent qu'un montant. Un don doit toutefois être associé à un donateur ; un paiement « Divers » peut rester anonyme.

![Paiements - capture 7](/admin/aide/images/paiements-07.jpg)

Quel que soit le type, vous pouvez préciser le mode de règlement dans le champ « Méthode de paiement » : chèque, espèce, carte bancaire, virement ou compte Auxi.

La « Date de paiement » est le jour où l'argent a été reçu. Elle est remplie avec la date du jour et elle est obligatoire : c'est elle qui fait compter le paiement comme encaissé.

Au bas de la page, vous pouvez, si vous le souhaitez, saisir des informations comptables. Pour ce faire, il suffit de cliquer sur la rubrique « Détails comptables » : comptable, fiscalité, et la case « Affectée » avec sa date, « Affectée le ». Le « N° de reçu » et la « Date d'émission », repris de l'ancienne base, n'apparaissent que sur un paiement qui en porte déjà.

À long terme, cela peut faciliter la clôture comptable de fin d'année grâce à la quantité accrue de données pouvant être filtrées. Sinon, il n'est pas nécessaire de les saisir.

![Paiements - capture 8](/admin/aide/images/paiements-08.jpg)

Une fois que vous avez saisi toutes les informations nécessaires, cliquez sur le bouton « Créer le paiement » : celui-ci sera alors enregistré et importé dans la base de données.

Un paiement lié à une facture affiche la facture correspondante.

![Paiements - capture 9](/admin/aide/images/paiements-09.jpg)

## Demander un paiement

Une cotisation ou un paiement « Divers » peut être enregistré **avant** d'être reçu — pour un appel de cotisation, par exemple. Sous le type, choisissez « **À demander** » plutôt que « **Déjà reçu** » : la date de paiement et la référence disparaissent, puisqu'il n'y a encore rien à noter, et le bouton devient « Créer la demande de paiement ».

Un enregistrement ne se demande pas ici : sa demande de paiement, c'est sa facture. Un don non plus — il est toujours déjà reçu.

### Statut d'un paiement

Le statut d'un paiement se lit sur ses dates, comme celui d'une demande ou d'une attribution : vous saisissez les dates, le statut suit. Les trois étapes s'affichent sous le choix « Déjà reçu » / « À demander ».

- **Pro-forma** : le paiement est créé, la demande n'est pas encore partie.
- **Demandé** : la « Date de la demande » est remplie — le jour où elle a été envoyée.
- **Encaissé** : la « Date de paiement » est remplie — l'argent est reçu.

Un paiement reçu sans avoir été demandé, le cas le plus courant, passe directement à « Encaissé ». Pour enregistrer le règlement d'un paiement demandé, ouvrez-le, choisissez « Déjà reçu » et indiquez la date de paiement, la méthode et la référence.

Seul un paiement encaissé compte : dans les montants, pour une cotisation « à jour », pour une facture payée. Une cotisation demandée mais pas reçue ne rend pas l'auditeur à jour. Le statut apparaît dans la liste, en tête de la fenêtre du paiement, et peut servir de filtre.

### Imprimer la pro-forma, la demande ou le reçu

En haut de la fenêtre d'un paiement, un bouton imprime le document qui correspond à son statut. Comme pour une facture, l'impression ouvre directement la fenêtre d'impression du navigateur ; « Enregistrer au format PDF » y est proposé.

- **Pro-forma** : « Imprimer la pro-forma » imprime le montant à régler, sans rien changer au paiement. « Envoyer la demande de paiement » demande une confirmation, date la demande du jour — le paiement passe à « Demandé » — puis l'imprime.
- **Demandé** : « Réimprimer la demande de paiement ». La date de la demande ne change pas.
- **Encaissé** : « Émettre le reçu » demande une confirmation, donne au reçu le numéro suivant de l'année (R-2026-0001, R-2026-0002…) et la date du jour, puis l'imprime. Ensuite, « Réimprimer le reçu » le ressort à l'identique.

Les documents portent le numéro du paiement : demandez à la personne de le reporter au dos de son chèque ou en référence de son virement.

Une fois le reçu émis, le montant, le type, la personne, les dates, la méthode et la référence du paiement ne se modifient plus : le reçu est parti, la base doit continuer de dire la même chose. Les observations et les détails comptables restent modifiables. Seul un super admin peut corriger un paiement dont le reçu est émis.

Le reçu atteste un encaissement. Ce n'est pas un reçu fiscal : il ne mentionne aucune réduction d'impôt.

## Modification des paiements

Pour modifier un paiement, cliquez sur la ligne que vous souhaitez modifier. Cela ouvrira le modal « Modifier le paiement ».

Ce fonctionnement est identique à celui de la fenêtre « Ajouter un paiement », à la différence que vous pouvez également (1) supprimer le paiement en bas de la page en cliquant sur le bouton « Supprimer le paiement ». (2) Pour enregistrer les modifications, cliquez sur le bouton « Enregistrer les modifications » ; cela met à jour l'entrée de la base de données avec les nouvelles informations que vous avez saisies dans les champs.

![Paiements - capture 10](/admin/aide/images/paiements-10.jpg)

C'est ici, et non sur la facture, que l'on corrige la référence, la méthode ou la date d'un règlement.

La suppression vous demande une confirmation.

![Paiements - capture 11](/admin/aide/images/paiements-11.jpg)
