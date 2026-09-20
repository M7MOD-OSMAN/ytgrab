"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/i18n/actions";
import { LOCALES, type Locale } from "@/i18n/config";

const LABELS: Record<Locale, string> = { ar: "العربية", en: "English" };

export function LanguageToggle() {
  const t = useTranslations("Lang");
  const [pending, startTransition] = useTransition();
  // The Arabic locale carries a -u-nu-latn extension for digit formatting.
  const active = useLocale().startsWith("ar") ? "ar" : "en";

  return (
    <div
      role="group"
      aria-label={t("switch")}
      className={`flex items-center rounded-lg border border-border bg-panel p-0.5 ${pending ? "opacity-60" : ""}`}
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          disabled={pending}
          onClick={() => startTransition(() => void setLocale(code))}
          aria-pressed={active === code}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            active === code ? "bg-panel-raised text-text" : "text-text-muted hover:text-text"
          }`}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  );
}
