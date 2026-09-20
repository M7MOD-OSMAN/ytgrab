import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { requireBinaries } from "./binaries";
import { buildDownloadArgs, PROGRESS_MARKER } from "./ytdlp";
import type { DownloadOptions, JobItemProgress, JobSnapshot, JobStatus } from "./types";
import { ensureWritableDir } from "./paths";

type Job = {
  id: string;
  createdAt: number;
  options: DownloadOptions;
  status: JobStatus;
  child: ChildProcessWithoutNullStreams | null;
  items: Map<string, JobItemProgress>; // keyed by video id
  itemOrder: string[]; // insertion order of ids as we discover them
  expectedIds: { id: string; title: string; index: number }[] | null; // from prior info fetch, for pre-seeding
  currentId: string | null;
  totalItems: number;
  log: string[];
  emitter: EventEmitter;
  errorMessage: string | null;
  outDir: string;
  killedByUser: boolean;
};

// Survive Next.js dev-mode module reloads by stashing the store on globalThis.
const globalStore = globalThis as unknown as { __ytgrabJobs?: Map<string, Job> };
const jobs: Map<string, Job> = globalStore.__ytgrabJobs ?? new Map();
globalStore.__ytgrabJobs = jobs;

const MAX_LOG_LINES = 500;

function pushLog(job: Job, line: string) {
  job.log.push(line);
  if (job.log.length > MAX_LOG_LINES) job.log.shift();
}

function getOrCreateItem(job: Job, id: string, title?: string): JobItemProgress {
  let item = job.items.get(id);
  if (!item) {
    const seed = job.expectedIds?.find((e) => e.id === id);
    item = {
      index: seed?.index ?? job.itemOrder.length + 1,
      title: title || seed?.title || id,
      status: "pending",
      percent: 0,
      speed: null,
      eta: null,
      totalBytes: null,
      error: null,
    };
    job.items.set(id, item);
    job.itemOrder.push(id);
  } else if (title && item.title === id) {
    item.title = title;
  }
  return item;
}

function markPreviousDownloading(job: Job, doneStatus: "done" = "done") {
  if (job.currentId) {
    const prev = job.items.get(job.currentId);
    if (prev && prev.status === "downloading") {
      prev.status = doneStatus;
      prev.percent = 100;
    }
  }
}

// Matches yt-dlp's "[tag] id: message" lines, e.g. "[youtube] VIDEOID:
// Downloading webpage". The trouble is every stage — download, merging,
// audio extraction, thumbnail embedding, metadata writing — logs its own
// "[SomeTag] Word: detail" status line with the exact same shape, e.g.
// "[download] Destination: ..." or "[ExtractAudio] Destination: ...". Since
// yt-dlp has hundreds of extractor AND postprocessor tags, blocking tags by
// name doesn't scale. Real video ids are opaque identifiers though, never
// plain English status words, so we match the shape here and then filter
// out the known status vocabulary below.
const ID_LINE = /^\[[\w:-]+\]\s+([\w-]{6,}):\s/;
const NON_ID_STATUS_WORDS = new Set([
  "destination",
  "deleting",
  "adding",
  "writing",
  "converting",
  "recoding",
  "remuxing",
  "removing",
  "copying",
  "moving",
  "saving",
  "embedding",
  "correcting",
  "fixing",
  "merging",
  "downloading", // only reachable if it's ever the captured word itself
]);
const ERROR_ID_LINE = /^ERROR:\s*\[[\w:-]+\]\s*([\w-]{6,}):\s*(.+)$/;
const GENERIC_ERROR_LINE = /^ERROR:\s*(.+)$/;
const ARCHIVE_SKIP_LINE = /already been recorded in the archive/;
const PLAYLIST_POSITION_LINE = /^\[download\] Downloading item (\d+) of (\d+)/;
const DESTINATION_LINE = /^\[download\] Destination:\s*(.+)$/;
const ALREADY_DOWNLOADED_LINE = /^\[download\]\s+(.+) has already been downloaded/;

