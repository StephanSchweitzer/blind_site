# -*- coding: utf-8 -*-
"""
Masque les donnees personnelles dans les captures du mode d'emploi.

Le guide a ete redige a partir du systeme reel : les captures montrent de vrais
auditeurs, lecteurs et donateurs — noms, adresses electroniques, adresses
postales. Elles vivaient dans `public/`, que le matcher de middleware.ts ne couvre pas
(/admin, /auth/change-password, /profile) : une capture publiee la etait lisible
sans compte. Elles sont depuis servies par app/admin/aide/images/[name] — mais
l'expurgation reste necessaire, la confidentialite ne tenant pas a un seul
verrou.

Le masque est un RECTANGLE PLEIN, jamais un flou. Un flou ou une pixellisation
se renversent en partie ; des pixels remplaces, non. L'image est reencodee,
donc rien ne subsiste dessous — contrairement au caviardage d'un PDF, ou le
texte reste sous le rectangle.

Trois pieges, tous rencontres pour de vrai :

  * l'OCR COUPE les adresses electroniques (« x@gmail » puis « .com »), donc on
    condamne tout mot portant un « @ » plutot que d'exiger un domaine complet ;
  * une adresse postale ne ressemble a aucun patronyme : elle se reconnait a sa
    voie et a sa ligne « code postal + commune », d'ou des regles de LIGNE ;
  * fusionner des mots voisins dans l'ORDRE DE LECTURE produisait un rectangle
    geant en travers de l'interface quand deux colonnes se suivaient. On ne
    fusionne donc que des mots d'une meme ligne, colles horizontalement.

Chaine complete :
    1. powershell -File scripts/aide-ocr.ps1 -InputDir content/aide/images -OutFile ocr.json
    2. python scripts/redact-aide-screenshots.py ocr.json            (verification)
    3. python scripts/redact-aide-screenshots.py ocr.json --appliquer
    4. reprendre 1 puis 2 : le compte doit tomber a zero.

Ce script n'affiche JAMAIS le texte qu'il masque — seulement des comptes.
"""
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

IMAGES = Path(__file__).resolve().parent.parent / 'content' / 'aide' / 'images'
MARGE = 2          # l'OCR rogne les jambages
ECART_MAX = 2.2    # multiple de la hauteur du mot tolere entre deux mots fusionnes

TELEPHONE = re.compile(r'0[1-9](?:[ .\-]?\d{2}){4}')
# Un prenom peut etre compose : « Anne-Marie », « Jean-Pierre ». Chaque
# segment porte alors sa propre majuscule — d'ou la repetition, plutot qu'une
# simple minuscule apres la premiere lettre.
PRENOM = re.compile(r"^[A-ZÀ-ÝŒ][a-zà-ÿœ'’]+(?:[\-'’][A-ZÀ-ÝŒa-zà-ÿœ][a-zà-ÿœ'’]*)*$")
NOM_CAPS = re.compile(r"^[A-ZÀ-ÝŒ][A-ZÀ-ÝŒ'’\-]{1,}$")
VOIE = re.compile(
    r'\b\d{1,4}\s*(bis|ter)?\s*(rue|avenue|av|boulevard|bd|impasse|chemin|all[ée]e|'
    r'place|route|r[ée]sidence|b[âa]timent|quai|square|villa|cours|lieu[- ]dit)\b',
    re.I,
)
# La commune porte une majuscule (« 57950 MONTIGNY LES METZ »). L'exiger evite
# de confondre un code postal avec un decompte : « 15407 livres au total ».
CODE_POSTAL_VILLE = re.compile(r'\b\d{5}\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ\- ]{2,}')

