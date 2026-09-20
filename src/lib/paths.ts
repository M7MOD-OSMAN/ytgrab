import os from "os";
import path from "path";
import fs from "fs";
import type { FolderChoice } from "./types";

// A sensible default download folder per OS: ~/Downloads/YTGrab, created on
// first use. The user can always override it in the UI.
export function defaultDownloadDir(): string {
  return path.join(os.homedir(), "Downloads", "YTGrab");
}

export type PathCheck = {
  ok: boolean;
  reason?: string;
  resolved: string;
};

// Validates (and creates, if missing) a directory the user wants to download
// into. Surfaces the common failure modes with a plain-English reason
// instead of a raw ENOENT/EACCES stack.
export function ensureWritableDir(dir: string): PathCheck {
  const resolved = path.resolve(dir);
  try {
    fs.mkdirSync(resolved, { recursive: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EACCES" || e.code === "EPERM") {
      return { ok: false, reason: "Permission denied creating that folder.", resolved };
    }
    if (e.code === "ENOTDIR") {
      return { ok: false, reason: "Part of that path is a file, not a folder.", resolved };
    }
    return { ok: false, reason: e.message || "Could not create that folder.", resolved };
  }
  try {
    fs.accessSync(resolved, fs.constants.W_OK);
  } catch {
    return { ok: false, reason: "That folder is not writable.", resolved };
  }
  return { ok: true, resolved };
}

// Windows paths longer than ~259 characters fail without long-path support
// enabled. We can't fix that from here, but we can warn early instead of
// letting yt-dlp fail deep into a playlist.
export function warnIfPathTooLongForWindows(dir: string): string | null {
  if (dir.length > 200) {
    return "This folder path is quite long. On Windows, combined with long video titles, some files may fail to save (MAX_PATH limit). Consider a shorter folder like C:\\Videos.";
  }
  return null;
}

// Well-known destinations for the "Save to" dropdown. Everything but the
// default is offered only when it already exists on this machine, so the
// list never points somewhere the user has no business writing to.
export function commonDownloadDirs(): FolderChoice[] {
  const home = os.homedir();
  const videos = process.platform === "darwin" ? "Movies" : "Videos";
  const candidates: FolderChoice[] = [
    { label: "Downloads/YTGrab", path: defaultDownloadDir() },
    { label: "Downloads", path: path.join(home, "Downloads") },
    { label: videos, path: path.join(home, videos) },
    { label: "Music", path: path.join(home, "Music") },
    { label: "Desktop", path: path.join(home, "Desktop") },
  ];
  const seen = new Set<string>();
  return candidates.filter((c, i) => {
    if (seen.has(c.path)) return false;
    seen.add(c.path);
    return i === 0 || fs.existsSync(c.path);
  });
}
