// `hyphen` (déjà utilisé par react-pdf, en anglais) ne publie pas ses types.
// Seul ce qui sert ici est déclaré.
declare module 'hyphen/fr' {
    export function hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number }): string;
}