UI_CAPS = {
    'ECA', 'PDF', 'CD', 'ID', 'TOTAL', 'MONTANT', 'OUVRAGES', 'NOTES', 'ADRESSES',
    'COORDONNEES', 'COORDONNÉES', 'INFORMATIONS', 'BASE', 'STATUT', 'HISTORIQUE',
    'DEMANDES', 'DEMANDE', 'FACTURE', 'FACTURES', 'PAIEMENT', 'PAIEMENTS', 'REF',
    'RÉF', 'CHANGER', 'LE', 'LA', 'DES', 'DU', 'SOUS', 'SECTION', 'AJOUT', 'ACTUEL',
    'MODIFICATION', 'GESTION', 'CATALOGUE', 'GENRES', 'LIVRES', 'LIVRE', 'FACTUREES',
    'MEMBRES', 'MEMBRE', 'AUDITEUR', 'AUDITEURS', 'LECTEUR', 'LECTEURS', 'FACTURÉES',
    'ATTRIBUTION', 'ATTRIBUTIONS', 'COMPTE', 'AUXI', 'DV', 'OK', 'TVA', 'SIRET',
    'CREATION', 'CRÉATION', 'ETAT', 'ÉTAT', 'EMISE', 'ÉMISE', 'PAYEE', 'PAYÉE',
}
UI_PRENOM = {
    'Le', 'La', 'Les', 'Un', 'Une', 'Des', 'Du', 'De', 'Date', 'Type', 'Format',
    'Etat', 'État', 'Mode', 'Creer', 'Créer', 'Mettre', 'Ajouter', 'Modifier',
    'Supprimer', 'Rechercher', 'Selectionner', 'Sélectionner', 'Montant',
    'Methode', 'Méthode', 'Reference', 'Référence', 'Annee', 'Année', 'Notes',
    'Observations', 'Telephone', 'Téléphone', 'Email', 'Prenom', 'Prénom', 'Nom',
    'Civilite', 'Civilité', 'Genre', 'Titre', 'Auteur', 'Editeur', 'Éditeur',
    'Page', 'Total', 'Statut', 'Historique', 'Voir', 'Retour', 'Suivant', 'Exporter',
}
TEST_STRINGS = {'stef', 'stephan', 'schweitz', 'schweitzer'}

# ─────────────────────────────────────────────────────────────────────────────
# NOMS RELEVES A LA RELECTURE
#
# Le motif « prenom + PATRONYME » suppose le patronyme en capitales, ce que
# l'application n'impose pas : « Catherine Porte » ou « Steffy Ref » lui
# echappent entierement. Elargir le motif a deux mots capitalises noircirait
# les titres d'ouvrages (« Belles Marines »), ce qui est pire.
#
# On note donc ici les noms VUS pendant la relecture. Un nom ajoute ici est
# masque PARTOUT ou il apparait, y compris dans les captures qu'on n'a pas
# rouvertes — c'est plus sur que de relever des coordonnees une par une.
# Les paires evitent les faux positifs : « porte » seul est un mot courant.
NOMS_CONNUS = {
    'catherine porte',
    'steffy ref',
    'philippe boyere',
}

# Les prenoms de ces noms, pris isolement.
#
# Dans un champ de recherche, le curseur colle au dernier mot et l'OCR rend
# « porte| » : la paire ne correspond plus, et le nom reste lisible. On part
# donc du prenom — sans ambiguite en francais courant — et on emporte le mot
# suivant, quoi qu'en ait fait l'OCR.
PRENOMS_CONNUS = {nom.split()[0] for nom in NOMS_CONNUS}

# Patronymes releves SEULS, sans prenom devant : un permanent tape volontiers
# « morvan » dans une barre de recherche. Choisis parce qu'aucun n'est un mot
# de l'interface — ne pas y mettre un terme courant.
NOMS_SIMPLES = {
    'morvan', 'raguenes', 'ruffin', 'bloom', 'estaun',
}

