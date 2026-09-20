import { spawn } from "child_process";
import { requireBinaries } from "./binaries";
import type {
  EntrySize,
  DownloadOptions,
  MediaInfo,
  PlaylistEntrySummary,
  QualityChoice,
} from "./types";

// ---------------------------------------------------------------------------
// Fetching info (single video or playlist listing)
// ---------------------------------------------------------------------------

function runYtDlpJson(args: string[], timeoutMs = 60000): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { ytDlpPath } = requireBinaries();
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function isYoutubeExtractor(data: Record<string, unknown>): boolean {
  const key = String(data.extractor_key ?? data.extractor ?? data.ie_key ?? "").toLowerCase();
  return key.includes("youtube");
}

export class InfoFetchError extends Error {
  constructor(message: string, public rawStderr: string) {
    super(message);
  }
}

function friendlyExtractionError(stderr: string): string {
  const line = stderr
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("ERROR:"));
  const msg = line ? line.replace(/^ERROR:\s*/, "") : stderr.trim();
  if (/private video/i.test(msg)) return "That video is private.";
  if (/video unavailable/i.test(msg)) return "That video is unavailable (it may have been removed).";
  if (/sign in to confirm your age|age.restrict/i.test(msg))
    return "That video is age-restricted. Add a browser cookie source in Options to access it.";
  if (/this live event will begin|premieres in/i.test(msg))
    return "That video hasn't started yet (upcoming premiere/livestream).";
  if (/unsupported url/i.test(msg)) return "That URL isn't a link this tool can extract from.";
  if (/getaddrinfo|name or service not known|temporary failure in name resolution|network is unreachable|proxy|timed? ?out|connection refused/i.test(msg))
    return "Couldn't reach the site — check your internet connection.";
  if (/http error 404/i.test(msg)) return "Nothing found at that URL (404) — it may have been removed or the link is wrong.";
  return msg || "Could not read that URL.";
}

export async function fetchMediaInfo(url: string): Promise<MediaInfo> {
  const trimmed = url.trim();
  if (!trimmed) throw new InfoFetchError("Paste a video or playlist URL first.", "");

  const args = [
    "-J",
    "--flat-playlist",
    "--no-warnings",
    "--ignore-no-formats-error",
    "--socket-timeout",
    "20",
    trimmed,
  ];

  let result;
  try {
    result = await runYtDlpJson(args);
  } catch (err) {
    if (err instanceof Error && err.message === "TIMEOUT") {
      throw new InfoFetchError("Timed out reading that URL. Check your connection and try again.", "");
    }
    throw err;
  }

  if (result.code !== 0 || !result.stdout.trim()) {
    throw new InfoFetchError(friendlyExtractionError(result.stderr), result.stderr);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(result.stdout.trim().split("\n")[0]);
  } catch {
    throw new InfoFetchError("Got an unexpected response reading that URL.", result.stdout);
  }

  const isPlaylist = data._type === "playlist" || Array.isArray(data.entries);

  if (isPlaylist) {
    const rawEntries = Array.isArray(data.entries) ? (data.entries as Record<string, unknown>[]) : [];
    const entries: PlaylistEntrySummary[] = rawEntries.map((e, i) => {
      const id = String(e.id ?? "");
      const available = e.title !== "[Deleted video]" && e.title !== "[Private video]" && !!e.id;
      let unavailableReason: string | null = null;
      if (e.title === "[Private video]") unavailableReason = "Private video";
      else if (e.title === "[Deleted video]") unavailableReason = "Deleted video";
      const thumbs = Array.isArray(e.thumbnails) ? (e.thumbnails as Record<string, unknown>[]) : [];
      const thumb =
        (thumbs.length ? (thumbs[thumbs.length - 1].url as string) : null) ??
        (id && (isYoutubeExtractor(e) || isYoutubeExtractor(data)) ? youtubeThumb(id) : null);
      return {
        index: i + 1,
        id,
        title: (e.title as string) || id || `Item ${i + 1}`,
        durationSeconds: typeof e.duration === "number" ? e.duration : null,
        thumbnail: thumb,
        isAvailable: available,
        unavailableReason,
      };
    });

    return {
      type: "playlist",
      id: String(data.id ?? ""),
      title: (data.title as string) || "Playlist",
      uploader: (data.uploader as string) ?? (data.channel as string) ?? null,
      thumbnail: entries[0]?.thumbnail ?? null,
      durationSeconds: null,
      isLive: false,
      webpageUrl: (data.webpage_url as string) || trimmed,
      playlistTitle: (data.title as string) || null,
      entries,
      partOfPlaylistOnly: false,
    };
  }

  const id = String(data.id ?? "");
  const thumbnail = (data.thumbnail as string) ?? (id && isYoutubeExtractor(data) ? youtubeThumb(id) : null);
  // A single-video URL that also carries a playlist id in its query string
  // (e.g. a "radio"/mix autoplay link, or a video opened from inside a
  // playlist). We surface this so the UI can offer "also grab the playlist?"
  const partOfPlaylistOnly = /[?&]list=/.test(trimmed) && data._type !== "playlist";

  return {
    type: "video",
    id,
    title: (data.title as string) || id || "Video",
    uploader: (data.uploader as string) ?? (data.channel as string) ?? null,
    thumbnail,
    durationSeconds: typeof data.duration === "number" ? data.duration : null,
    isLive: !!data.is_live,
    webpageUrl: (data.webpage_url as string) || trimmed,
    playlistTitle: null,
    entries: null,
    partOfPlaylistOnly,
  };
}

