/**
 * Les dimensions d'un JPEG ou d'un PNG, lues dans son en-tête.
 *
 * react-pdf place une image à sa taille INTRINSÈQUE quand on ne lui en donne
 * pas. Une capture de 2048 px de large déborde alors la page, et le bloc —
 * marqué `wrap={false}`, une capture coupée en deux ne montrant plus rien —
 * ne peut ni tenir ni se couper : le rendu abandonne sur un « unsupported
 * number ». Ni `width: '100%'` ni `maxHeight` ne suffisent, le rapport étant
 * conservé à partir de la taille d'origine.
 *
 * On calcule donc la taille finale nous-mêmes. Quelques octets d'en-tête
 * suffisent : inutile de décoder l'image, et inutile d'ajouter une dépendance
 * pour lire deux entiers.
 */

export interface Dimensions {
    largeur: number;
    hauteur: number;
}

function dimensionsPng(buffer: Buffer): Dimensions | null {
    // 8 octets de signature, puis le bloc IHDR : longueur, type, largeur, hauteur.
    if (buffer.length < 24) return null;
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { largeur: buffer.readUInt32BE(16), hauteur: buffer.readUInt32BE(20) };
}

function dimensionsJpeg(buffer: Buffer): Dimensions | null {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

    let position = 2;
    while (position < buffer.length - 9) {
        if (buffer[position] !== 0xff) {
            position++;
            continue;
        }
        const marqueur = buffer[position + 1];
        // SOF0…SOF15 portent la taille ; SOF4 (0xc4), SOF8 (0xc8) et SOF12
        // (0xcc) n'en sont pas — ce sont des tables et des extensions.
        const estSOF =
            marqueur >= 0xc0 && marqueur <= 0xcf &&
            marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc;
        if (estSOF) {
            return {
                hauteur: buffer.readUInt16BE(position + 5),
                largeur: buffer.readUInt16BE(position + 7),
            };
        }
        position += 2 + buffer.readUInt16BE(position + 2);
    }
    return null;
}

export function dimensionsImage(buffer: Buffer, format: 'jpg' | 'png'): Dimensions | null {
    try {
        return format === 'png' ? dimensionsPng(buffer) : dimensionsJpeg(buffer);
    } catch {
        return null;
    }
}

/**
 * La taille d'affichage, en points, tenant dans la boîte donnée sans déformer
 * l'image. On n'agrandit jamais : une petite capture agrandie ne gagne aucune
 * lisibilité, elle perd juste en netteté.
 */
export function taillePourBoite(
    dimensions: Dimensions,
    largeurMax: number,
    hauteurMax: number
): Dimensions {
    const facteur = Math.min(
        largeurMax / dimensions.largeur,
        hauteurMax / dimensions.hauteur,
        1
    );
    return {
        largeur: Math.round(dimensions.largeur * facteur),
        hauteur: Math.round(dimensions.hauteur * facteur),
    };
}
