import { spawnSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import os from "os";

export type BinaryInfo = {
  found: boolean;
  binPath: string | null;
  version: string | null;
};

export type SetupStatus = {
  platform: NodeJS.Platform;
  ytDlp: BinaryInfo;
  ffmpeg: BinaryInfo;
  ready: boolean;
};

function candidateNames(name: "yt-dlp" | "ffmpeg"): string[] {
  if (process.platform === "win32") return [`${name}.exe`, name];
  return [name];
}

// Extra places people commonly end up with these binaries, beyond what's
// already on PATH. Covers the "just installed it but didn't restart the
// terminal" and "installed via a GUI installer" cases.
function extraCandidateDirs(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return [
      path.join(localAppData, "Microsoft", "WinGet", "Links"),
      path.join(localAppData, "Programs", "yt-dlp"),
      "C:\\ffmpeg\\bin",
      "C:\\Program Files\\ffmpeg\\bin",
    ];
  }
  if (process.platform === "darwin") {
    return ["/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".local", "bin")];
  }
  return ["/usr/local/bin", "/usr/bin", path.join(home, ".local", "bin")];
}

function resolveAbsolutePath(command: string): string | null {
  try {
    const finder = process.platform === "win32" ? "where" : "which";
    const res = spawnSync(finder, [command], { encoding: "utf8", timeout: 5000 });
    if (res.status === 0 && res.stdout.trim()) {
      return res.stdout.trim().split(/\r?\n/)[0];
    }
  } catch {
    // fall through
  }
  return null;
}

function tryRun(binPath: string, versionFlag: string): string | null {
  try {
    const res = spawnSync(binPath, [versionFlag], { encoding: "utf8", timeout: 5000 });
    if (res.status === 0) {
      return (res.stdout || res.stderr || "").trim().split("\n")[0];
    }
  } catch {
    // not runnable / not found
  }
  return null;
}

function locate(name: "yt-dlp" | "ffmpeg", versionFlag: string): BinaryInfo {
  // 1. Rely on PATH resolution by invoking the bare command name, then
  // resolve it to an absolute path — yt-dlp's own --ffmpeg-location expects
  // a real path and won't do a PATH search itself, so a bare "ffmpeg" would
  // otherwise be passed straight through and fail.
  for (const n of candidateNames(name)) {
    const v = tryRun(n, versionFlag);
    if (v) return { found: true, binPath: resolveAbsolutePath(n) ?? n, version: v };
  }
  // 2. Project-local bin/ folder, in case the user dropped a portable binary there.
  const projectRoot = process.cwd();
  for (const n of candidateNames(name)) {
    const p = path.join(projectRoot, "bin", n);
    if (existsSync(p)) {
      const v = tryRun(p, versionFlag);
      if (v) return { found: true, binPath: p, version: v };
    }
  }
  // 3. Common install locations that may not have made it onto PATH yet.
  for (const dir of extraCandidateDirs()) {
    for (const n of candidateNames(name)) {
      const p = path.join(dir, n);
      if (existsSync(p)) {
        const v = tryRun(p, versionFlag);
        if (v) return { found: true, binPath: p, version: v };
      }
    }
  }
  return { found: false, binPath: null, version: null };
}

let cached: SetupStatus | null = null;
let cachedAt = 0;

export function getSetupStatus(forceRefresh = false): SetupStatus {
  const now = Date.now();
  if (!forceRefresh && cached && now - cachedAt < 5000) return cached;
  const ytDlp = locate("yt-dlp", "--version");
  const ffmpeg = locate("ffmpeg", "-version");
  const status: SetupStatus = {
    platform: process.platform,
    ytDlp,
    ffmpeg,
    ready: ytDlp.found && ffmpeg.found,
  };
  cached = status;
  cachedAt = now;
  return status;
}

export function requireBinaries(): { ytDlpPath: string; ffmpegPath: string } {
  const status = getSetupStatus();
  if (!status.ytDlp.found || !status.ffmpeg.found) {
    throw new Error("MISSING_BINARIES");
  }
  return { ytDlpPath: status.ytDlp.binPath as string, ffmpegPath: status.ffmpeg.binPath as string };
}
