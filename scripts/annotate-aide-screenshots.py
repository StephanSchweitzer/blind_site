# -*- coding: utf-8 -*-
"""
Dessine les reperes numerotes sur les captures du mode d'emploi.

Le texte du guide renvoie a des numeros : « (1) Selectionnez l'etat de la
facture ». Les captures d'origine portaient ces reperes a la main, au feutre
vert. Une capture refaite sans eux laisse le texte pointer dans le vide — c'est
exactement ce qui s'est produit la premiere fois.

Ici les rectangles ne sont pas traces a l'oeil : le script de capture
(capture-aide-screenshots.mjs) demande au navigateur la position REELLE de
chaque champ, et depose ces coordonnees dans un fichier « .reperes.json » a
cote de l'image. On ne fait donc que peindre — d'ou un cadrage juste au pixel,
la ou une main tremble.

Usage :
    python scripts/annotate-aide-screenshots.py                 (toutes)
    python scripts/annotate-aide-screenshots.py factures        (filtre)
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

IMAGES = Path(__file__).resolve().parent.parent / 'content' / 'aide' / 'images'

VERT = (22, 128, 58)      # le vert du feutre d'origine
EPAISSEUR = 4
RAYON = 14
MARGE = 6                 # air entre le champ et son cadre

# UNE RANGEE DE CHAMPS ETIQUETES (`rangee`, pose par la spec de la capture).
# Les cinq filtres des demandes ne sont separes que de 16 px. Avec MARGE des
# deux cotes, le trait gauche d'un cadre finissait a 2 px de la premiere
# lettre de son etiquette : une fois l'image reduite, le « F » de
# « Facturation » ou le « S » de « Suivi » se lisaient a moitie sous le vert.
# A droite du champ il n'y a pas de texte, seulement sa propre bordure et son
# chevron : le cadre s'y colle, et l'air ainsi gagne passe a gauche.
MARGE_RANGEE_GAUCHE = 10
MARGE_RANGEE_DROITE = 0
TAILLE_NUMERO = 34
POLICES = ['arialbd.ttf', 'segoeuib.ttf', 'DejaVuSans-Bold.ttf']


def police(taille):
    for nom in POLICES:
        try:
            return ImageFont.truetype(nom, taille)
        except OSError:
            continue
    return ImageFont.load_default()


def fleche(dessin, x_pointe, y, longueur=90):
    """Une fleche horizontale pointant vers la droite, vers x_pointe."""
    corps = EPAISSEUR + 2
    x_queue = x_pointe - longueur
    tete = 26
    dessin.line([(x_queue, y), (x_pointe - tete + 4, y)], fill=VERT, width=corps)
    dessin.polygon(
        [(x_pointe, y), (x_pointe - tete, y - tete // 2), (x_pointe - tete, y + tete // 2)],
        fill=VERT,
    )


def dessiner(chemin_image, reperes):
    image = Image.open(chemin_image).convert('RGB')
    dessin = ImageDraw.Draw(image)
    fonte = police(TAILLE_NUMERO)

    dessines = 0
    for repere in reperes:
        marge_g, marge_d = ((MARGE_RANGEE_GAUCHE, MARGE_RANGEE_DROITE)
                            if repere.get('rangee') else (MARGE, MARGE))
        x0 = max(0, repere['x'] - marge_g)
        y0 = max(0, repere['y'] - MARGE)
        x1 = min(image.width - 1, repere['x'] + repere['w'] + marge_d)
        y1 = min(image.height - 1, repere['y'] + repere['h'] + MARGE)

        # Un champ hors du cadrage rend un rectangle degenere (y1 <= y0), et
        # Pillow leve alors une exception qui emportait TOUTE la serie — les
        # captures suivantes restaient sans reperes sans que rien ne le dise.
        # Le cas arrive des qu'un modal defile : le bouton vise est reel, mais
        # il n'est pas dans l'image. On le signale et on continue.
        if x1 - x0 < EPAISSEUR * 2 or y1 - y0 < EPAISSEUR * 2:
            print('    ! repere %s hors cadrage, ignore' % repere['n'])
            continue

        dessines += 1
        dessin.rounded_rectangle([x0, y0, x1, y1], radius=RAYON,
                                 outline=VERT, width=EPAISSEUR)

        # Un cadre SANS numero : quand le texte nomme le bouton sans renvoyer a
        # un chiffre (« cliquez sur Demarrer l'enregistrement »), une pastille
        # « 1 » ferait chercher au lecteur un (1) qui n'existe nulle part.
        if repere.get('n') is None:
            if repere.get('fleche'):
                fleche(dessin, x_pointe=x0 - 12, y=(y0 + y1) // 2)
            continue

        numero = str(repere['n'])
        boite = dessin.textbbox((0, 0), numero, font=fonte)
        largeur, hauteur = boite[2] - boite[0], boite[3] - boite[1]

        # UNE PASTILLE SUR LE COIN, ET NON UN CHIFFRE POSE DANS LE CADRE.
        #
        # Le numero se mettait a gauche du cadre, et faute de place il retombait
        # DANS le cadre, en haut a gauche. Sur trois boutons cote a cote —
        # « Remettre en brouillon », « Marquer comme payee », « Solder la
        # facture » — les trois numeros se posaient donc en travers des trois
        # libelles, qu'on ne pouvait plus lire. Un repere qui masque ce qu'il
        # designe ne repere rien.
        #
        # La pastille est centree sur le COIN du cadre : a cheval dessus, elle
        # ne mord que l'angle, la ou aucun libelle ne commence. Le chiffre passe
        # en blanc sur le vert, lisible sur une interface claire comme sombre.
        #
        # Reste un cas que le coin haut-gauche ne sert pas : une RANGEE de
        # champs etiquetes, comme les cinq filtres des demandes. La, le coin
        # haut-gauche est le premier caractere de l'etiquette, et une etiquette
        # courte disparait entierement dessous — « Livre » mesure moins large
        # que la pastille. Le coin haut-DROIT, lui, donne sur le blanc qui suit
        # l'etiquette. D'ou « coin »: 'hd', pose par la spec de la capture.
        #
        # Et un dernier : un petit lien serre sous un titre (« Ajouter une
        # note »). Ses deux coins du haut tombent sur le titre, qui court
        # au-dessus de lui. « coin »: 'd' pose la pastille A DROITE du cadre, a
        # mi-hauteur, dans le vide qui suit le lien sur sa ligne.
        rayon = max(largeur, hauteur) // 2 + 9
        coin = repere.get('coin')
        if coin == 'd':
            ancre_x, ancre_y = x1 + rayon + 4, (y0 + y1) // 2
        else:
            ancre_x, ancre_y = (x1 if coin == 'hd' else x0), y0
        cx = min(max(ancre_x, rayon), image.width - rayon - 1)
        cy = min(max(ancre_y, rayon), image.height - rayon - 1)
        dessin.ellipse([cx - rayon, cy - rayon, cx + rayon, cy + rayon],
                       fill=VERT, outline=(255, 255, 255), width=2)
        dessin.text((cx - largeur // 2 - boite[0], cy - hauteur // 2 - boite[1]),
                    numero, font=fonte, fill=(255, 255, 255))

        if repere.get('fleche'):
            fleche(dessin, x_pointe=x0 - largeur - 24, y=(y0 + y1) // 2)

    suffixe = chemin_image.suffix.lower()
    if suffixe in ('.jpg', '.jpeg'):
        # 4:4:4 (`subsampling=0`), comme optimize-aide-images.py : le 4:2:0 par
        # defaut de Pillow bave sur le texte fin et les bordures d'un pixel —
        # et sur le vert des reperes eux-memes.
        image.save(chemin_image, quality=90, subsampling=0, optimize=True)
    else:
        image.save(chemin_image)
    return dessines


def main():
    filtre = sys.argv[1] if len(sys.argv) > 1 else None
    sidecars = sorted(IMAGES.glob('*.reperes.json'))
    if filtre:
        sidecars = [s for s in sidecars if filtre in s.name]
    if not sidecars:
        print('Aucun fichier de reperes. Lancer pnpm aide:shots d abord.')
        return

    total = 0
    for sidecar in sidecars:
        reperes = json.loads(sidecar.read_text(encoding='utf-8'))
        nom_image = sidecar.name.replace('.reperes.json', '')
        chemin = IMAGES / nom_image
        if not chemin.exists():
            print('  ! image absente : %s' % nom_image)
            continue
        n = dessiner(chemin, reperes)
        total += n
        print('  %-26s %d repere(s)' % (nom_image, n))
        sidecar.unlink()  # consomme : l'image porte desormais ses reperes

    print('\n%d repere(s) dessine(s) sur %d image(s).' % (total, len(sidecars)))


if __name__ == '__main__':
    main()
