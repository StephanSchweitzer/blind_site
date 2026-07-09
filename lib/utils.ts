import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formats a phone number for display, country-aware.
// - Numbers written in national form (no leading "+") are assumed to belong to
//   `defaultCountry` (France for ECA): "0612345678" -> "06 12 34 56 78".
// - Numbers with an explicit country code are auto-detected: a home-country
//   number is shown national, a foreign one international, e.g.
//   "+12133734253" -> "+1 213 373 4253", "+442079460958" -> "+44 20 7946 0958".
// - Anything unparseable is returned trimmed but otherwise unchanged, so a
//   half-typed value in a form field is never mangled.
export function formatPhone(raw?: string | null, defaultCountry: CountryCode = 'FR'): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parsed = parsePhoneNumberFromString(
    trimmed,
    trimmed.startsWith('+') ? undefined : defaultCountry,
  );
  if (!parsed) return trimmed;
  return parsed.country === defaultCountry
    ? parsed.formatNational()
    : parsed.formatInternational();
}

export function generatePassword(length = 12): string {
  const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const specialChars = '!@#$%^&*()_-+=<>?';

  const allChars = upperChars + lowerChars + numbers + specialChars;

  let password =
      upperChars.charAt(Math.floor(Math.random() * upperChars.length)) +
      lowerChars.charAt(Math.floor(Math.random() * lowerChars.length)) +
      numbers.charAt(Math.floor(Math.random() * numbers.length)) +
      specialChars.charAt(Math.floor(Math.random() * specialChars.length));

  for (let i = 4; i < length; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  password = password.split('')
      .sort(() => Math.random() - 0.5)
      .join('');

  return password;
}
