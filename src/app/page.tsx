"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TopNav, type Tab } from "@/components/TopNav";
import { SetupBanner } from "@/components/SetupBanner";
import { DownloaderView } from "@/components/DownloaderView";
import { HistoryView } from "@/components/HistoryView";
import {
  cancelJob as apiCancelJob,
  cleanupJob as apiCleanupJob,
  createJob as apiCreateJob,
  getSetup,
  listJobs,
  openFolder as apiOpenFolder,
  subscribeToJob,
  type SetupStatus,
} from "@/lib/api";
import type { DownloadOptions, JobSnapshot } from "@/lib/types";

export default function Home() {
  const t = useTranslations("Footer");
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [tab, setTab] = useState<Tab>("downloader");
  const [jobs, setJobs] = useState<Map<string, JobSnapshot>>(new Map());
  const unsubscribers = useRef<Map<string, () => void>>(new Map());

  const refreshSetup = useCallback(() => {
    getSetup()
      .then(setSetup)
      .catch(() => setSetup(null));
  }, []);

  useEffect(() => {
    refreshSetup();
    listJobs()
      .then(({ jobs: list }) => {
        setJobs(new Map(list.map((j) => [j.id, j])));
        // Resume watching anything still active from a previous page load.
        for (const j of list) {
          if (j.status === "running" || j.status === "queued") watchJob(j.id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subs = unsubscribers.current;
    return () => {
      for (const unsub of subs.values()) unsub();
    };
  }, []);

  function watchJob(id: string) {
    if (unsubscribers.current.has(id)) return;
    const unsub = subscribeToJob(id, (snap) => {
      setJobs((prev) => {
        const next = new Map(prev);
        next.set(id, snap);
        return next;
      });
      if (snap.status !== "running" && snap.status !== "queued") {
        unsubscribers.current.get(id)?.();
        unsubscribers.current.delete(id);
      }
    });
    unsubscribers.current.set(id, unsub);
  }

  const handleStartJob = useCallback(
    async (options: DownloadOptions, expectedIds: { id: string; title: string; index: number }[] | null) => {
      const snap = await apiCreateJob(options, expectedIds);
      setJobs((prev) => new Map(prev).set(snap.id, snap));
      watchJob(snap.id);
      return snap.id;
    },
    []
  );

  const handleCancelJob = useCallback((id: string) => {
    apiCancelJob(id).catch(() => {});
  }, []);

  const handleCleanupJob = useCallback((id: string) => {
    apiCleanupJob(id).catch(() => {});
  }, []);

  const handleOpenFolder = useCallback((dir: string) => {
    apiOpenFolder(dir).catch(() => {});
  }, []);

  const jobList = Array.from(jobs.values());

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav
        tab={tab}
        onTabChange={setTab}
        historyCount={jobList.length}
        ready={setup?.ready ?? false}
        ytDlpVersion={setup?.ytDlp.version ?? null}
      />

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 lg:px-8 lg:py-10">
        {setup && !setup.ready && <div className="mb-5">
          <SetupBanner status={setup} onRefresh={refreshSetup} />
        </div>}

        {tab === "downloader" ? (
          <DownloaderView
            defaultOutputDir={setup?.defaultDownloadDir ?? ""}
            folderChoices={setup?.folderChoices ?? []}
            jobs={jobs}
            onStartJob={handleStartJob}
            onCancelJob={handleCancelJob}
            onOpenFolder={handleOpenFolder}
            onCleanupJob={handleCleanupJob}
          />
        ) : (
          <HistoryView jobs={jobList} onOpenFolder={handleOpenFolder} onCleanup={handleCleanupJob} onCancel={handleCancelJob} />
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-text-faint lg:px-8">
          <span>{t("tagline")}</span>
          {setup?.ffmpeg.version && (
            <span className="font-mono" dir="ltr">
              {setup.ffmpeg.version.split(" Copyright")[0]}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
