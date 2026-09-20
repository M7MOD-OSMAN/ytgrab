"use client";

import { useTranslations } from "next-intl";

const CAPABILITIES = ["capSingle", "capPlaylists", "capAudio", "cap4k"] as const;

export function UrlBar({
  url,
  onUrlChange,
  onAnalyze,
  loading,
  disabled,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  onAnalyze: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  const t = useTranslations("Url");

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3.5 py-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-text-faint">
            <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" />
            <rect x="2.5" y="5" width="19" height="14" rx="4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {/* dir=auto, not ltr: a typed URL still reads LTR, but while the
              field is empty the placeholder must follow the page direction. */}
          <input
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !disabled) onAnalyze();
            }}
            placeholder={t("placeholder")}
            dir="auto"
            className="w-full min-w-0 bg-transparent text-[15px] text-text placeholder:text-text-faint focus:outline-none font-mono"
            spellCheck={false}
          />
          <button
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text) onUrlChange(text.trim());
              } catch {
                // clipboard permission denied — ignore, user can paste manually
              }
            }}
            className="shrink-0 rounded-md border border-border bg-panel-raised px-2.5 py-1 text-xs text-text-muted hover:text-text transition-colors"
          >
            {t("paste")}
          </button>
        </div>
        <button
          onClick={onAnalyze}
          disabled={disabled || loading || !url.trim()}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-[15px] font-medium text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Spinner /> {t("analyzing")}
            </>
          ) : (
            <>
              {t("analyze")}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="rtl:-scale-x-100">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {CAPABILITIES.map((c) => (
          <span key={c} className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {t(c)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
