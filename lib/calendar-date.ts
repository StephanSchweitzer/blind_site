/**
 * Reading dates that are calendar dates rather than instants.
 *
 * `Book.publishedDate` is a year, stored as UTC midnight on 1 January
 * (`2018-01-01T00:00:00.000Z`). Read back with `new Date(v).getFullYear()` it
 * answers 2018 in Paris and **2017** anywhere west of Greenwich, because that
 * instant is still 31 December there. On a screen that only displays the year
 * that is a cosmetic slip; in the edit form it is not, because the year shown
 * is the year saved — so every open-and-save of a book walked the date back
 * twelve months, once per edit, for anyone in a timezone behind UTC.
 *
 * The rule these helpers enforce: a value that means "a day on the calendar"
 * must be read with the same UTC frame it was written in, never re-projected
 * into whoever happens to be looking at it. Timestamps (createdAt, lastSeenAt,
 * a payment's date) are the opposite case — those are real instants and should
 * keep being formatted locally.
 */

/** Leading `YYYY-MM-DD` of an ISO string — the cheapest correct read. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

interface CalendarParts {
    year: number;
    /** 1-12, as humans write months. */
    month: number;
    day: number;
}

function toCalendarParts(value: Date | string | null | undefined): CalendarParts | null {
    if (value == null || value === '') return null;

    if (typeof value === 'string') {
        // Serialised dates arrive here as ISO text; slicing avoids parsing
        // altogether, so no timezone can get involved.
        const m = ISO_DATE.exec(value.trim());
        if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };

        // Partial forms ("2018", "2018-05") — as Google Books returns them —
        // are parsed as UTC by the spec, so the UTC getters stay correct.
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return {
            year: parsed.getUTCFullYear(),
            month: parsed.getUTCMonth() + 1,
            day: parsed.getUTCDate(),
        };
    }

    if (Number.isNaN(value.getTime())) return null;
    return {
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
    };
}

/** Calendar year of a stored date, or null when there isn't one. */
export function calendarYear(value: Date | string | null | undefined): number | null {
    return toCalendarParts(value)?.year ?? null;
}

/** Calendar month, 1-12, zero-padded — for the form fields that want `MM`. */
export function calendarMonth(value: Date | string | null | undefined): string {
    const parts = toCalendarParts(value);
    return parts ? String(parts.month).padStart(2, '0') : '';
}

/** `JJ/MM/AAAA`, the French written form, without a timezone in sight. */
export function formatCalendarDate(value: Date | string | null | undefined, fallback = ''): string {
    const parts = toCalendarParts(value);
    if (!parts) return fallback;
    return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}
