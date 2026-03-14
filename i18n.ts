export const locales = ["en", "es", "km"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
