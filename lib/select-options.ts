/**
 * Helpers for selects and checkbox groups bound to a stored database value.
 *
 * Option lists shrink over time (a member type is retired, a language stops
 * being offered, a status is dropped) while the rows recorded under the old
 * value stay in the database. A Radix <Select> whose value matches no
 * <SelectItem> renders an EMPTY trigger — which reads as "this person has no
 * type / no status", invites the permanent to pick something just to fill the
 * blank, and quietly rewrites history on save.
 *
 * These helpers append the stored value to the options it is missing from, so
 * the current value always renders. The label maps in lib/*-enums.ts all fall
 * back to the raw value, so a truly unknown value still shows something.
 */

/** Options plus `current`, when it is set and not already offered. */
export function withCurrentValue(
    options: readonly string[],
    current: string | null | undefined,
): readonly string[] {
    if (!current) return options;
    return options.includes(current) ? options : [...options, current];
}

/** Same, for a multi-select bound to an array of stored values. */
export function withCurrentValues(
    options: readonly string[],
    current: readonly string[] | null | undefined,
): readonly string[] {
    const extra = (current ?? []).filter((v) => v && !options.includes(v));
    return extra.length === 0 ? options : [...options, ...new Set(extra)];
}

/** Is this stored value outside the offered options (i.e. a legacy value)? */
export function isLegacyValue(
    options: readonly string[],
    value: string | null | undefined,
): boolean {
    return !!value && !options.includes(value);
}
