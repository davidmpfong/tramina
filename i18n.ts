import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "es", "km"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export default getRequestConfig(async ({ locale }) => {
  const selectedLocale = locales.includes(locale as Locale)
    ? (locale as Locale)
    : defaultLocale;

  return {
    locale: selectedLocale,
    messages: (await import(`./messages/${selectedLocale}.json`)).default
  };
});