# ─────────────────────────────────────────────────────────────────────────────
# COLONNES NOMINATIVES
#
# Les motifs (prenom + PATRONYME, courriel, adresse) laissent passer tout ce
# qui sort du moule : « Philippe boyere EREA TOULOUSE LAUTREC » (un mot en
# minuscules au milieu), « Steffy Ref » (patronyme sans capitales), ou un
# courriel que l'OCR lit mal parce que la ligne est grisee.
#
# Dans un TABLEAU, la structure dit ce que les motifs ignorent : sous l'en-tete
# « Auditeur » il n'y a que des personnes. On noircit donc la colonne entiere.
# Le compromis est assume : masquer un peu trop abime une capture, laisser
# fuiter un nom abime une personne.
EN_TETES_NOMINATIFS = {
    'auditeur', 'auditeurs', 'lecteur', 'lecteurs', 'membres',
    'personne', 'personnes', 'client', 'clients', 'donateur', 'donateurs',
    'nom', 'prenom', 'email', 'e-mail', 'courriel', 'adresse',
    'beneficiaire', 'demandeur',
    # En-tetes en plusieurs mots : « Nom complet » laissait passer toute la
    # colonne, faute d'etre reconnu. « Type de membre » n'en est PAS un — c'est
    # pourquoi « membre » au singulier a quitte la liste ci-dessus.
    'nom complet', 'nom du membre', 'adresse email', 'ajoute par', 'ajoutee par',
}
# Sur les pages de listes, une pastille de role suit le nom : « X Lecteur de
# retour le ... ». Ce qui precede immediatement la pastille est donc un nom,
# meme quand le motif prenom + PATRONYME ne s'applique pas.
BADGES_ROLE = {'Lecteur', 'Auditeur', 'Donateur', 'Permanent', 'Administrateur',
               'Bienfaiteur', 'Tresoriere', 'Trésorière'}

# ─────────────────────────────────────────────────────────────────────────────
# MASQUES MANUELS — [x0, y0, x1, y1] en pixels de l'image d'origine.
#
# L'OCR ne masque que ce qu'il LIT. Sur disponibilites-01, il n'a jamais
# reconnu le prenom « Sylvie » : aucun mot, donc aucune boite, donc aucune
# regle ne pouvait l'atteindre. C'est la limite de fond du procede — d'ou la
# relecture a l'oeil, et cette liste pour en consigner le resultat.
#
# Ajouter ici tout reste repere lors de la relecture, puis relancer avec
# --appliquer sur les images d'origine.
MASQUES_MANUELS = {
    # Terme de recherche saisi, jamais lu par l'OCR (petit, gris, colle au
    # curseur). La ligne « Rechercher » est a y=187 : on couvre la zone de
    # saisie sans toucher au libelle ni a la croix de fermeture.
    # Les fleches vertes dessinees a la main passent SUR les noms des
    # demandeurs : l'OCR n'en tire plus que des bribes (« USEE », « eonl »).
    # Une ligne par demande, sous le titre de l'ouvrage qui, lui, doit rester.
    # En-tete du dossier : le nom s'affiche en gros, coupe en deux par la mise
    # en page, et l'OCR n'en rend que des bribes (« Fran », « LE ») — masquees
    # separement, elles laissaient le nom lisible. Le tableau dessous ne porte
    # qu'UNE ligne : la regle de colonne, qui demande deux valeurs alignees,
    # ne peut pas s'y appliquer.
    # Derniere ligne coupee par le bas de la fenetre : a demi rendue, l'OCR
    # n'en tire rien et elle n'apporte rien non plus au lecteur.
    'mon-compte-01.jpg': [
        [0, 884, 1440, 900],
    ],
    'membres-20.jpg': [
        [50, 85, 350, 212],
        [258, 703, 712, 762],
    ],
    'membres-21.jpg': [
        [50, 85, 350, 212],
        [258, 703, 712, 762],
    ],
    'factures-05.jpg': [
        [95, 286, 330, 304],
        [95, 343, 330, 361],
        [95, 400, 330, 418],
        [95, 457, 330, 475],
        [95, 514, 330, 532],
    ],
    'disponibilites-03.jpg': [
        [215, 168, 435, 210],
    ],
    'disponibilites-01.png': [
        [30, 826, 96, 862],       # prenom manque par l'OCR (colonne de gauche)
        [1035, 788, 1106, 824],   # le meme prenom, colonne de droite
    ],
}


# Ponctuation collee aux mots par l'OCR : guillemets francais, croix de
# fermeture d'un filtre, curseur de saisie. « catherine» » n'est pas
# « catherine », et le nom restait lisible dans un champ de recherche.
PONCTUATION = (' 	.,;:!?"()[]{}<>|*-'
                + chr(0x00AB) + chr(0x00BB)   # guillemets francais
                + chr(0x2019) + chr(0x2026)   # apostrophe courbe, points de suspension
                + chr(0x00D7) + "'")         # croix de fermeture, apostrophe droite


