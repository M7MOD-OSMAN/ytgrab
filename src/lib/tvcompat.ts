import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

// Most TVs play only H.264 (8-bit 4:2:0) video with AAC audio from a USB drive.
// YouTube's "best" streams are usually AV1/VP9 + Opus, so files get checked after download.

export type ProbeStream = {
  index: number;
  codec_type: string;
  codec_name?: string;
  pix_fmt?: string;
  height?: number;
  disposition?: { attached_pic?: number };
};
export type Probe = { streams: ProbeStream[]; duration: number | null };

export type TvPlan = {
  video: ProbeStream | null; // needs re-encoding, or null when it can be copied
  audio: ProbeStream[]; // need re-encoding
  remux: boolean; // not an .mp4 file yet
};

const MAX_TV_HEIGHT = 1080;

export function ffprobePathFor(ffmpegPath: string): string {
  if (!/[\\/]/.test(ffmpegPath)) return "ffprobe";
  return path.join(path.dirname(ffmpegPath), path.basename(ffmpegPath).replace(/ffmpeg/i, "ffprobe"));
}

export function probeFile(ffprobe: string, file: string): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffprobe,
      [
        "-v", "error",
        "-show_entries", "stream=index,codec_type,codec_name,pix_fmt,height:stream_disposition=attached_pic:format=duration",
        "-of", "json",
        file,
      ],
      { windowsHide: true }
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `ffprobe exited with code ${code}`));
      try {
        const data = JSON.parse(out);
        const duration = parseFloat(data.format?.duration);
        resolve({ streams: data.streams ?? [], duration: Number.isFinite(duration) ? duration : null });
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Unreadable ffprobe output"));
      }
    });
  });
}

const mainVideo = (p: Probe) => p.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic) ?? null;

// Null when the file already plays on a TV.
export function planTvFix(probe: Probe, file: string): TvPlan | null {
  const v = mainVideo(probe);
  const video = v && !(v.codec_name === "h264" && v.pix_fmt === "yuv420p" && (v.height ?? 0) <= MAX_TV_HEIGHT) ? v : null;
  const audio = probe.streams.filter((s) => s.codec_type === "audio" && s.codec_name !== "aac");
  const remux = path.extname(file).toLowerCase() !== ".mp4";
  return video || audio.length || remux ? { video, audio, remux } : null;
}

export function describePlan(plan: TvPlan): string {
  const parts = [];
  if (plan.video) parts.push(`video ${plan.video.codec_name} → h264`);
  for (const a of plan.audio) parts.push(`audio ${a.codec_name} → aac`);
  if (!parts.length && plan.remux) parts.push("remux → mp4");
  return parts.join(", ");
}

// LGPL ffmpeg builds (the bundled one) lack libx264; libopenh264 is the software fallback.
const x264Cache = new Map<string, boolean>();
function hasX264(ffmpeg: string): boolean {
  let known = x264Cache.get(ffmpeg);
  if (known === undefined) {
    const res = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8", timeout: 10000, windowsHide: true });
    known = / libx264 /.test(res.stdout ?? "");
    x264Cache.set(ffmpeg, known);
  }
  return known;
}

// openh264 has no constant-quality mode, so pick a bitrate by output height.
function openh264Bitrate(height: number): string {
  if (height <= 360) return "900k";
  if (height <= 480) return "1400k";
  if (height <= 720) return "2800k";
  return "5000k";
}

function videoArgs(ffmpeg: string, o: number, height: number): string[] {
  const outHeight = Math.min(height || MAX_TV_HEIGHT, MAX_TV_HEIGHT);
  const args = hasX264(ffmpeg)
    ? [`-c:${o}`, "libx264", `-preset:${o}`, "fast", `-crf:${o}`, "22"]
    : [`-c:${o}`, "libopenh264", `-b:${o}`, openh264Bitrate(outHeight)];
  args.push(`-profile:${o}`, "high", `-pix_fmt:${o}`, "yuv420p");
  if (height > MAX_TV_HEIGHT) args.push(`-filter:${o}`, `scale=-2:${MAX_TV_HEIGHT}`);
  return args;
}

export type ConversionResult = { ok: true; file: string } | { ok: false; error: string };
export type ConversionHandle = { done: Promise<ConversionResult>; abort: () => void; aborted: () => boolean };

// Writes a temp file beside the original and swaps it in only after it checks out.
export function convertForTv(
  ffmpeg: string,
  file: string,
  probe: Probe,
  plan: TvPlan,
  onProgress: (percent: number) => void
): ConversionHandle {
  const dir = path.dirname(file);
  const base = path.basename(file, path.extname(file));
  const tmp = path.join(dir, `${base}.tvtmp.mp4`);
  const final = path.join(dir, `${base}.mp4`);

  const kept = probe.streams.filter((s) => ["video", "audio", "subtitle"].includes(s.codec_type));
  const args = ["-hide_banner", "-nostdin", "-y", "-i", file];
  for (const s of kept) args.push("-map", `0:${s.index}`);
  args.push("-c", "copy");
  kept.forEach((s, o) => {
    if (plan.video && s.index === plan.video.index) args.push(...videoArgs(ffmpeg, o, s.height ?? 0));
    else if (plan.audio.some((a) => a.index === s.index)) args.push(`-c:${o}`, "aac", `-b:${o}`, "160k", `-ac:${o}`, "2");
    else if (s.codec_type === "subtitle" && s.codec_name !== "mov_text") args.push(`-c:${o}`, "mov_text");
  });
  args.push("-movflags", "+faststart", "-progress", "pipe:1", "-nostats", tmp);

  let aborted = false;
  const child = spawn(ffmpeg, args, { windowsHide: true });
  const removeTmp = () => fs.rm(tmp, { force: true }, () => {});

  const done = new Promise<ConversionResult>((resolve) => {
    let stderr = "";
    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const m = line.match(/^out_time_us=(\d+)/);
        if (m && probe.duration) onProgress(Math.min(99, (Number(m[1]) / 1e6 / probe.duration) * 100));
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    child.on("error", (err) => {
      removeTmp();
      resolve({ ok: false, error: err.message });
    });
    child.on("close", async (code) => {
      if (aborted) {
        removeTmp();
        return resolve({ ok: false, error: "aborted" });
      }
      if (code !== 0) {
        removeTmp();
        const reason = stderr.trim().split(/\r?\n/).pop() || `ffmpeg exited with code ${code}`;
        return resolve({ ok: false, error: reason });
      }
      try {
        const out = await probeFile(ffprobePathFor(ffmpeg), tmp);
        const shortened = probe.duration && out.duration && out.duration < probe.duration * 0.95;
        if (planTvFix(out, tmp.replace(/\.tvtmp\.mp4$/, ".mp4")) || shortened) {
          removeTmp();
          return resolve({ ok: false, error: "the converted file did not check out" });
        }
        if (final !== file) fs.rmSync(file, { force: true });
        fs.renameSync(tmp, final);
        resolve({ ok: true, file: final });
      } catch (err) {
        removeTmp();
        resolve({ ok: false, error: err instanceof Error ? err.message : "could not replace the file" });
      }
    });
  });

  return {
    done,
    abort: () => {
      aborted = true;
      child.kill();
    },
    aborted: () => aborted,
  };
}