export function handleLine(job: Job, raw: string, isStderr: boolean) {
  const line = raw.trimEnd();
  if (!line) return;

  if (line.startsWith(PROGRESS_MARKER)) {
    const jsonPart = line.slice(PROGRESS_MARKER.length).trim();
    try {
      const p = JSON.parse(jsonPart) as {
        id: string | null;
        status: string;
        percent: string;
        speed: string;
        eta: string;
      };
      const id = p.id && p.id !== "NA" ? p.id : job.currentId;
      if (id) {
        if (job.currentId && job.currentId !== id) markPreviousDownloading(job);
        job.currentId = id;
        const item = getOrCreateItem(job, id);
        item.status = "downloading";
        const pct = parseFloat((p.percent || "").replace("%", "").trim());
        if (!Number.isNaN(pct)) item.percent = pct;
        item.speed = p.speed && p.speed !== "Unknown B/s" ? p.speed.trim() : item.speed;
        item.eta = p.eta && p.eta !== "Unknown" ? p.eta.trim() : item.eta;
        if (p.status === "finished") item.percent = 100;
      }
    } catch {
      // malformed progress line — ignore, non-fatal
    }
    job.emitter.emit("update");
    return;
  }

  const playlistPos = line.match(PLAYLIST_POSITION_LINE);
  if (playlistPos) {
    job.totalItems = Math.max(job.totalItems, parseInt(playlistPos[2], 10));
    job.emitter.emit("update");
    return;
  }

  const errIdMatch = line.match(ERROR_ID_LINE);
  if (errIdMatch) {
    const [, id, reason] = errIdMatch;
    if (job.currentId && job.currentId !== id) markPreviousDownloading(job);
    const item = getOrCreateItem(job, id);
    item.status = "error";
    item.error = reason;
    job.currentId = id;
    pushLog(job, line);
    job.emitter.emit("update");
    return;
  }

  if (ARCHIVE_SKIP_LINE.test(line) || ALREADY_DOWNLOADED_LINE.test(line)) {
    if (job.currentId) {
      const item = getOrCreateItem(job, job.currentId);
      item.status = "skipped";
      item.percent = 100;
    }
    pushLog(job, line);
    job.emitter.emit("update");
    return;
  }

  const idMatch = line.match(ID_LINE);
  if (idMatch && !NON_ID_STATUS_WORDS.has(idMatch[1].toLowerCase())) {
    const id = idMatch[1];
    if (job.currentId && job.currentId !== id) markPreviousDownloading(job);
    job.currentId = id;
    const item = getOrCreateItem(job, id);
    if (item.status === "pending") item.status = "downloading";
    job.emitter.emit("update");
    return;
  }

  const destMatch = line.match(DESTINATION_LINE);
  if (destMatch && job.currentId) {
    pushLog(job, line);
    return;
  }

  if (isStderr) {
    const genericErr = line.match(GENERIC_ERROR_LINE);
    if (genericErr) {
      job.errorMessage = genericErr[1];
      pushLog(job, line);
      job.emitter.emit("update");
      return;
    }
  }

  pushLog(job, line);
}

export function createJob(options: DownloadOptions, expectedIds: { id: string; title: string; index: number }[] | null): JobSnapshot {
  const dirCheck = ensureWritableDir(options.outputDir);
  if (!dirCheck.ok) {
    throw new Error(dirCheck.reason || "Could not use that download folder.");
  }

  const id = randomUUID();
  const job: Job = {
    id,
    createdAt: Date.now(),
    options,
    status: "queued",
    child: null,
    items: new Map(),
    itemOrder: [],
    expectedIds,
    currentId: null,
    totalItems: expectedIds?.length || (options.isPlaylist ? 0 : 1),
    log: [],
    emitter: new EventEmitter(),
    errorMessage: null,
    outDir: dirCheck.resolved,
    killedByUser: false,
  };
  job.emitter.setMaxListeners(50);
  jobs.set(id, job);

  // Pre-seed items so the UI can show the full planned list immediately,
  // including ones still "pending" before yt-dlp gets to them.
  if (expectedIds) {
    for (const e of expectedIds) getOrCreateItem(job, e.id, e.title);
  }

  startJob(job);
  return snapshot(job);
}

