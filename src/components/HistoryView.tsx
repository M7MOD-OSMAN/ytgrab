"use client";

import { useMemo, useState } from "react";
import type { JobSnapshot } from "@/lib/types";

type Filter = "all" | "completed" | "failed" | "playlists" | "audio";

function matches(job: JobSnapshot, filter: Filter): boolean {
  switch (filter) {
    case "completed":
      return job.status === "completed";
    case "failed":
      return job.status === "error" || job.status === "cancelled";
    case "playlists":
      return job.options.isPlaylist;
    case "audio":
      return job.options.kind === "audio";
    default:
      return true;
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function StatusBadge({ job }: { job: JobSnapshot }) {
  const map: Record<JobSnapshot["status"], string> = {
    completed: "text-success bg-success-soft border-success-border",
    error: "text-error bg-error-soft border-error-border",
    cancelled: "text-text-faint bg-panel-raised border-border",
    running: "text-accent bg-accent-soft border-accent/30",
    queued: "text-warning bg-warning-soft border-warning-border",
  };
  const label: Record<JobSnapshot["status"], string> = {
    completed: "Completed",
    error: "Failed",
    cancelled: "Cancelled",
    running: "Downloading",
    queued: "Queued",
  };
  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${map[job.status]}`}>
      {label[job.status]}
    </span>
  );
}

export function HistoryView({
  jobs,
  onOpenFolder,
  onCleanup,
  onCancel,
}: {
  jobs: JobSnapshot[];
  onOpenFolder: (dir: string) => void;
  onCleanup: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => [...jobs].sort((a, b) => b.createdAt - a.createdAt), [jobs]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((j) => {
      if (!matches(j, filter)) return false;
      if (!q) return true;
      return j.options.url.toLowerCase().includes(q) || j.items.some((i) => i.title.toLowerCase().includes(q));
    });
  }, [sorted, filter, query]);

  const counts = useMemo(
    () => ({
      all: jobs.length,
      completed: jobs.filter((j) => j.status === "completed").length,
      failed: jobs.filter((j) => j.status === "error" || j.status === "cancelled").length,
      playlists: jobs.filter((j) => j.options.isPlaylist).length,
      audio: jobs.filter((j) => j.options.kind === "audio").length,
    }),
    [jobs]
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-text sm:text-[28px]">
          Download history
        </h1>
        <p className="mt-1 text-[15px] text-text-muted">Downloads started from this app this session.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search history by title or URL…"
          className="flex-1 rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All ${counts.all}`} />
          <FilterChip
            active={filter === "completed"}
            onClick={() => setFilter("completed")}
            label={`Completed ${counts.completed}`}
          />
          <FilterChip active={filter === "playlists"} onClick={() => setFilter("playlists")} label={`Playlists ${counts.playlists}`} />
          <FilterChip active={filter === "audio"} onClick={() => setFilter("audio")} label={`Audio ${counts.audio}`} />
          <FilterChip active={filter === "failed"} onClick={() => setFilter("failed")} label={`Failed / cancelled ${counts.failed}`} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel px-4 py-10 text-center text-sm text-text-muted">
          {jobs.length === 0 ? "Nothing downloaded yet this session." : "No downloads match that filter."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((job) => (
            <HistoryRow key={job.id} job={job} onOpenFolder={onOpenFolder} onCleanup={onCleanup} onCancel={onCancel} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  job,
  onOpenFolder,
  onCleanup,
  onCancel,
}: {
  job: JobSnapshot;
  onOpenFolder: (dir: string) => void;
  onCleanup: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const firstThumb = job.items[0];
  const active = job.status === "running" || job.status === "queued";
  const title =
    job.items.length === 1
      ? job.items[0]?.title
      : `${job.items.length} video${job.items.length === 1 ? "" : "s"}${job.options.isPlaylist ? " · playlist" : ""}`;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-panel p-4">
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-panel-raised text-text-faint">
        {job.options.kind === "audio" ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" />
          </svg>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text">{title || job.options.url}</div>
        <div className="mt-0.5 truncate text-xs text-text-muted">
          {relativeTime(job.createdAt)}
          {" · "}
          {job.completedItems}/{job.totalItems} item{job.totalItems === 1 ? "" : "s"}
          {firstThumb?.error && <span className="text-error"> · {firstThumb.error}</span>}
        </div>
      </div>

      <StatusBadge job={job} />

      <div className="flex shrink-0 items-center gap-2">
        {active ? (
          <button
            onClick={() => onCancel(job.id)}
            className="rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors"
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              onClick={() => onOpenFolder(job.outputDir)}
              className="rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors"
            >
              Open folder
            </button>
            {job.status !== "completed" && (
              <button
                onClick={() => onCleanup(job.id)}
                className="rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-border transition-colors"
              >
                Clean up
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "border-accent bg-accent-soft text-accent" : "border-border bg-panel text-text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}
