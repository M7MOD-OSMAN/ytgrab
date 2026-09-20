"use client";

import { useTranslations } from "next-intl";
import type { JobSnapshot } from "@/lib/types";
import { Spinner } from "./UrlBar";

export function JobSummaryBar({
  job,
  onCancel,
  onOpenFolder,
  onCleanup,
}: {
  job: JobSnapshot;
  onCancel: () => void;
  onOpenFolder: () => void;
  onCleanup: () => void;
}) {
  const t = useTranslations("Job");
  const pct = job.totalItems > 0 ? Math.round((job.completedItems / job.totalItems) * 100) : 0;
  const failedCount = job.items.filter((i) => i.status === "error").length;
  const active = job.status === "running" || job.status === "queued";

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${statusDotColor(job.status)}`} />
          <span className="text-sm font-medium text-text">
            {active
              ? t("downloading", { done: job.completedItems, total: job.totalItems })
              : job.status === "completed"
                ? t("done", { done: job.completedItems, total: job.totalItems })
                : job.status === "cancelled"
                  ? t("cancelled")
                  : t("failed")}
          </span>
          {failedCount > 0 && <span className="text-xs text-error">{t("failedCount", { count: failedCount })}</span>}
        </div>
        <div className="flex items-center gap-2">
          {active ? (
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M6 6h12v12H6z" fill="currentColor" />
              </svg>
              {t("cancel")}
            </button>
          ) : (
            <>
              <button
                onClick={onOpenFolder}
                className="rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors"
              >
                {t("openFolder")}
              </button>
              {job.status !== "completed" && (
                <button
                  onClick={onCleanup}
                  className="rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-border transition-colors"
                >
                  {t("removePartial")}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
        <div
          className={`h-full rounded-full transition-all ${active ? "bg-accent" : job.status === "completed" ? "bg-success" : "bg-text-faint"}`}
          style={{ width: `${Math.max(active ? 2 : pct, pct)}%` }}
        />
      </div>

      {job.errorMessage && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-error">
          {active && <Spinner className="mt-0.5 shrink-0" />}
          {job.errorMessage}
        </div>
      )}

      <div className="mt-1.5 truncate text-xs text-text-faint">
        {t("savingTo")}{" "}
        <span className="font-mono" dir="ltr">
          {job.outputDir}
        </span>
      </div>
    </div>
  );
}

function statusDotColor(status: JobSnapshot["status"]): string {
  switch (status) {
    case "running":
    case "queued":
      return "bg-accent animate-pulse";
    case "completed":
      return "bg-success";
    case "cancelled":
      return "bg-text-faint";
    default:
      return "bg-error";
  }
}
