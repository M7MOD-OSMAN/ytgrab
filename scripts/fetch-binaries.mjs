// Downloads the yt-dlp and ffmpeg builds the desktop app ships into desktop/bin/<platform>.
// Run on the platform being packaged: node scripts/fetch-binaries.mjs [win|linux]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const target = process.argv[2] ?? (process.platform === "win32" ? "win" : "linux");
if (!["win", "linux"].includes(target)) {
  console.error(`Unknown target "${target}" (expected win or linux).`);
  process.exit(1);
}

// ffmpeg 9.0 LGPL shared: codecs live once in shared libraries, and nothing StreamPull
// does (stream-copy merges, LAME mp3) needs the GPL-only encoders.
const FFMPEG_ASSET = {
  win: "ffmpeg-n9.0-latest-win64-lgpl-shared-9.0.zip",
  linux: "ffmpeg-n9.0-latest-linux64-lgpl-shared-9.0.tar.xz",
}[target];
const FFMPEG_URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${FFMPEG_ASSET}`;
const YTDLP_ASSET = { win: "yt-dlp.exe", linux: "yt-dlp_linux" }[target];

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "desktop", "bin", target);
const cacheDir = path.join(root, "desktop", ".cache");
const exe = target === "win" ? ".exe" : "";

const githubHeaders = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};

async function download(url, dest) {
  if (fs.existsSync(dest)) {
    console.log(`  cached   ${path.basename(dest)}`);
    return;
  }
  console.log(`  download ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const tmp = `${dest}.part`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, dest);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

// Windows' own bsdtar reads zip; Git Bash's GNU tar on PATH does not.
function extract(archive, dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (archive.endsWith(".zip")) {
    const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "unzip";
    if (process.platform === "win32") run(tar, ["-xf", archive, "-C", dest]);
    else run(tar, ["-q", archive, "-d", dest]);
  } else {
    run("tar", ["-xJf", archive, "-C", dest]);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "licenses"), { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

// ── yt-dlp ──
const release = await (await fetch("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest", { headers: githubHeaders })).json();
const ytTag = release.tag_name;
if (!ytTag) throw new Error("Could not read the latest yt-dlp release: " + JSON.stringify(release).slice(0, 200));
console.log(`yt-dlp ${ytTag}`);
const ytCached = path.join(cacheDir, `${ytTag}-${YTDLP_ASSET}`);
await download(`https://github.com/yt-dlp/yt-dlp/releases/download/${ytTag}/${YTDLP_ASSET}`, ytCached);
const ytOut = path.join(outDir, `yt-dlp${exe}`);
fs.copyFileSync(ytCached, ytOut);
fs.chmodSync(ytOut, 0o755);
// The app copies yt-dlp somewhere writable so it can self-update; this lets it
// tell whether the copy it already has is older than the one shipped.
fs.writeFileSync(path.join(outDir, "yt-dlp.version"), ytTag);
await download("https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/LICENSE", path.join(outDir, "licenses", "yt-dlp-LICENSE.txt"));

// ── ffmpeg ──
console.log(`ffmpeg ${FFMPEG_ASSET}`);
const ffArchive = path.join(cacheDir, FFMPEG_ASSET);
await download(FFMPEG_URL, ffArchive);
const staging = fs.mkdtempSync(path.join(os.tmpdir(), "streampull-ffmpeg-"));
extract(ffArchive, staging);
const [top] = fs.readdirSync(staging);
const ffSrc = path.join(staging, top);
const ffOut = path.join(outDir, "ffmpeg");

if (target === "win") {
  // DLLs have to sit beside the exes: that's where Windows looks first.
  fs.mkdirSync(ffOut, { recursive: true });
  for (const f of fs.readdirSync(path.join(ffSrc, "bin"))) {
    if (f === "ffplay.exe") continue;
    fs.copyFileSync(path.join(ffSrc, "bin", f), path.join(ffOut, f));
  }
} else {
  // The binaries find their shared libraries through an $ORIGIN/../lib rpath.
  fs.mkdirSync(path.join(ffOut, "bin"), { recursive: true });
  for (const f of ["ffmpeg", "ffprobe"]) {
    fs.copyFileSync(path.join(ffSrc, "bin", f), path.join(ffOut, "bin", f));
    fs.chmodSync(path.join(ffOut, "bin", f), 0o755);
  }
  fs.cpSync(path.join(ffSrc, "lib"), path.join(ffOut, "lib"), { recursive: true, verbatimSymlinks: true });
}
fs.copyFileSync(path.join(ffSrc, "LICENSE.txt"), path.join(outDir, "licenses", "ffmpeg-LICENSE.txt"));
fs.rmSync(staging, { recursive: true, force: true });

// ── Check they actually run here, when this machine is the target ──
const hostTarget = process.platform === "win32" ? "win" : process.platform === "linux" ? "linux" : null;
if (hostTarget === target) {
  const ffmpegBin = target === "win" ? path.join(ffOut, "ffmpeg.exe") : path.join(ffOut, "bin", "ffmpeg");
  console.log("\nverifying:");
  console.log("  yt-dlp  " + run(ytOut, ["--version"]).trim());
  console.log("  ffmpeg  " + run(ffmpegBin, ["-version"]).split("\n")[0]);
  const encoders = run(ffmpegBin, ["-hide_banner", "-encoders"]);
  for (const enc of ["libmp3lame", "aac", "libopus", "mov_text"]) {
    if (!encoders.includes(enc)) throw new Error(`ffmpeg build is missing the ${enc} encoder`);
  }
  console.log("  encoders: libmp3lame, aac, libopus, mov_text present");
}

const size = (dir) =>
  fs.readdirSync(dir, { recursive: true }).reduce((n, f) => {
    const s = fs.statSync(path.join(dir, f));
    return s.isFile() ? n + s.size : n;
  }, 0);
console.log(`\n${outDir}  (${(size(outDir) / 1048576).toFixed(0)} MB)`);
