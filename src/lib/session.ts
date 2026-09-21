import type { DownloadOptions, EntrySize, MediaInfo } from "./types";

// The downloader's working state. Kept in localStorage so a reload — or coming
// back after closing the tab mid-download — lands on the same playlist.
export type DownloaderSession = {
  url: string;
  info: MediaInfo | null;
  selected: number[];
  currentJobId: string | null;
  options: DownloadOptions;
  sizes: EntrySize[];
};

// Bump the version when the shape changes, so an old session is ignored
// rather than restored into fields that no longer mean the same thing.
const KEY = "streampull:downloader:v1";

// Storage can be missing or throw (private mode, blocked site data). The app
// still works then — it just starts empty after a reload.
export function loadSession(): DownloaderSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DownloaderSession;
    return parsed && typeof parsed === "object" && parsed.options ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: DownloaderSession): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // quota exceeded or storage blocked: restore just won't be available
  }
}
