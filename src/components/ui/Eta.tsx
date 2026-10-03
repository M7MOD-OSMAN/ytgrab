"use client";

import { useTranslations } from "next-intl";

// Rounded to whole minutes: an estimate claiming seconds would read as more precise than it is.
export function useFormatEta() {
  const t = useTranslations("Eta");
  return (seconds: number) => {
    if (seconds < 60) return t("lessThanMinute");
    const total = Math.round(seconds / 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return t("minutes", { m });
    return m === 0 ? t("hours", { h }) : t("hoursMinutes", { h, m });
  };
}