def mot_normalise(texte):
    return sans_accents((texte or '')).strip(PONCTUATION).lower()


def sans_accents(texte):
    return ''.join(
        c for c in unicodedata.normalize('NFD', texte)
        if unicodedata.category(c) != 'Mn'
    )


def lignes_de(mots):
    """Regroupe les mots consécutifs partageant la même ligne OCR."""
    groupes, courant = [], []
    for mot in mots:
        if courant and mot.get('ligne') != courant[-1].get('ligne'):
            groupes.append(courant)
            courant = []
        courant.append(mot)
    if courant:
        groupes.append(courant)
    return groupes


def detecter_dans_ligne(ligne):
    """Renvoie les listes de mots (d'une même ligne) à masquer."""
    a_masquer = []
    texte_ligne = ligne[0].get('ligne') or ' '.join((m.get('texte') or '') for m in ligne)

    # 1. Adresse postale : la ligne entière part, voie comme commune.
    if VOIE.search(texte_ligne) or CODE_POSTAL_VILLE.search(texte_ligne):
        return [(list(ligne), 'adresse')]

    i = 0
    while i < len(ligne):
        texte = (ligne[i].get('texte') or '').strip()
        if not texte:
            i += 1
            continue

        # 2. Courriel : l'OCR le coupe, donc on prend le mot au « @ » et ses
        #    voisins immédiats qui prolongent le domaine (« .com »).
        # Un « @ » seul ne fait pas une adresse : l'icone du bouton « Aide »
        # (point d'interrogation dans un cercle) se lit ainsi et se faisait
        # noircir. Une vraie adresse porte des caracteres autour.
        if '@' in texte and len(texte) >= 4 and any(c.isalnum() for c in texte):
            groupe = [ligne[i]]
            j = i + 1
            while j < len(ligne) and (ligne[j].get('texte') or '').startswith('.'):
                groupe.append(ligne[j])
                j += 1
            a_masquer.append((groupe, 'courriel'))
            i = j
            continue

        if TELEPHONE.search(texte.replace(' ', '')):
            a_masquer.append(([ligne[i]], 'telephone'))
            i += 1
            continue

        # L'OCR rend parfois « stef schweitz » en un seul mot : tester le mot
        # entier ne suffit donc pas, il faut regarder ses morceaux.
        if any(part in TEST_STRINGS for part in mot_normalise(texte).split()):
            groupe = [ligne[i]]
            if i + 1 < len(ligne):
                suivant = mot_normalise(ligne[i + 1].get('texte'))
                if suivant in TEST_STRINGS:
                    groupe.append(ligne[i + 1])
                    i += 1
            a_masquer.append((groupe, 'compte-de-test'))
            i += 1
            continue

        # 3. Un nom releve a la relecture, sur deux ou trois mots.
        trouve_connu = False
        for longueur in (3, 2):
            if i + longueur > len(ligne):
                continue
            groupe = ligne[i:i + longueur]
            assemble = ' '.join(mot_normalise(m.get('texte')) for m in groupe)
            if assemble in NOMS_CONNUS:
                a_masquer.append((groupe, 'nom-releve'))
                i += longueur
                trouve_connu = True
                break
        if trouve_connu:
            continue

        if mot_normalise(texte) in NOMS_SIMPLES:
            a_masquer.append(([ligne[i]], 'nom-releve'))
            i += 1
            continue

        if mot_normalise(texte) in PRENOMS_CONNUS:
            groupe = [ligne[i]]
            if i + 1 < len(ligne):
                suivant = (ligne[i + 1].get('texte') or '').strip()
                if suivant and any(c.isalpha() for c in suivant):
                    groupe.append(ligne[i + 1])
            a_masquer.append((groupe, 'nom-releve'))
            i += len(groupe)
            continue

        # 4. Ce qui precede une pastille de role est un nom.
        if texte in BADGES_ROLE and i > 0:
            groupe = []
            j = i - 1
            while j >= 0 and len(groupe) < 3:
                precedent = (ligne[j].get('texte') or '').strip()
                if not precedent or precedent in BADGES_ROLE:
                    break
                if precedent[:1].isupper() or precedent.isupper():
                    groupe.insert(0, ligne[j])
                    j -= 1
                else:
                    break
            if groupe:
                a_masquer.append((groupe, 'nom'))
            i += 1
            continue

        # 5. Prénom + PATRONYME, dans la même ligne uniquement.
        if PRENOM.match(texte) and texte not in UI_PRENOM:
            groupe = [ligne[i]]
            j = i + 1
            while j < len(ligne):
                suivant = (ligne[j].get('texte') or '').strip()
                if NOM_CAPS.match(suivant) and suivant not in UI_CAPS and len(suivant) > 1:
                    groupe.append(ligne[j])
                    j += 1
                else:
                    break
            if len(groupe) > 1:
                a_masquer.append((groupe, 'nom'))
                i = j
                continue
        i += 1
    return a_masquer


