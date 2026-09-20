export function formatDuration(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return "--:--";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Queued";
    case "downloading":
      return "Downloading";
    case "done":
      return "Done";
    case "skipped":
      return "Already had it";
    case "error":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}