function startJob(job: Job) {
  let ytDlpPath: string;
  try {
    ytDlpPath = requireBinaries().ytDlpPath;
  } catch {
    job.status = "error";
    job.errorMessage = "yt-dlp or ffmpeg is not installed.";
    return;
  }

  const archiveFilePath = path.join(job.outDir, ".ytgrab-archive.txt");
  let args: string[];
  try {
    args = buildDownloadArgs(job.options, archiveFilePath);
  } catch (err) {
    job.status = "error";
    job.errorMessage = err instanceof Error ? err.message : "Could not start the download.";
    return;
  }

  job.status = "running";
  const child = spawn(ytDlpPath, args, { windowsHide: true });
  job.child = child;

  let stdoutBuf = "";
  let stderrBuf = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() || "";
    for (const l of lines) handleLine(job, l, false);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split("\n");
    stderrBuf = lines.pop() || "";
    for (const l of lines) handleLine(job, l, true);
  });

  child.on("error", (err) => {
    job.status = "error";
    job.errorMessage = `Could not launch yt-dlp: ${err.message}`;
    job.emitter.emit("update");
    job.emitter.emit("done");
  });

  child.on("close", (code) => {
    if (stdoutBuf) handleLine(job, stdoutBuf, false);
    if (stderrBuf) handleLine(job, stderrBuf, true);

    if (job.killedByUser) {
      job.status = "cancelled";
      // Whatever was mid-download when we killed it did not finish — leave
      // its last-known progress but mark it distinctly so the UI doesn't
      // show a half-downloaded file as "done".
      if (job.currentId) {
        const item = job.items.get(job.currentId);
        if (item && (item.status === "downloading" || item.status === "pending")) {
          item.status = "cancelled";
        }
      }
    } else if (code === 0) {
      job.status = "completed";
      for (const item of job.items.values()) {
        if (item.status === "pending" || item.status === "downloading") {
          item.status = "done";
          item.percent = 100;
        }
      }
    } else {
      // Not cancelled, but exited non-zero. --ignore-errors means yt-dlp
      // still tries every item, so this can be a real partial success
      // (some items done, one or more failed) rather than a total failure.
      for (const item of job.items.values()) {
        if (item.status === "pending" || item.status === "downloading") {
          item.status = "done";
          item.percent = 100;
        }
      }
      const anySucceeded = Array.from(job.items.values()).some(
        (i) => i.status === "done" || i.status === "skipped"
      );
      const anyFailed = Array.from(job.items.values()).some((i) => i.status === "error");
      if (anySucceeded && (anyFailed || job.options.isPlaylist)) {
        job.status = "completed"; // partial success — details are per-item
      } else {
        job.status = "error";
        if (!job.errorMessage) job.errorMessage = "yt-dlp exited with an error.";
      }
    }
    job.child = null;
    job.emitter.emit("update");
    job.emitter.emit("done");
  });
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || !job.child) return false;
  job.killedByUser = true;
  try {
    if (process.platform === "win32") {
      // Kill the whole process tree (yt-dlp spawns ffmpeg as a child).
      spawn("taskkill", ["/pid", String(job.child.pid), "/T", "/F"]);
    } else {
      job.child.kill("SIGTERM");
    }
  } catch {
    // best effort
  }
  return true;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listJobs(): JobSnapshot[] {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(snapshot);
}

export function snapshot(job: Job): JobSnapshot {
  const items = job.itemOrder.map((id) => job.items.get(id)!).sort((a, b) => a.index - b.index);
  const completedItems = items.filter((i) => i.status === "done" || i.status === "skipped" || i.status === "error").length;
  return {
    id: job.id,
    createdAt: job.createdAt,
    status: job.status,
    options: job.options,
    totalItems: job.totalItems || items.length,
    completedItems,
    currentItemIndex: job.currentId ? job.items.get(job.currentId)?.index ?? null : null,
    items,
    log: job.log.slice(-100),
    outputDir: job.outDir,
    errorMessage: job.errorMessage,
  };
}

export function onJobUpdate(id: string, cb: () => void): (() => void) | null {
  const job = jobs.get(id);
  if (!job) return null;
  job.emitter.on("update", cb);
  job.emitter.on("done", cb);
  return () => {
    job.emitter.off("update", cb);
    job.emitter.off("done", cb);
  };
}

export function cleanupOldJobs(maxAgeMs = 1000 * 60 * 60 * 6) {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (job.status !== "running" && job.status !== "queued" && now - job.createdAt > maxAgeMs) {
      jobs.delete(id);
    }
  }
}

export function deletePartialFiles(id: string): { removed: string[] } {
  const job = jobs.get(id);
  const removed: string[] = [];
  if (!job) return { removed };
  try {
    const files = fs.readdirSync(job.outDir);
    for (const f of files) {
      if (f.endsWith(".part") || f.endsWith(".ytdl")) {
        try {
          fs.unlinkSync(path.join(job.outDir, f));
          removed.push(f);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return { removed };
}
