import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, formattingLocale, isLocale, LOCALE_COOKIE } from "./config";

export async function getStoredLocale() {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await getStoredLocale();
  return {
    locale: formattingLocale(locale),
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
