export function formatDuration(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return "--:--";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Binary units, matching what yt-dlp and file managers report.
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// Turns a playlist title into a folder name: drops what Windows forbids and
// trailing dots/spaces (which it silently strips), and caps the length so
// long filenames inside still fit under MAX_PATH. "" means unusable.
export function sanitizeFolderName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, "")
    .trim();
  if (!cleaned || WINDOWS_RESERVED.test(cleaned)) return "";
  return cleaned;
}
