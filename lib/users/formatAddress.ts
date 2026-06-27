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

/** One address → human-readable lines. France is implied and omitted. */
export function formatAddressLines(address: AddressLike | null | undefined): string[] {
    if (!address) return [];
    const lines: string[] = [];
    if (address.addressLine1?.trim()) lines.push(address.addressLine1.trim());
    if (address.addressSupplement?.trim()) lines.push(address.addressSupplement.trim());
    const cityLine = [address.postalCode?.trim(), address.city?.trim()]
        .filter(Boolean)
        .join(' ');
    if (cityLine) lines.push(cityLine);
    if (address.stateProvince?.trim()) lines.push(address.stateProvince.trim());
    const country = address.country?.trim();
    if (country && country.toLowerCase() !== 'france') lines.push(country);
    return lines;
}

/** Convenience: a user's default (or first) address → display lines. */
export function userAddressLines(
    addresses: AddressLike[] | null | undefined
): string[] {
    return formatAddressLines(pickDefaultAddress(addresses));
}