def boites_de(groupe):
    """
    Découpe un groupe en rectangles spatialement cohérents.

    Deux mots ne se rejoignent que s'ils se chevauchent verticalement et se
    touchent presque horizontalement — sans quoi deux colonnes voisines dans
    l'ordre de lecture fabriquent un rectangle en travers de la page.
    """
    ordonne = sorted(groupe, key=lambda m: m['x'])
    paquets, courant = [], [ordonne[0]]
    for mot in ordonne[1:]:
        precedent = courant[-1]
        ecart = mot['x'] - (precedent['x'] + precedent['w'])
        meme_ligne = abs(mot['y'] - precedent['y']) <= max(precedent['h'], mot['h']) * 0.7
        if meme_ligne and ecart <= max(precedent['h'], mot['h']) * ECART_MAX:
            courant.append(mot)
        else:
            paquets.append(courant)
            courant = [mot]
    paquets.append(courant)

    rectangles = []
    for paquet in paquets:
        x0 = min(m['x'] for m in paquet) - MARGE
        y0 = min(m['y'] for m in paquet) - MARGE
        x1 = max(m['x'] + m['w'] for m in paquet) + MARGE
        y1 = max(m['y'] + m['h'] for m in paquet) + MARGE
        rectangles.append((max(0, x0), max(0, y0), x1, y1))
    return rectangles


def zones_auteur(mots):
    """
    Les colonnes « Auteur » du catalogue.

    Un auteur de livre n'est pas une donnee personnelle a proteger : son nom est
    sur la couverture. Le masquer noircit la moitie du catalogue sans rien
    proteger — et rend la capture inutile la ou elle doit justement montrer un
    tableau de livres. On releve donc ces colonnes pour en exempter la regle des
    patronymes.
    """
    zones = []
    for mot in mots:
        if sans_accents((mot.get('texte') or '')).strip(' :').lower() not in ('auteur', 'auteurs'):
            continue
        meme_ligne = [m for m in mots
                      if abs(m['y'] - mot['y']) <= mot['h'] * 0.8 and m['x'] > mot['x']]
        droite = min((m['x'] for m in meme_ligne), default=mot['x'] + 400) - 8
        zones.append((mot['x'] - 10, mot['y'] + mot['h'], droite))
    return zones


ETIQUETTES_NOMINATIVES = {
    'prenom', 'nom', 'email', 'e-mail', 'courriel', 'ville', 'adresse',
    'complement', 'code postal', 'telephone fixe', 'telephone portable',
    'nom complet',
}

# Le texte d'invite d'un champ vide : il doit RESTER, c'est lui qui montre a
# quoi sert le champ. Aucun d'eux n'est une donnee saisie.
DEBUTS_INVITE = (
    'indiquer', 'selectionner', 'rechercher', 'ex:', 'ex :', 'ajouter',
    'filtrer', 'saisir', 'entrez', 'aucun', 'non ', 'choisir',
)


