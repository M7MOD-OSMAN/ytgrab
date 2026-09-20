"use client";

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
              ? `Downloading — ${job.completedItems} of ${job.totalItems}`
              : job.status === "completed"
                ? `Done — ${job.completedItems} of ${job.totalItems}`
                : job.status === "cancelled"
                  ? "Cancelled"
                  : "Failed"}
          </span>
          {failedCount > 0 && <span className="text-xs text-error">{failedCount} failed</span>}
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
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={onOpenFolder}
                className="rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors"
              >
                Open folder
              </button>
              {job.status !== "completed" && (
                <button
                  onClick={onCleanup}
                  className="rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-border transition-colors"
                >
                  Remove partial files
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
        Saving to <span className="font-mono">{job.outputDir}</span>
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
