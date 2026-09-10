# -*- coding: utf-8 -*-
"""
Allege les captures du mode d'emploi, sans les rendre illisibles.

Les captures partent deux fois : dans /admin/aide, ou chaque image passe par
la route gardee (donc jamais par le CDN d'images de Next), et dans le PDF de
/admin/aide/pdf, qui les charge TOUTES en memoire d'un coup. Le poids du
dossier n'est donc pas un detail d'hebergement : c'est ce qui faisait tomber
le rendu du PDF en 503.

Trois gestes, dans cet ordre :

  1. RAMENER A LA LARGEUR UTILE. Vingt-trois captures faisaient 2048 px de
     large. Le PDF les repose dans une boite de 499 pt ; l'ecran ne leur donne
     pas 900. Au-dela de LARGEUR_MAX on ne paie que du transfert.

  2. TOUT EN JPEG. Les dix PNG du dossier n'utilisaient pas leur couche alpha
     — un aplat opaque stocke sans perte, c'est-a-dire cher. Le PDF y gagne
     aussi : @react-pdf/renderer n'accepte que JPEG et PNG, un seul format
     restant fait un chemin de moins ou se tromper.

  3. REENCODER SANS SOUS-ECHANTILLONNER LA CHROMINANCE (`subsampling=0`).
     Sur une photo, 4:2:0 ne se voit pas ; sur une capture d'interface, il
     bave sur le texte fin et les bordures d'un pixel. Une qualite un peu
     plus basse en 4:4:4 rend un fichier plus petit ET plus net qu'une
     qualite haute en 4:2:0.

Le script est IDEMPOTENT : il n'ecrit un fichier que s'il y gagne, et une
seconde execution ne rejoue donc pas une compression par-dessus l'autre. Un
JPEG reencode dix fois perd ce qu'aucun octet ne rend.

La conversion PNG -> JPG renomme des fichiers CITES par le guide. Le script
reecrit donc lui-meme les references dans `content/aide/*.md` et dans les
specs de `scripts/capture-aide-screenshots.mjs` — un lien casse dans le guide
est un lien silencieux.

Usage :
    python scripts/optimize-aide-images.py            (verification, n'ecrit rien)
    python scripts/optimize-aide-images.py --appliquer
"""
import re
import sys
from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
IMAGES = RACINE / 'content' / 'aide' / 'images'
MARKDOWN = RACINE / 'content' / 'aide'
SPECS = RACINE / 'scripts' / 'capture-aide-screenshots.mjs'

# La boite du PDF fait 499 pt de large. 1200 px la couvre a 2,4x, ce qui tient
# l'ecran haute densite comme l'impression, sans payer les 2048 px que personne
# n'affiche.
LARGEUR_MAX = 1200
QUALITE = 78

# En deca, le gain ne paie pas une generation de recompression.
GAIN_MINIMAL = 0.04


def encoder(image: Image.Image) -> tuple[bytes, Image.Image]:
    """Rend le JPEG et l'image telle qu'elle sera relue (pour la mesurer)."""
    import io

    if image.width > LARGEUR_MAX:
        hauteur = round(image.height * LARGEUR_MAX / image.width)
        image = image.resize((LARGEUR_MAX, hauteur), Image.LANCZOS)

    # Une capture n'a pas d'alpha utile (verifie avant conversion) ; l'aplatir
    # sur du blanc plutot que de laisser PIL choisir un fond noir.
    if image.mode in ('RGBA', 'LA', 'P'):
        image = image.convert('RGBA')
        fond = Image.new('RGB', image.size, (255, 255, 255))
        fond.paste(image, mask=image.getchannel('A'))
        image = fond
    elif image.mode != 'RGB':
        image = image.convert('RGB')

    tampon = io.BytesIO()
    image.save(
        tampon,
        format='JPEG',
        quality=QUALITE,
        optimize=True,
        progressive=True,
        subsampling=0,  # 4:4:4 — voir l'en-tete : le texte fin ne survit pas a 4:2:0.
    )
    return tampon.getvalue(), image


def alpha_utilisee(image: Image.Image) -> bool:
    if image.mode not in ('RGBA', 'LA'):
        return False
    return image.getchannel('A').getextrema()[0] < 255


def reecrire_references(renommages: dict[str, str], appliquer: bool) -> int:
    """Fait suivre les noms changes dans le guide et dans les specs."""
    touches = 0
    cibles = sorted(MARKDOWN.glob('*.md')) + ([SPECS] if SPECS.exists() else [])
    for fichier in cibles:
        texte = fichier.read_text(encoding='utf-8')
        neuf = texte
        for avant, apres in renommages.items():
            neuf = neuf.replace(avant, apres)
        if neuf != texte:
            touches += 1
            if appliquer:
                fichier.write_text(neuf, encoding='utf-8')
    return touches


def main() -> int:
    appliquer = '--appliquer' in sys.argv
    if not IMAGES.is_dir():
        print(f'Dossier introuvable : {IMAGES}')
        return 1

    avant_total = 0
    apres_total = 0
    renommages: dict[str, str] = {}
    reencodes = 0
    inchanges = 0
    gardes_png: list[str] = []

    for chemin in sorted(IMAGES.iterdir()):
        if chemin.suffix.lower() not in ('.jpg', '.jpeg', '.png'):
            continue

        poids_avant = chemin.stat().st_size
        avant_total += poids_avant

        with Image.open(chemin) as image:
            image.load()
            # Une transparence reellement utilisee interdit le JPEG : on laisse
            # le fichier tel quel plutot que de l'aplatir en douce.
            if alpha_utilisee(image):
                gardes_png.append(chemin.name)
                apres_total += poids_avant
                inchanges += 1
                continue
            donnees, _ = encoder(image)

        vers_jpg = chemin.suffix.lower() == '.png'
        destination = chemin.with_suffix('.jpg') if vers_jpg else chemin

        # Un PNG devient JPEG meme sans gain : c'est le format unique qu'on
        # cherche, pas seulement l'octet.
        gain = 1 - len(donnees) / poids_avant
        if not vers_jpg and gain < GAIN_MINIMAL:
            apres_total += poids_avant
            inchanges += 1
            continue

        apres_total += len(donnees)
        reencodes += 1
        if vers_jpg:
            renommages[chemin.name] = destination.name

        if appliquer:
            destination.write_bytes(donnees)
            if vers_jpg and destination != chemin:
                chemin.unlink()

    fichiers_touches = reecrire_references(renommages, appliquer)

    verbe = 'reencodees' if appliquer else 'a reencoder'
    print(f'{reencodes} captures {verbe}, {inchanges} laissees telles quelles')
    if renommages:
        print(f'{len(renommages)} PNG -> JPG, references mises a jour dans {fichiers_touches} fichiers')
    if gardes_png:
        print(f'alpha reellement utilisee, laissees en PNG : {", ".join(gardes_png)}')
    print(
        f'{avant_total / 1e6:.2f} Mo -> {apres_total / 1e6:.2f} Mo '
        f'({(1 - apres_total / avant_total) * 100:.0f} % de moins)'
    )
    if not appliquer:
        print('\nVerification seule. Relancer avec --appliquer pour ecrire.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
