"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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

function relativeTime(ts: number, t: ReturnType<typeof useTranslations<"Time">>): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("justNow");
  if (min < 60) return t("minutes", { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("hours", { count: hr });
  const day = Math.floor(hr / 24);
  return t("days", { count: day });
}

function StatusBadge({ job }: { job: JobSnapshot }) {
  const t = useTranslations("JobStatus");
  const map: Record<JobSnapshot["status"], string> = {
    completed: "text-success bg-success-soft border-success-border",
    error: "text-error bg-error-soft border-error-border",
    cancelled: "text-text-faint bg-panel-raised border-border",
    running: "text-accent bg-accent-soft border-accent/30",
    queued: "text-warning bg-warning-soft border-warning-border",
    paused: "text-warning bg-warning-soft border-warning-border",
  };
  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${map[job.status]}`}>
      {t(job.status)}
    </span>
  );
}

export function HistoryView({
  jobs,
  onOpenFolder,
  onCleanup,
  onCancel,
  onPause,
  onResume,
}: {
  jobs: JobSnapshot[];
  onOpenFolder: (dir: string) => void;
  onCleanup: (id: string) => void;
  onCancel: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const t = useTranslations("History");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => [...jobs].sort((a, b) => b.createdAt - a.createdAt), [jobs]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((j) => {
      if (!matches(j, filter)) return false;
      if (!q) return true;
      return (
        j.options.url.toLowerCase().includes(q) ||
        (j.options.playlistTitle ?? "").toLowerCase().includes(q) ||
        j.items.some((i) => i.title.toLowerCase().includes(q))
      );
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
          {t("title")}
        </h1>
        <p className="mt-1 text-[15px] text-text-muted">{t("subtitle")}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="flex-1 rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={t("filterAll")} count={counts.all} />
          <FilterChip
            active={filter === "completed"}
            onClick={() => setFilter("completed")}
            label={t("filterCompleted")}
            count={counts.completed}
          />
          <FilterChip
            active={filter === "playlists"}
            onClick={() => setFilter("playlists")}
            label={t("filterPlaylists")}
            count={counts.playlists}
          />
          <FilterChip active={filter === "audio"} onClick={() => setFilter("audio")} label={t("filterAudio")} count={counts.audio} />
          <FilterChip active={filter === "failed"} onClick={() => setFilter("failed")} label={t("filterFailed")} count={counts.failed} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel px-4 py-10 text-center text-sm text-text-muted">
          {jobs.length === 0 ? t("empty") : t("noMatch")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((job) => (
            <HistoryRow
              key={job.id}
              job={job}
              onOpenFolder={onOpenFolder}
              onCleanup={onCleanup}
              onCancel={onCancel}
              onPause={onPause}
              onResume={onResume}
            />
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
  onPause,
  onResume,
}: {
  job: JobSnapshot;
  onOpenFolder: (dir: string) => void;
  onCleanup: (id: string) => void;
  onCancel: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const t = useTranslations("History");
  const tJob = useTranslations("Job");
  const tTime = useTranslations("Time");
  const firstThumb = job.items[0];
  const active = job.status === "running" || job.status === "queued";
  const paused = job.status === "paused";
  // A playlist is named by its own title; its size moves to the tag beside it.
  const title = job.options.isPlaylist
    ? job.options.playlistTitle || t("videoCount", { count: job.items.length })
    : job.items[0]?.title;

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
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium text-text">
            <bdi>{title || job.options.url}</bdi>
          </div>
          {job.options.isPlaylist && (
            <span className="shrink-0 whitespace-nowrap rounded border border-border px-1.5 py-px text-[11px] text-text-muted">
              {t("videoCount", { count: job.items.length }) + t("playlistSuffix")}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-text-muted">
          {relativeTime(job.createdAt, tTime)}
          {" · "}
          {t("items", { done: job.completedItems, total: job.totalItems })}
          {firstThumb?.error && <span className="text-error"> · {firstThumb.error}</span>}
        </div>
      </div>

      <StatusBadge job={job} />

      <div className="flex shrink-0 items-center gap-2">
        {active || paused ? (
          <>
            {active ? (
              <button onClick={() => onPause(job.id)} className={ROW_BUTTON}>
                {tJob("pause")}
              </button>
            ) : (
              <button
                onClick={() => onResume(job.id)}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover transition-colors"
              >
                {tJob("resume")}
              </button>
            )}
            <button onClick={() => onCancel(job.id)} className={ROW_BUTTON}>
              {tJob("cancel")}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onOpenFolder(job.outputDir)}
              className="rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors"
            >
              {tJob("openFolder")}
            </button>
            {job.status !== "completed" && (
              <button
                onClick={() => onCleanup(job.id)}
                className="rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-border transition-colors"
              >
                {t("cleanUp")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const ROW_BUTTON =
  "rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors";

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "border-accent bg-accent-soft text-accent" : "border-border bg-panel text-text-muted hover:text-text"
      }`}
    >
      {label}
      <span className="font-mono opacity-70">{count}</span>
    </button>
  );
}
