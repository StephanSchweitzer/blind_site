/**
 * #12 — single source of truth for turning a user's postal address into display
 * lines, so the factures modal (EditBillModal) and the invoice PDF (BillPDF)
 * render identical text.
 */

export interface AddressLike {
    addressLine1?: string | null;
    addressSupplement?: string | null;
    city?: string | null;
    postalCode?: string | null;
    stateProvince?: string | null;
    country?: string | null;
    isDefault?: boolean | null;
}

/** The default address if flagged, otherwise the first one (fallback). */
export function pickDefaultAddress<T extends AddressLike>(
    addresses: T[] | null | undefined
): T | null {
    if (!addresses || addresses.length === 0) return null;
    return addresses.find((a) => a.isDefault) ?? addresses[0];
}

export interface FormatAddressOptions {
    /**
     * Upper-case the CODE POSTAL + LOCALITÉ line (and the country line), as
     * La Poste's norme d'adressage requires on anything that goes through the
     * mail. Off by default so on-screen display and the facture keep the
     * capitalisation the admin typed.
     */
    postalNorm?: boolean;
}

/** One address → human-readable lines. France is implied and omitted. */
export function formatAddressLines(
    address: AddressLike | null | undefined,
    options: FormatAddressOptions = {}
): string[] {
    if (!address) return [];
    const norm = (s: string) => (options.postalNorm ? s.toUpperCase() : s);
    const lines: string[] = [];
    if (address.addressLine1?.trim()) lines.push(address.addressLine1.trim());
    if (address.addressSupplement?.trim()) lines.push(address.addressSupplement.trim());
    const cityLine = [address.postalCode?.trim(), address.city?.trim()]
        .filter(Boolean)
        .join(' ');
    if (cityLine) lines.push(norm(cityLine));
    if (address.stateProvince?.trim()) lines.push(address.stateProvince.trim());
    const country = address.country?.trim();
    if (country && country.toLowerCase() !== 'france') lines.push(norm(country));
    return lines;
}

/**
 * Address lines for an envelope or an étiquette d'adresse. Same content as
 * formatAddressLines — deliberately the same builder, so a fix to one is a fix
 * to both — with the postal norm applied.
 */
export function mailingAddressLines(
    address: AddressLike | null | undefined
): string[] {
    return formatAddressLines(address, { postalNorm: true });
}

/** One address collapsed onto a single line, for pickers and list rows. */
export function formatAddressOneLine(
    address: AddressLike | null | undefined
): string {
    return formatAddressLines(address).join(', ');
}

/** Convenience: a user's default (or first) address → display lines. */
export function userAddressLines(
    addresses: AddressLike[] | null | undefined
): string[] {
    return formatAddressLines(pickDefaultAddress(addresses));
}
