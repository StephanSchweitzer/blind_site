import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formats a French phone number as pairs: "0612345678" -> "06 12 34 56 78".
// Also normalizes a leading "+33"/"33" international prefix to "0".
export function formatFrenchPhone(raw?: string | null): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('33') && digits.length === 11) digits = '0' + digits.slice(2);
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
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