// ---------------------------------------------------------------------------
// Building download arguments
// ---------------------------------------------------------------------------

function heightFilter(quality: QualityChoice): string {
  if (quality === "best") return "";
  return `[height<=${quality}]`;
}

function formatSelector(opts: DownloadOptions): string {
  if (opts.kind === "audio") return "ba/b/best";
  const h = heightFilter(opts.quality);
  // A trailing unconstrained "/best" matters: some sites don't report
  // height at all on their formats (common with the generic/direct-file
  // extractor, and some smaller platforms), so a "[height<=1080]" filter
  // can match nothing and fail the whole download instead of just not
  // getting a preference. Falling back to whatever's best keeps that from
  // being fatal.
  return `bv*${h}+ba/b${h}/best`;
}

export const PROGRESS_MARKER = "YTGRAB_PROGRESS";

function progressTemplate(): string {
  return (
    "download:" +
    PROGRESS_MARKER +
    ' {"id": %(info.id)j, "status": %(progress.status)j, "percent": %(progress._percent_str)j, ' +
    '"speed": %(progress._speed_str)j, "eta": %(progress._eta_str)j}'
  );
}

export function buildDownloadArgs(opts: DownloadOptions, archiveFilePath: string): string[] {
  const { ffmpegPath } = requireBinaries();
  const args: string[] = [
    "--ignore-errors", // keep going past private/deleted/geo-blocked items
    "--no-warnings",
    "--newline",
    "--windows-filenames", // safe filenames on every OS, not just Windows
    "--retries",
    "10",
    "--fragment-retries",
    "10",
    "--socket-timeout",
    "30",
    "--progress-template",
    progressTemplate(),
    "--download-archive",
    archiveFilePath,
    "-o",
    "%(title).150B [%(id)s].%(ext)s",
  ];

  // Only pass an explicit --ffmpeg-location when we resolved a real path —
  // a bare command name (e.g. "ffmpeg") isn't something yt-dlp will search
  // PATH for itself, and passing it verbatim makes ffmpeg lookup fail even
  // though it's perfectly reachable. When we don't have a real path, omit
  // the flag and let yt-dlp fall back to its own PATH search, which works.
  if (/[\\/]/.test(ffmpegPath)) {
    args.push("--ffmpeg-location", ffmpegPath);
  }

  if (opts.isPlaylist) {
    args.push("--yes-playlist");
    if (opts.playlistItems && opts.playlistItems.length > 0) {
      args.push("--playlist-items", opts.playlistItems.join(","));
    }
  } else {
    args.push("--no-playlist");
  }

  if (opts.kind === "audio") {
    // Select an audio-only format first (falling back to the best combined
    // stream only if the site has no separate audio track). Without this,
    // yt-dlp downloads the best video+audio stream and throws the video
    // away during extraction — wasting most of the bandwidth and time.
    args.push("-f", formatSelector(opts));
    args.push("-x", "--audio-format", opts.audioFormat);
    if (opts.audioFormat === "mp3") args.push("--audio-quality", "0");
  } else {
    args.push("-f", formatSelector(opts), "--merge-output-format", "mp4");
  }

  if (opts.embedThumbnail) args.push("--embed-thumbnail");
  if (opts.embedMetadata) args.push("--embed-metadata");
  if (opts.embedSubtitles) {
    args.push("--write-subs", "--embed-subs", "--sub-langs", opts.subtitleLangs || "en");
  }
  if (opts.limitRateKBps && opts.limitRateKBps > 0) {
    args.push("--limit-rate", `${opts.limitRateKBps}K`);
  }
  if (opts.cookiesFromBrowser) {
    args.push("--cookies-from-browser", opts.cookiesFromBrowser);
  } else if (opts.cookiesFilePath) {
    args.push("--cookies", opts.cookiesFilePath);
  }

  args.push("-P", opts.outputDir);
  args.push(opts.url);

  return args;
}

