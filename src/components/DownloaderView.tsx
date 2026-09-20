"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UrlBar, Spinner } from "./UrlBar";
import { OptionsBar } from "./OptionsBar";
import { QueueList } from "./QueueList";
import { JobSummaryBar } from "./JobSummaryBar";
import { fetchInfo, streamSizes } from "@/lib/api";
import { sanitizeFolderName } from "@/lib/format";
import type { DownloadOptions, EntrySize, FolderChoice, JobSnapshot, MediaInfo } from "@/lib/types";

export function DownloaderView({
  defaultOutputDir,
  folderChoices,
  jobs,
  onStartJob,
  onCancelJob,
  onOpenFolder,
  onCleanupJob,
}: {
  defaultOutputDir: string;
  folderChoices: FolderChoice[];
  jobs: Map<string, JobSnapshot>;
  onStartJob: (
    options: DownloadOptions,
    expectedIds: { id: string; title: string; index: number }[] | null
  ) => Promise<string>;
  onCancelJob: (id: string) => void;
  onOpenFolder: (dir: string) => void;
  onCleanupJob: (id: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sizes, setSizes] = useState<Map<number, EntrySize>>(new Map());
  const [sizing, setSizing] = useState(false);
  const stopSizing = useRef<(() => void) | null>(null);

  // A probe outlives the component if the user navigates away mid-playlist.
  useEffect(() => () => stopSizing.current?.(), []);

  const t = useTranslations("Downloader");

  const [options, setOptions] = useState<DownloadOptions>({
    url: "",
    outputDir: defaultOutputDir,
    kind: "video",
    quality: "1080",
    audioFormat: "mp3",
    isPlaylist: false,
    playlistTitle: null,
    playlistItems: null,
    embedThumbnail: false,
    embedSubtitles: false,
    subtitleLangs: "en",
    embedMetadata: true,
    limitRateKBps: null,
    cookiesFromBrowser: null,
    cookiesFilePath: null,
  });

  // defaultOutputDir arrives asynchronously (it comes from /api/setup),
  // usually after this component's initial state is already set up with an
  // empty string. Backfill it once it shows up, but only if the field is
  // still untouched — never stomp on something the user already picked.
  // Adjusting during render rather than in an effect avoids a second pass.
  const [seenDefault, setSeenDefault] = useState(defaultOutputDir);
  if (defaultOutputDir !== seenDefault) {
    setSeenDefault(defaultOutputDir);
    if (defaultOutputDir && !options.outputDir) {
      setOptions((o) => ({ ...o, outputDir: defaultOutputDir }));
    }
  }

  const currentJob = currentJobId ? jobs.get(currentJobId) ?? null : null;
  const itemsByIndex = useMemo(() => {
    if (!currentJob) return null;
    const map = new Map<number, JobSnapshot["items"][number]>();
    for (const item of currentJob.items) map.set(item.index, item);
    return map;
  }, [currentJob]);

  function startSizeProbe(probeUrl: string, isPlaylist: boolean) {
    stopSizing.current?.();
    setSizing(true);
    stopSizing.current = streamSizes(
      probeUrl,
      isPlaylist,
      (entry) => setSizes((prev) => new Map(prev).set(entry.index, entry)),
      () => setSizing(false)
    );
  }

  async function handleAnalyze() {
    setInfoLoading(true);
    setInfoError(null);
    setInfo(null);
    setCurrentJobId(null);
    stopSizing.current?.();
    setSizes(new Map());
    try {
      const result = await fetchInfo(url);
      setInfo(result);
      startSizeProbe(result.webpageUrl || url, result.type === "playlist");
      if (result.type === "playlist" && result.entries) {
        setSelected(new Set(result.entries.filter((e) => e.isAvailable).map((e) => e.index)));
      } else {
        setSelected(new Set([1]));
      }
      setOptions((o) => ({
        ...o,
        url: result.webpageUrl || url,
        isPlaylist: result.type === "playlist",
        playlistTitle: result.playlistTitle,
      }));
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : t("errorRead"));
    } finally {
      setInfoLoading(false);
    }
  }

  async function handleDownload(scope: "selected" | "all") {
    if (!info) return;
    setStarting(true);
    try {
      const playlistItems =
        info.type === "playlist" ? (scope === "all" ? null : Array.from(selected).sort((a, b) => a - b)) : null;
      const expectedIds =
        info.type === "playlist" && info.entries
          ? info.entries
              .filter((e) => scope === "all" || selected.has(e.index))
              .map((e) => ({ id: e.id, title: e.title, index: e.index }))
          : info.type === "video"
            ? [{ id: info.id, title: info.title, index: 1 }]
            : null;

      const id = await onStartJob({ ...options, url: options.url || url, isPlaylist: info.type === "playlist", playlistItems }, expectedIds);
      setCurrentJobId(id);
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : t("errorStart"));
    } finally {
      setStarting(false);
    }
  }

  const isPlaylist = info?.type === "playlist";
  const jobActive = currentJob && (currentJob.status === "running" || currentJob.status === "queued");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-[28px]">
          {t("title")}
        </h1>
        <p className="mt-1 text-[15px] text-text-muted">
          {t("subtitle")}
        </p>
      </div>

      <UrlBar url={url} onUrlChange={setUrl} onAnalyze={handleAnalyze} loading={infoLoading} disabled={!!jobActive} />

      {infoError && (
        <div className="rounded-xl border border-error-border bg-error-soft px-4 py-3 text-sm text-error">{infoError}</div>
      )}

      {info && (
        <>
          <OptionsBar
            options={options}
            onChange={(patch) => setOptions((o) => ({ ...o, ...patch }))}
            folderChoices={folderChoices}
            defaultOutputDir={defaultOutputDir}
            playlistFolder={
              info.type === "playlist" ? sanitizeFolderName(info.playlistTitle ?? "") : ""
            }
          />

          <QueueList
            info={info}
            selected={selected}
            onToggle={(i) =>
              setSelected((s) => {
                const next = new Set(s);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
              })
            }
            onSelectAll={() => setSelected(new Set((info.entries ?? []).map((e) => e.index)))}
            onSelectNone={() => setSelected(new Set())}
            onSelectAvailable={() =>
              setSelected(new Set((info.entries ?? []).filter((e) => e.isAvailable).map((e) => e.index)))
            }
            itemsByIndex={itemsByIndex}
            sizes={sizes}
            sizing={sizing}
            quality={options.quality}
            kind={options.kind}
          />

          {!currentJob && (
            <div className="flex flex-wrap items-center gap-3">
              {isPlaylist ? (
                <>
                  <button
                    onClick={() => handleDownload("selected")}
                    disabled={starting || selected.size === 0}
                    className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-on-accent hover:bg-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {starting && <Spinner />} {t("downloadSelected", { count: selected.size })}
                  </button>
                  <button
                    onClick={() => handleDownload("all")}
                    disabled={starting}
                    className="rounded-lg border border-border bg-panel-raised px-4 py-2.5 text-sm font-medium text-text hover:bg-border transition-colors disabled:opacity-50"
                  >
                    {t("downloadAll", { count: info.entries?.length ?? 0 })}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleDownload("all")}
                  disabled={starting}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-on-accent hover:bg-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {starting && <Spinner />} {t("download")}
                </button>
              )}
            </div>
          )}

          {currentJob && (
            <JobSummaryBar
              job={currentJob}
              onCancel={() => onCancelJob(currentJob.id)}
              onOpenFolder={() => onOpenFolder(currentJob.outputDir)}
              onCleanup={() => onCleanupJob(currentJob.id)}
            />
          )}
        </>
      )}
    </div>
  );
}