def champs_nominatifs(mots):
    """
    Les valeurs saisies sous une etiquette de formulaire identifiante.

    Sur la fiche d'un membre, « Prenom » et « Nom » sont deux champs distincts :
    aucun motif ne les relie, et « Francoise » / « COLLE » passaient tous les
    deux au travers. On masque donc ce qui se trouve SOUS l'etiquette, dans sa
    colonne — sauf le texte d'invite d'un champ vide, qui doit rester lisible.
    """
    rectangles = []
    connues = {sans_accents(e) for e in ETIQUETTES_NOMINATIVES}
    for i, mot in enumerate(mots):
        for longueur in (2, 1):
            groupe = mots[i:i + longueur]
            if len(groupe) < longueur:
                continue
            if any(abs(m['y'] - groupe[0]['y']) > groupe[0]['h'] for m in groupe):
                continue
            if ' '.join(mot_normalise(m.get('texte')) for m in groupe) not in connues:
                continue

            # L'etiquette doit etre COMPLETE. « Nom d'affichage » commence par
            # « Nom » : reconnaitre le premier mot seul faisait masquer la
            # moitie de la carte « Identifiants et securite ». Si un mot colle
            # a droite, l'etiquette est plus longue que ce qu'on a reconnu.
            suite = mots[i + longueur] if i + longueur < len(mots) else None
            if suite is not None:
                dernier = groupe[-1]
                colle = (abs(suite['y'] - dernier['y']) <= dernier['h'] * 0.8
                         and suite['x'] - (dernier['x'] + dernier['w']) <= dernier['h'] * 1.2)
                if colle:
                    continue

            gauche = groupe[0]['x'] - 8
            droite = gauche + max(groupe[0]['h'] * 22, 240)
            haut = groupe[0]['y'] + groupe[0]['h']
            bas = haut + groupe[0]['h'] * 4

            dedans = [
                m for m in mots
                if haut < m['y'] < bas and gauche <= m['x'] < droite
            ]
            if not dedans:
                break
            texte = ' '.join((m.get('texte') or '') for m in dedans).strip().lower()
            if texte.startswith(DEBUTS_INVITE):
                break
            rectangles.append((
                max(0, min(m['x'] for m in dedans) - MARGE),
                max(0, min(m['y'] for m in dedans) - MARGE),
                max(m['x'] + m['w'] for m in dedans) + MARGE,
                max(m['y'] + m['h'] for m in dedans) + MARGE,
            ))
            break
    return rectangles