// ---------------------------------------------------------------------------
// Probing download sizes
// ---------------------------------------------------------------------------

const QUALITY_CHOICES: QualityChoice[] = ["best", "2160", "1440", "1080", "720", "480", "360"];

type RawFormat = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// yt-dlp reports filesize only for some formats; tbr (kbit/s) covers the rest.
function formatBytes(f: RawFormat, durationSeconds: number | null): number | null {
  const exact = num(f.filesize) ?? num(f.filesize_approx);
  if (exact != null) return exact;
  const tbr = num(f.tbr);
  if (tbr != null && durationSeconds) return Math.round((tbr * 1000 * durationSeconds) / 8);
  return null;
}

const isVideoOnly = (f: RawFormat) =>
  !!f.vcodec && f.vcodec !== "none" && (!f.acodec || f.acodec === "none");
const isAudioOnly = (f: RawFormat) =>
  (!f.vcodec || f.vcodec === "none") && !!f.acodec && f.acodec !== "none";
const isCombined = (f: RawFormat) =>
  !!f.vcodec && f.vcodec !== "none" && !!f.acodec && f.acodec !== "none";

// yt-dlp emits `formats` worst-to-best, so the last entry that passes a filter
// is the one its own selector would land on. Verified byte-exact against
// `yt-dlp -f "bv*[height<=1080]+ba" --print filesize`.
const bestOf = (formats: RawFormat[]) => (formats.length ? formats[formats.length - 1] : null);

export function entrySizeFromInfo(data: Record<string, unknown>, index: number): EntrySize {
  const duration = num(data.duration);
  const formats = Array.isArray(data.formats) ? (data.formats as RawFormat[]) : [];
  const sized = formats.filter((f) => formatBytes(f, duration) != null);

  const audioFormat = bestOf(sized.filter(isAudioOnly));
  const audio = audioFormat ? formatBytes(audioFormat, duration) : null;

  const video: Partial<Record<QualityChoice, number>> = {};
  for (const quality of QUALITY_CHOICES) {
    const cap = quality === "best" ? Infinity : Number(quality);
    const fits = (f: RawFormat) => {
      const h = num(f.height);
      return h == null ? quality === "best" : h <= cap;
    };
    // Mirrors formatSelector(): bv*[h]+ba, falling back to a combined stream.
    const videoOnly = bestOf(sized.filter((f) => isVideoOnly(f) && fits(f)));
    if (videoOnly && audio != null) {
      const v = formatBytes(videoOnly, duration);
      if (v != null) video[quality] = v + audio;
      continue;
    }
    const combined = bestOf(sized.filter((f) => isCombined(f) && fits(f)));
    const c = combined ? formatBytes(combined, duration) : null;
    if (c != null) video[quality] = c;
  }

  return { index, id: String(data.id ?? ""), video, audio };
}

export type SizeProbe = { done: Promise<void>; cancel: () => void };

// Streams one size per video as yt-dlp resolves it (roughly 2s each), rather
// than making the caller wait for the whole playlist.
export function probeSizes(
  url: string,
  isPlaylist: boolean,
  onEntry: (entry: EntrySize) => void
): SizeProbe {
  const { ytDlpPath } = requireBinaries();
  const args = [
    "-j",
    "--no-warnings",
    "--ignore-errors",
    "--ignore-no-formats-error",
    "--socket-timeout",
    "20",
    isPlaylist ? "--yes-playlist" : "--no-playlist",
    url,
  ];

  const child = spawn(ytDlpPath, args, { windowsHide: true });
  let cancelled = false;
  let buffer = "";
  let index = 0;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) return;
    index += 1;
    try {
      onEntry(entrySizeFromInfo(JSON.parse(trimmed), index));
    } catch {
      // A malformed or unavailable entry just goes without a size.
    }
  };

  const done = new Promise<void>((resolve) => {
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });
    child.on("error", () => resolve());
    child.on("close", () => {
      if (!cancelled && buffer.trim()) handleLine(buffer);
      resolve();
    });
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      child.kill();
    },
  };
}
