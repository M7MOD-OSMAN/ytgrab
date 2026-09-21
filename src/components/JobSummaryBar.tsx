"use client";

import { useTranslations } from "next-intl";
import { isYoutubeRefusal, type JobSnapshot } from "@/lib/types";
import { Spinner } from "./UrlBar";
import { PathText } from "./ui/PathText";

const BUTTON =
  "flex items-center gap-1.5 rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors";

export function JobSummaryBar({
  job,
  onCancel,
  onPause,
  onResume,
  onOpenFolder,
  onCleanup,
}: {
  job: JobSnapshot;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
  onOpenFolder: () => void;
  onCleanup: () => void;
}) {
  const t = useTranslations("Job");
  const pct = job.totalItems > 0 ? Math.round((job.completedItems / job.totalItems) * 100) : 0;
  const failedCount = job.items.filter((i) => i.status === "error").length;
  const running = job.status === "running" || job.status === "queued";
  const paused = job.status === "paused";
  const counts = { done: job.completedItems, total: job.totalItems };

  const label = running
    ? t("downloading", counts)
    : paused
      ? t("paused", counts)
      : job.status === "completed"
        ? t("done", counts)
        : job.status === "cancelled"
          ? t("cancelled")
          : t("failed");

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(job.status)}`} />
          <span className="text-sm font-medium text-text">{label}</span>
          {failedCount > 0 && <span className="text-xs text-error">{t("failedCount", { count: failedCount })}</span>}
        </div>

        <div className="flex items-center gap-2">
          {running && (
            <>
              <button onClick={onPause} className={BUTTON}>
                <PauseIcon />
                {t("pause")}
              </button>
              <button onClick={onCancel} className={BUTTON}>
                <StopIcon />
                {t("cancel")}
              </button>
            </>
          )}
          {paused && (
            <>
              <button
                onClick={onResume}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover transition-colors"
              >
                <PlayIcon />
                {t("resume")}
              </button>
              <button onClick={onCancel} className={BUTTON}>
                <StopIcon />
                {t("cancel")}
              </button>
            </>
          )}
          {!running && !paused && (
            <>
              <button onClick={onOpenFolder} className={BUTTON}>
                {t("openFolder")}
              </button>
              {job.status !== "completed" && (
                <button onClick={onCleanup} className={`${BUTTON} text-text-muted hover:text-text`}>
                  {t("removePartial")}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
        <div
          className={`h-full rounded-full transition-all ${barColor(job.status)}`}
          style={{ width: `${running ? Math.max(2, pct) : pct}%` }}
        />
      </div>

      {paused && <div className="mt-2 text-xs text-warning">{t("pausedNote")}</div>}

      {running && job.retryAttempt > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
          <Spinner className="shrink-0" />
          {t("retrying", { attempt: job.retryAttempt, max: job.maxRetries })}
        </div>
      )}
      {!running && !paused && job.items.some((i) => i.status === "error" && isYoutubeRefusal(i.error)) && (
        <div className="mt-2 text-xs text-text-muted">{t("refusedHint")}</div>
      )}

      {job.errorMessage && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-error">
          {running && <Spinner className="mt-0.5 shrink-0" />}
          {job.errorMessage}
        </div>
      )}

      <div className="mt-3 flex min-w-0 items-baseline gap-1.5 border-t border-border pt-2.5 text-xs text-text-faint">
        <span className="shrink-0">{t("savingTo")}</span>
        <PathText path={job.outputDir} className="min-w-0 truncate font-mono" />
      </div>
    </div>
  );
}

function statusDotColor(status: JobSnapshot["status"]): string {
  switch (status) {
    case "running":
    case "queued":
      return "bg-accent animate-pulse";
    case "paused":
      return "bg-warning";
    case "completed":
      return "bg-success";
    case "cancelled":
      return "bg-text-faint";
    default:
      return "bg-error";
  }
}

function barColor(status: JobSnapshot["status"]): string {
  switch (status) {
    case "running":
    case "queued":
      return "bg-accent";
    case "paused":
      return "bg-warning";
    case "completed":
      return "bg-success";
    default:
      return "bg-text-faint";
  }
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

// Media controls keep their direction in RTL, so this isn't mirrored.
function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 5v14l12-7L7 5Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6h12v12H6z" fill="currentColor" />
    </svg>
  );
}
