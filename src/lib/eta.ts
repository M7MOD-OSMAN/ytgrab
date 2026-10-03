import type { EntrySize, JobSnapshot, MediaKind, QualityChoice } from "./types";

// The download merges a video stream with an audio one, so the figure that
// matters depends on both the media kind and the chosen quality.
export function sizeFor(entry: EntrySize | undefined, kind: MediaKind, quality: QualityChoice, tv: boolean): number | null {
  if (!entry) return null;
  if (kind === "audio") return entry.audio;
  // Sizes saved before TV mode existed have no tv figures; the original estimate is close enough.
  return (tv ? entry.tv?.[quality] ?? entry.video[quality] : entry.video[quality]) ?? null;
}

export type JobEta = {
  // Null while the rate is still being measured, or when sizes are unknown.
  totalSeconds: number | null;
  // Seconds left per playlist index, for items still to download.
  byIndex: Map<number, number>;
};

const NO_ETA: JobEta = { totalSeconds: null, byIndex: new Map() };

// One measured rate for every row, so the rows add up to the total.
export function estimateJob(job: JobSnapshot, sizes: Map<number, EntrySize>): JobEta {
  const rate = job.bytesPerSecond;
  if (job.status !== "running" || !rate) return NO_ETA;

  const { kind, quality } = job.options;
  const tv = job.options.tvCompatible !== false;
  const sizeOf = (index: number) => sizeFor(sizes.get(index), kind, quality, tv);
  const known = job.items.map((i) => sizeOf(i.index)).filter((b): b is number => b != null);
  // A video the size probe missed is assumed to be an average one.
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;

  const byIndex = new Map<number, number>();
  let total = 0;
  for (const item of job.items) {
    if (item.status !== "pending" && item.status !== "downloading") continue;
    const size = sizeOf(item.index) ?? average;
    if (size == null) return NO_ETA;
    const seconds = Math.max(0, size - (item.downloadedBytes ?? 0)) / rate;
    byIndex.set(item.index, seconds);
    total += seconds;
  }
  return { totalSeconds: total, byIndex };
}
