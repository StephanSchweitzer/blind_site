import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
