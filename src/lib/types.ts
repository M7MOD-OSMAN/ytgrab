export type MediaKind = "video" | "audio";

export type QualityChoice = "best" | "2160" | "1440" | "1080" | "720" | "480" | "360";

export type DownloadOptions = {
  url: string;
  outputDir: string;
  kind: MediaKind;
  quality: QualityChoice; // ignored when kind === "audio"
  audioFormat: "mp3" | "m4a" | "opus";
  isPlaylist: boolean;
  // Names the per-playlist subfolder created under outputDir.
  playlistTitle: string | null;
  // 1-based indices into the playlist entries the user selected, or null
  // for "all items".
  playlistItems: number[] | null;
  embedThumbnail: boolean;
  embedSubtitles: boolean;
  subtitleLangs: string; // e.g. "en" or "en,ar" — passed through to yt-dlp
  embedMetadata: boolean;
  // KB/s (kilobytes per second, matching yt-dlp's own --limit-rate unit —
  // not kilobits, despite the common "Kbps" abbreviation elsewhere).
  limitRateKBps: number | null;
  cookiesFromBrowser: string | null; // "chrome" | "firefox" | "edge" | "brave" | "safari" | null
  cookiesFilePath: string | null;
};

export type PlaylistEntrySummary = {
  index: number; // 1-based position in the playlist
  id: string;
  title: string;
  durationSeconds: number | null;
  thumbnail: string | null;
  isAvailable: boolean;
  unavailableReason: string | null;
};

export type MediaInfo = {
  type: "video" | "playlist";
  id: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
  isLive: boolean;
  webpageUrl: string;
  // Present only when type === "playlist"
  playlistTitle: string | null;
  entries: PlaylistEntrySummary[] | null;
  // True when the URL pointed at a single video that also happens to carry
  // a playlist id in its query string (e.g. autoplay-queue links).
  partOfPlaylistOnly: boolean;
};

export type JobItemStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "done"
  | "skipped"
  | "error"
  | "cancelled";

export type JobItemProgress = {
  index: number;
  title: string;
  status: JobItemStatus;
  percent: number;
  speed: string | null;
  eta: string | null;
  totalBytes: string | null;
  error: string | null;
};

export type JobStatus = "queued" | "running" | "paused" | "completed" | "cancelled" | "error";

// Still owns its partial files and keeps its event stream open. Paused counts:
// resuming continues the same job rather than starting a new one.
export function isJobLive(status: JobStatus): boolean {
  return status === "running" || status === "queued" || status === "paused";
}

export type JobSnapshot = {
  id: string;
  createdAt: number;
  status: JobStatus;
  options: DownloadOptions;
  totalItems: number;
  completedItems: number;
  currentItemIndex: number | null;
  items: JobItemProgress[];
  log: string[];
  outputDir: string;
  errorMessage: string | null;
};

// A destination offered in the "Save to" dropdown.
export type FolderChoice = { label: string; path: string };

// Download size for one playlist entry, resolved per quality choice so the UI
// can react to the quality dropdown without re-probing the network.
export type EntrySize = {
  index: number;
  id: string;
  video: Partial<Record<QualityChoice, number>>;
  audio: number | null;
};
