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
        x0 = max(0, repere['x'] - MARGE)
        y0 = max(0, repere['y'] - MARGE)
        x1 = min(image.width - 1, repere['x'] + repere['w'] + MARGE)
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
        rayon = max(largeur, hauteur) // 2 + 9
        cx = min(max(x0, rayon), image.width - rayon - 1)
        cy = min(max(y0, rayon), image.height - rayon - 1)
        dessin.ellipse([cx - rayon, cy - rayon, cx + rayon, cy + rayon],
                       fill=VERT, outline=(255, 255, 255), width=2)
        dessin.text((cx - largeur // 2 - boite[0], cy - hauteur // 2 - boite[1]),
                    numero, font=fonte, fill=(255, 255, 255))

        if repere.get('fleche'):
            fleche(dessin, x_pointe=x0 - largeur - 24, y=(y0 + y1) // 2)

    suffixe = chemin_image.suffix.lower()
    if suffixe in ('.jpg', '.jpeg'):
        image.save(chemin_image, quality=90, optimize=True)
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