def colonnes_nominatives(mots, hauteur=0):
    """
    Rectangles couvrant les colonnes de tableau qui portent des personnes.

    On repere l'en-tete, on borne la colonne par l'en-tete suivant a sa droite,
    puis on noircit de la premiere ligne sous l'en-tete jusqu'au dernier mot de
    la colonne.
    """
    connus = {sans_accents(e) for e in EN_TETES_NOMINATIFS}
    entetes = []
    i = 0
    while i < len(mots):
        trouve = None
        for longueur in (3, 2, 1):
            groupe = mots[i:i + longueur]
            if len(groupe) < longueur:
                continue
            # Un en-tete tient sur UNE ligne : ne pas coudre deux rangees.
            if any(abs(m['y'] - groupe[0]['y']) > groupe[0]['h'] for m in groupe):
                continue
            phrase = ' '.join(mot_normalise(m.get('texte')) for m in groupe)
            if phrase in connus:
                trouve = groupe
                break
        if trouve:
            # Absorber ce qui colle a droite : « Nom complet » n'arrive pas
            # toujours en deux mots consecutifs dans le flux de l'OCR, et
            # « Nom » seul echouait alors au test de cellule (son voisin
            # « complet » est trop proche pour passer pour une autre colonne).
            j = mots.index(trouve[-1]) + 1 if trouve[-1] in mots else len(mots)
            while j < len(mots):
                suivant = mots[j]
                precedent = trouve[-1]
                if abs(suivant['y'] - precedent['y']) > precedent['h'] * 0.8:
                    break
                if suivant['x'] - (precedent['x'] + precedent['w']) > precedent['h'] * 1.5:
                    break
                trouve = trouve + [suivant]
                j += 1

            # L'absorption sert a RETROUVER un en-tete que l'OCR a disperse
            # (« Nom complet »), pas a en inventer un : si ce qu'on a ramasse
            # n'est plus un en-tete connu, c'est une etiquette plus longue —
            # « Nom d'affichage » — et elle noircissait la carte entiere.
            if ' '.join(mot_normalise(m.get('texte')) for m in trouve) not in connus:
                i += 1
                continue

            entetes.append({
                'x': min(m['x'] for m in trouve),
                'y': min(m['y'] for m in trouve),
                'w': max(m['x'] + m['w'] for m in trouve) - min(m['x'] for m in trouve),
                'h': max(m['h'] for m in trouve),
            })
            i += len(trouve)
        else:
            i += 1
    if not entetes:
        return []

    rectangles = []
    for entete in entetes:
        # (a) Pas dans la barre de navigation : « Membres » y figure comme
        #     entree de menu et fabriquait une bande noire sur toute la page.
        if hauteur and entete['y'] < hauteur * 0.12:
            continue

        # (a bis) Une ligne d'en-tetes ne porte ni identifiant ni date.
        #
        # « Auditeur » est aussi une VALEUR : la pastille de type de membre.
        # Prise pour un en-tete, elle noircissait les colonnes « Type de
        # membre » et « Statut » sur toute leur hauteur. Une ligne de donnees
        # se trahit par son « #3054 » ou son « 5 juillet 2026 ».
        ligne_entiere = [m for m in mots if abs(m['y'] - entete['y']) <= entete['h'] * 0.8]
        if any(re.match(r'^#?\d', (m.get('texte') or '').strip()) for m in ligne_entiere):
            continue

        # (b) Une LIGNE D'EN-TETES, pas une etiquette de formulaire. Un tableau
        #     aligne plusieurs intitules sur la meme ligne (« ID | Lecteur |
        #     Livraison | Livre | ... ») ; un formulaire pose « Lecteur * » seul
        #     sur la sienne — et le prendre pour un en-tete noircissait la
        #     moitie du formulaire.
        sur_la_ligne = [m for m in mots if abs(m['y'] - entete['y']) <= entete['h'] * 0.8]
        if len(sur_la_ligne) < 4:
            continue

        # (c) Une CELLULE, pas un mot au milieu d'une phrase. « Date d'envoi au
        #     lecteur » contient « lecteur » et comptait quatre mots sur sa
        #     ligne : il passait pour un en-tete et noircissait le formulaire.
        #     Une cellule d'en-tete est separee de ses voisines par un vide.
        ecart_mini = entete['h'] * 2.5
        gauche_voisin = max((m['x'] + m['w'] for m in sur_la_ligne
                             if m['x'] + m['w'] <= entete['x']), default=None)
        droite_voisin = min((m['x'] for m in sur_la_ligne
                             if m['x'] >= entete['x'] + entete['w']), default=None)
        vide_gauche = gauche_voisin is None or (entete['x'] - gauche_voisin) >= ecart_mini
        vide_droite = droite_voisin is None or (droite_voisin - entete['x'] - entete['w']) >= ecart_mini
        if not (vide_gauche and vide_droite):
            continue

        # Les en-tetes de la meme ligne, pour borner la colonne a droite.
        # Strictement a DROITE de l'en-tete entier : sur « Nom complet », partir
        # de `entete['x']` prenait « complet » pour la colonne suivante et
        # reduisait le masque a un liseré.
        meme_ligne = [
            m for m in mots
            if abs(m['y'] - entete['y']) <= entete['h'] * 0.8
            and m['x'] >= entete['x'] + entete['w']
        ]
        droite = min((m['x'] for m in meme_ligne), default=None)
        gauche = entete['x'] - 6
        if droite is None:
            # Pas de colonne a droite : on s'arrete a la largeur de l'en-tete,
            # elargie, plutot que de noircir jusqu'au bord.
            droite = entete['x'] + max(entete['w'] * 3, 220)
        droite -= 8

        haut = entete['y'] + entete['h'] + 4
        dedans = [
            m for m in mots
            if m['y'] >= haut and m['x'] + m['w'] > gauche and m['x'] < droite
        ]
        if not dedans:
            continue

        # Exiger une VRAIE colonne sous l'en-tete.
        #
        # « Membres » figure aussi dans la barre de navigation : sans ce
        # controle, le mot du menu passait pour un en-tete de tableau et
        # noircissait une bande sur toute la hauteur de la page. Une colonne se
        # reconnait a ses valeurs alignees sur le bord gauche de son en-tete.
        # Deux valeurs alignees suffisent : sur membres-10, une fleche dessinee
        # par-dessus le tableau decale la lecture OCR de la moitie des lignes,
        # et exiger trois alignements laissait la colonne entiere en clair. Les
        # garde-fous en amont (pas de chiffre sur la ligne, cellule detachee,
        # hors barre de navigation) portent desormais le refus.
        alignes = [m for m in dedans if abs(m['x'] - entete['x']) <= 14]
        if len(alignes) < 2:
            continue

        # Une colonne de personnes ne contient pas QUE des nombres. Sur le
        # tableau de bord, les vignettes « Auditeurs / Lecteurs / Donateurs »
        # ressemblent a une ligne d'en-tetes, et leurs compteurs se faisaient
        # noircir.
        if all(re.fullmatch(r'[\d\s.,]+', (m.get('texte') or '').strip() or 'x')
               for m in alignes):
            continue

        # Prolonger d'une ligne au-dela du dernier mot LU.
        #
        # Une ligne grisee (survol, ligne desactivee) passe sous le seuil de
        # l'OCR : sur factures-01, un courriel y survivait alors que toute la
        # colonne etait noircie au-dessus. Le pas des lignes donne la mesure de
        # ce qu'il faut ajouter pour couvrir celle qu'on n'a pas vue.
        ordonnees = sorted({m['y'] for m in dedans})
        ecarts = [b - a for a, b in zip(ordonnees, ordonnees[1:]) if b - a > 4]
        ecarts.sort()
        pas = ecarts[len(ecarts) // 2] if ecarts else entete['h'] * 2
        bas = max(m['y'] + m['h'] for m in dedans) + int(pas * 1.5) + MARGE
        rectangles.append((max(0, gauche), haut, droite, bas))
    return rectangles


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    ocr = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
    appliquer = '--appliquer' in sys.argv

    total, touchees = Counter(), 0
    for nom_fichier in sorted(ocr):
        mots = ocr[nom_fichier].get('mots') or []
        if isinstance(mots, dict):
            mots = [mots]
        if not mots:
            continue

        rectangles, compte = [], Counter()
        for rect in MASQUES_MANUELS.get(nom_fichier, []):
            rectangles.append(tuple(rect))
            compte['manuel'] += 1
        for rect in champs_nominatifs(mots):
            rectangles.append(rect)
            compte['champ'] += 1
        for rect in colonnes_nominatives(mots, ocr[nom_fichier].get('hauteur', 0)):
            rectangles.append(rect)
            compte['colonne'] += 1
        exemptions = zones_auteur(mots)

        def dans_zone_auteur(rect):
            x0, y0, x1, _ = rect
            return any(x0 >= zx0 and x1 <= zx1 and y0 >= zy
                       for zx0, zy, zx1 in exemptions)

        for ligne in lignes_de(mots):
            for groupe, categorie in detecter_dans_ligne(ligne):
                for rect in boites_de(groupe):
                    if categorie == 'nom' and dans_zone_auteur(rect):
                        continue
                    rectangles.append(rect)
                    compte[categorie] += 1
        if not rectangles:
            continue

        touchees += 1
        total.update(compte)
        detail = ', '.join('%s x%d' % (c, n) for c, n in sorted(compte.items()))
        print('  %-26s %2d boite(s)  [%s]' % (nom_fichier, len(rectangles), detail))

        if appliquer:
            chemin = IMAGES / nom_fichier
            image = Image.open(chemin).convert('RGB')
            dessin = ImageDraw.Draw(image)
            for rect in rectangles:
                dessin.rectangle(list(rect), fill=(0, 0, 0))
            image.save(chemin, quality=88, optimize=True)

    print()
    print('%d image(s) concernee(s) sur %d' % (touchees, len(ocr)))
    for categorie, nombre in sorted(total.items()):
        print('  %-16s %d' % (categorie, nombre))
    if not appliquer and touchees:
        print('\nVerification seule. Relancer avec --appliquer pour masquer.')
    elif appliquer:
        print('\nMasques appliques. Refaire l OCR puis relancer sans --appliquer :')
        print('le compte doit tomber a zero.')


if __name__ == '__main__':
    main()
