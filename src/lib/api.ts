import type { DownloadOptions, FolderChoice, JobSnapshot, MediaInfo } from "./types";

export type SetupStatus = {
  platform: string;
  ytDlp: { found: boolean; binPath: string | null; version: string | null };
  ffmpeg: { found: boolean; binPath: string | null; version: string | null };
  ready: boolean;
  defaultDownloadDir: string;
  folderChoices: FolderChoice[];
};

async function asJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.error as string)) || `Request failed (${res.status})`);
  }
  return data as T;
}

export function getSetup() {
  return fetch("/api/setup").then((r) => asJson<SetupStatus>(r));
}

export function fetchInfo(url: string) {
  return fetch("/api/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).then((r) => asJson<MediaInfo>(r));
}

export function createJob(options: DownloadOptions, expectedIds: { id: string; title: string; index: number }[] | null) {
  return fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ options, expectedIds }),
  }).then((r) => asJson<JobSnapshot>(r));
}

export function listJobs() {
  return fetch("/api/jobs").then((r) => asJson<{ jobs: JobSnapshot[] }>(r));
}

export function cancelJob(id: string) {
  return fetch(`/api/jobs/${id}`, { method: "DELETE" }).then((r) => asJson<{ cancelled: boolean }>(r));
}

export function cleanupJob(id: string) {
  return fetch(`/api/jobs/${id}/cleanup`, { method: "POST" }).then((r) => asJson<{ removed: string[] }>(r));
}

export function openFolder(dir: string) {
  return fetch("/api/open-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dir }),
  }).then((r) => asJson<{ opened: boolean }>(r));
}

export function pickFolder(current: string) {
  return fetch("/api/pick-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current }),
  }).then((r) => asJson<{ path: string | null; cancelled: boolean }>(r));
}

export function updateYtDlp() {
  return fetch("/api/update-ytdlp", { method: "POST" }).then((r) => asJson<{ ok: boolean; output: string }>(r));
}

export function getBrowsers() {
  return fetch("/api/browsers").then((r) => asJson<{ browsers: string[] }>(r));
}

export function uploadCookies(file: File) {
  const form = new FormData();
  form.append("file", file);
  return fetch("/api/cookies", { method: "POST", body: form }).then((r) => asJson<{ path: string }>(r));
}

export function removeCookies() {
  return fetch("/api/cookies", { method: "DELETE" }).then((r) => asJson<{ removed: boolean }>(r));
}

export function subscribeToJob(id: string, onSnapshot: (s: JobSnapshot) => void): () => void {
  const es = new EventSource(`/api/jobs/${id}/events`);
  es.onmessage = (ev) => {
    try {
      onSnapshot(JSON.parse(ev.data));
    } catch {
      // ignore malformed frame
    }
  };
  return () => es.close();
}
