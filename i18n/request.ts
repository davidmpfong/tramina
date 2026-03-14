import { getRequestConfig } from "next-intl/server";
import { defaultLocale, locales, type Locale } from "../i18n";

export default getRequestConfig(async ({ locale }) => {
  const selectedLocale = locales.includes(locale as Locale)
    ? (locale as Locale)
    : defaultLocale;

  return {
    locale: selectedLocale,
    messages: (await import(`../messages/${selectedLocale}.json`)).default
  };
});
