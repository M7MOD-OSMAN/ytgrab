"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { EntrySize, JobItemProgress, MediaKind, MediaInfo, QualityChoice } from "@/lib/types";
import { formatBytes, formatDuration } from "@/lib/format";

// The download merges a video stream with an audio one, so the figure that
// matters depends on both the media kind and the chosen quality.
function sizeFor(entry: EntrySize | undefined, kind: MediaKind, quality: QualityChoice): number | null {
  if (!entry) return null;
  return (kind === "audio" ? entry.audio : entry.video[quality]) ?? null;
}

function Tag({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      dir="ltr"
      className={`shrink-0 rounded border border-border px-1.5 py-px font-mono text-[11px] leading-4 ${
        strong ? "text-text-muted" : "text-text-faint"
      }`}
    >
      {children}
    </span>
  );
}

const CHIP_TONE = {
  default: "border-border text-text-muted",
  accent: "border-accent/30 bg-accent-soft text-accent",
  warning: "border-warning-border bg-warning-soft text-warning",
};

function Chip({ children, tone = "default" }: { children: ReactNode; tone?: keyof typeof CHIP_TONE }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${CHIP_TONE[tone]}`}>
      {children}
    </span>
  );
}

// Duration and size share one line under the title, in the same place for
// every row whether or not a download is running.
function MetaLine({
  lead,
  duration,
  bytes,
  pending,
}: {
  lead?: ReactNode;
  duration: string;
  bytes: number | null;
  pending: boolean;
}) {
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs">
      {lead}
      <Tag>{duration}</Tag>
      {bytes != null ? (
        <Tag strong>{formatBytes(bytes)}</Tag>
      ) : pending ? (
        <span aria-hidden="true" className="inline-block h-4.5 w-14 animate-pulse rounded border border-border bg-panel-raised" />
      ) : null}
    </div>
  );
}

function Thumb({ src }: { src: string | null }) {
  return (
    <div className="relative h-[63px] w-28 shrink-0 overflow-hidden rounded-md border border-border bg-panel-raised">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

const BAR_COLOR: Record<JobItemProgress["status"], string> = {
  downloading: "bg-accent",
  paused: "bg-warning",
  done: "bg-success",
  skipped: "bg-success",
  error: "bg-error",
  cancelled: "bg-text-faint",
  pending: "bg-transparent",
};

function ItemProgressBar({ item }: { item: JobItemProgress }) {
  // A queued item hasn't started, so it shows an empty track rather than a sliver.
  const width = item.status === "pending" ? 0 : Math.max(2, item.percent);
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-panel-raised">
      <div className={`h-full rounded-full transition-all ${BAR_COLOR[item.status]}`} style={{ width: `${width}%` }} />
    </div>
  );
}

const PILL: Record<Exclude<JobItemProgress["status"], "downloading">, string> = {
  done: "text-success bg-success-soft border-success-border",
  skipped: "text-success bg-success-soft border-success-border",
  error: "text-error bg-error-soft border-error-border",
  cancelled: "text-text-faint bg-panel-raised border-border",
  pending: "text-warning bg-warning-soft border-warning-border",
  paused: "text-warning bg-warning-soft border-warning-border",
};

// Lives in a fixed-width column so every row's progress bar ends at the same
// point, whether the status is a short pill or a percent with a speed under it.
function StatusCell({ item }: { item: JobItemProgress }) {
  const t = useTranslations("Status");
  return (
    <div className="flex w-32 shrink-0 justify-end">
      {item.status === "downloading" ? (
        <div className="text-end leading-tight">
          <div className="font-mono text-sm font-semibold tabular-nums text-accent" dir="ltr">
            {item.percent.toFixed(0)}%
          </div>
          {item.speed && (
            <div className="mt-0.5 whitespace-nowrap font-mono text-[11px] text-text-faint" dir="ltr">
              {item.speed}
            </div>
          )}
        </div>
      ) : (
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${PILL[item.status]}`}
        >
          {item.status === "paused" && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
          )}
          {t(item.status)}
        </span>
      )}
    </div>
  );
}

function SelectButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-2.5 py-1 text-text-muted hover:bg-panel-raised hover:text-text transition-colors"
    >
      {children}
    </button>
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
  sizes,
  sizing,
  quality,
  kind,
}: {
  info: MediaInfo;
  selected: Set<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectAvailable: () => void;
  /** When a job is active/finished for this preview, live per-item progress keyed by playlist index. */
  itemsByIndex: Map<number, JobItemProgress> | null;
  /** Download sizes keyed by playlist index; fills in progressively. */
  sizes: Map<number, EntrySize>;
  sizing: boolean;
  quality: QualityChoice;
  kind: MediaKind;
}) {
  const t = useTranslations("Queue");
  const entries = info.entries ?? [];
  const unavailableCount = entries.filter((e) => !e.isAvailable).length;

  // Only the selected rows count toward the total, matching what the primary
  // download button would actually fetch.
  let totalBytes: number | null = null;
  for (const index of selected) {
    const bytes = sizeFor(sizes.get(index), kind, quality);
    if (bytes != null) totalBytes = (totalBytes ?? 0) + bytes;
  }

  if (info.type === "video") {
    const progress = itemsByIndex?.get(1) ?? null;
    return (
      <div className="rounded-xl border border-border bg-panel p-4">
        <div className="flex items-center gap-4">
          <Thumb src={info.thumbnail} />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[15px] font-medium leading-snug text-text">{info.title}</div>
            <MetaLine
              lead={info.uploader ? <span className="me-1 truncate text-text-muted">{info.uploader}</span> : undefined}
              duration={info.isLive ? t("live") : formatDuration(info.durationSeconds)}
              bytes={info.isLive ? null : sizeFor(sizes.get(1), kind, quality)}
              pending={sizing && !info.isLive}
            />
            {info.isLive && <div className="mt-2 text-xs text-warning">{t("liveNote")}</div>}
            {info.partOfPlaylistOnly && <div className="mt-2 text-xs text-text-faint">{t("playlistOnlyNote")}</div>}
            {progress && <ItemProgressBar item={progress} />}
          </div>
          {progress && <StatusCell item={progress} />}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <div className="line-clamp-1 text-[15px] font-semibold leading-snug text-text">
            {info.playlistTitle || t("playlist")}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip>{t("videos", { count: entries.length })}</Chip>
            {unavailableCount > 0 && <Chip tone="warning">{t("unavailable", { count: unavailableCount })}</Chip>}
            <Chip tone="accent">{t("selected", { count: selected.size })}</Chip>
            {totalBytes != null ? (
              <Chip>
                {/* Label and value stay separate so neither drags the other into the wrong direction. */}
                <span>{t("total")}</span>
                <bdi className="font-mono text-text" dir="ltr">
                  {formatBytes(totalBytes)}
                </bdi>
                {sizing && <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
              </Chip>
            ) : sizing ? (
              <Chip>
                <span className="text-text-faint">{t("sizing")}</span>
              </Chip>
            ) : null}
          </div>
        </div>
        {!itemsByIndex && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-bg p-0.5 text-xs">
            <SelectButton onClick={onSelectAll}>{t("all")}</SelectButton>
            <SelectButton onClick={onSelectAvailable}>{t("availableOnly")}</SelectButton>
            <SelectButton onClick={onSelectNone}>{t("none")}</SelectButton>
          </div>
        )}
      </div>

      <div className="max-h-112 divide-y divide-border overflow-y-auto">
        {entries.map((e) => {
          const progress = itemsByIndex?.get(e.index) ?? null;
          return (
            <div
              key={`${e.index}-${e.id}`}
              className={`flex items-center gap-3 px-4 py-3 ${!e.isAvailable ? "opacity-50" : ""}`}
            >
              {!itemsByIndex && (
                <input
                  type="checkbox"
                  checked={selected.has(e.index)}
                  disabled={!e.isAvailable}
                  onChange={() => onToggle(e.index)}
                  className="h-4 w-4 shrink-0 rounded border-border-strong accent-accent"
                />
              )}
              <span className="w-6 shrink-0 text-center font-mono text-xs tabular-nums text-text-faint">{e.index}</span>
              <Thumb src={e.thumbnail} />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm leading-snug text-text">{e.title}</div>
                {e.unavailableReason ? (
                  <div className="mt-1 text-xs text-error">{t("willSkip", { reason: e.unavailableReason })}</div>
                ) : (
                  <MetaLine
                    duration={formatDuration(e.durationSeconds)}
                    bytes={sizeFor(sizes.get(e.index), kind, quality)}
                    pending={sizing}
                  />
                )}
                {progress && <ItemProgressBar item={progress} />}
              </div>
              {/* Every row gets the column while a job exists, so the bars line up. */}
              {itemsByIndex && (progress ? <StatusCell item={progress} /> : <div className="w-32 shrink-0" />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
