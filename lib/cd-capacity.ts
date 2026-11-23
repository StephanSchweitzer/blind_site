// lib/cd-capacity.ts
// No imports and no `@/…` aliases: lib/pricing.ts and the standalone scripts
// import this under plain Node, and the browser does too (the ZIP split).

/**
 * Ce que contient un CD, en octets — la seule définition du portail.
 *
 * Tout ce qui compte des CD part d'ici : le tarif d'une demande (3 € par CD,
 * lib/pricing.ts), le « N CD » de l'éditeur audio, et le découpage de « Tout
 * télécharger (ZIP) » en un dossier par CD (lib/audio/cd-split.ts). Un seul
 * chiffre, pour que le nombre de CD facturés soit celui qu'on grave.
 *
 * ## Pourquoi 720 Mo
 *
 * C'est la pratique des ECA, mesurée. Les anciens dossiers `1000` / `2000` /
 * `3000` (11 682 en novembre 2026, gravés de 2012 à 2025) remplissent leurs
 * disques jusqu'à 720 Mo et s'arrêtent là : 204 disques entre 710 et 720 Mo,
 * quatre au-dessus. Neuf fois sur dix, la piste suivante aurait encore tenu sur
 * le disque : la limite a été choisie, pas subie. Découpés à ce chiffre, 99 % de
 * ces dossiers retrouvent le nombre de CD sur lequel ils ont été gravés.
 *
 * Il garde une marge sous le disque lui-même. Un CD-R de 80 minutes (« 700 Mo »
 * sur la boîte, c'est-à-dire 700 Mio) contient environ 360 000 secteurs de
 * 2 048 octets, quelque 737 Mo de données ; le système de fichiers du disque
 * (tables ISO 9660 / Joliet) en prend sa part, et la capacité réelle varie un
 * peu selon le disque et le graveur.
 *
 * En Mo décimaux (10^6), comme l'affiche l'éditeur audio. Jusqu'au 23 novembre
 * 2026 le tarif comptait des tranches de 700 Mio (734 003 200 octets) : passer à
 * 720 Mo n'a retarifé aucune demande par lui-même — voir le récapitulatif dans
 * .claude/rules/billing-pricing.md.
 */
export const CD_CAPACITY_BYTES = 720_000_000;

/**
 * Nombre de CD pour un poids en octets, en tranches entamées. Toujours au moins
 * 1 : un enregistrement vide ou inconnu se compte comme un CD, jamais 0.
 *
 * C'est le compte au poids total. Le découpage réel (splitIntoCds) ne coupe
 * jamais une piste, et peut donc, très rarement, demander un disque de plus :
 * 2 dossiers sur 12 028 en novembre 2026.
 */
export function cdCountForBytes(bytes: number | null | undefined): number {
    if (!bytes || bytes <= 0) return 1;
    return Math.max(1, Math.ceil(bytes / CD_CAPACITY_BYTES));
}
