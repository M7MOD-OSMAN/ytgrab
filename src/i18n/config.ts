export const LOCALES = ["ar", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const dirOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

// The UI is full of Latin-digit durations, versions and percentages that plain
// "ar" would clash with by formatting numbers as Arabic-Indic.
export const formattingLocale = (locale: Locale) => (locale === "ar" ? "ar-u-nu-latn" : locale);
