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

    for repere in reperes:
        x0 = max(0, repere['x'] - MARGE)
        y0 = max(0, repere['y'] - MARGE)
        x1 = min(image.width - 1, repere['x'] + repere['w'] + MARGE)
        y1 = min(image.height - 1, repere['y'] + repere['h'] + MARGE)
        dessin.rounded_rectangle([x0, y0, x1, y1], radius=RAYON,
                                 outline=VERT, width=EPAISSEUR)

        numero = str(repere['n'])
        boite = dessin.textbbox((0, 0), numero, font=fonte)
        largeur, hauteur = boite[2] - boite[0], boite[3] - boite[1]
        y_numero = (y0 + y1) // 2 - hauteur // 2 - boite[1]

        # Le numero se pose a gauche du cadre ; s'il n'y a pas la place, il
        # passe dedans, en haut a gauche, plutot que de sortir de l'image.
        x_numero = x0 - largeur - 14
        if x_numero < 4:
            x_numero = x0 + 10
            y_numero = y0 + 6
        dessin.text((x_numero, y_numero), numero, font=fonte, fill=VERT)

        if repere.get('fleche'):
            fleche(dessin, x_pointe=x0 - largeur - 24, y=(y0 + y1) // 2)

    suffixe = chemin_image.suffix.lower()
    if suffixe in ('.jpg', '.jpeg'):
        image.save(chemin_image, quality=90, optimize=True)
    else:
        image.save(chemin_image)
    return len(reperes)


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
