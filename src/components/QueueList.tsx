"use client";

import type { JobItemProgress, MediaInfo } from "@/lib/types";
import { formatDuration, statusLabel } from "@/lib/format";

function Thumb({ src }: { src: string | null }) {
  return (
    <div className="relative h-[63px] w-28 shrink-0 overflow-hidden rounded-md bg-panel-raised">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

function ItemProgressBar({ item }: { item: JobItemProgress }) {
  const color =
    item.status === "error"
      ? "bg-error"
      : item.status === "done" || item.status === "skipped"
        ? "bg-success"
        : item.status === "cancelled"
          ? "bg-text-faint"
          : "bg-accent";
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-panel-raised">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(2, item.percent)}%` }} />
    </div>
  );
}

function StatusPill({ item }: { item: JobItemProgress }) {
  if (item.status === "downloading") {
    return (
      <div className="shrink-0 text-right text-xs">
        <div className="font-mono text-accent">{item.percent.toFixed(0)}%</div>
        {item.speed && <div className="font-mono text-text-faint">{item.speed}</div>}
      </div>
    );
  }
  const map: Record<string, string> = {
    done: "text-success bg-success-soft border-success-border",
    skipped: "text-success bg-success-soft border-success-border",
    error: "text-error bg-error-soft border-error-border",
    cancelled: "text-text-faint bg-panel-raised border-border",
    pending: "text-warning bg-warning-soft border-warning-border",
  };
  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${map[item.status] ?? map.pending}`}>
      {statusLabel(item.status)}
    </span>
  );
}

export function QueueList({
  info,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  onSelectAvailable,
  itemsByIndex,
}: {
  info: MediaInfo;
  selected: Set<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectAvailable: () => void;
  /** When a job is active/finished for this preview, live per-item progress keyed by playlist index. */
  itemsByIndex: Map<number, JobItemProgress> | null;
}) {
  const entries = info.entries ?? [];
  const unavailableCount = entries.filter((e) => !e.isAvailable).length;

  if (info.type === "video") {
    const progress = itemsByIndex?.get(1) ?? null;
    return (
      <div className="rounded-xl border border-border bg-panel p-4">
        <div className="flex gap-4">
          <Thumb src={info.thumbnail} />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[15px] font-medium leading-snug text-text">{info.title}</div>
            <div className="mt-1 text-sm text-text-muted">
              {info.uploader && <span>{info.uploader} · </span>}
              <span className="font-mono">{info.isLive ? "LIVE" : formatDuration(info.durationSeconds)}</span>
            </div>
            {info.isLive && (
              <div className="mt-2 text-xs text-warning">
                This is a live stream — the download runs until the stream ends.
              </div>
            )}
            {info.partOfPlaylistOnly && (
              <div className="mt-2 text-xs text-text-faint">
                This link also points at a playlist — only this single video will be downloaded.
              </div>
            )}
            {progress && (
              <div className="mt-2">
                <ItemProgressBar item={progress} />
              </div>
            )}
          </div>
          {progress && (
            <div className="shrink-0 self-center">
              <StatusPill item={progress} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="line-clamp-1 text-[15px] font-medium leading-snug text-text">
            {info.playlistTitle || "Playlist"}
          </div>
          <div className="mt-0.5 text-sm text-text-muted">
            {entries.length} video{entries.length === 1 ? "" : "s"}
            {unavailableCount > 0 && <span className="text-warning"> · {unavailableCount} unavailable</span>}
            {" · "}
            <span className="font-mono text-accent">{selected.size} selected</span>
          </div>
        </div>
        {!itemsByIndex && (
          <div className="flex shrink-0 items-center gap-3 text-xs">
            <button onClick={onSelectAll} className="text-text-muted hover:text-text transition-colors">
              All
            </button>
            <button onClick={onSelectAvailable} className="text-text-muted hover:text-text transition-colors">
              Available only
            </button>
            <button onClick={onSelectNone} className="text-text-muted hover:text-text transition-colors">
              None
            </button>
          </div>
        )}
      </div>
      <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
        {entries.map((e) => {
          const progress = itemsByIndex?.get(e.index) ?? null;
          return (
            <div key={`${e.index}-${e.id}`} className={`flex items-center gap-3 px-4 py-3 ${!e.isAvailable ? "opacity-50" : ""}`}>
              {!itemsByIndex && (
                <input
                  type="checkbox"
                  checked={selected.has(e.index)}
                  disabled={!e.isAvailable}
                  onChange={() => onToggle(e.index)}
                  className="h-4 w-4 shrink-0 rounded border-border-strong accent-accent"
                />
              )}
              <span className="w-6 shrink-0 text-right text-xs font-mono text-text-faint">{e.index}</span>
              <Thumb src={e.thumbnail} />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm text-text">{e.title}</div>
                {e.unavailableReason ? (
                  <div className="text-xs text-error">{e.unavailableReason} — will be skipped</div>
                ) : progress ? (
                  <ItemProgressBar item={progress} />
                ) : (
                  <div className="mt-0.5 text-xs font-mono text-text-faint">{formatDuration(e.durationSeconds)}</div>
                )}
              </div>
              {progress ? (
                <StatusPill item={progress} />
              ) : (
                <span className="shrink-0 text-xs font-mono text-text-faint">{formatDuration(e.durationSeconds)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
