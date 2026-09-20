"use client";

import { useEffect, useState } from "react";
import { getBrowsers, openFolder, pickFolder, uploadCookies } from "@/lib/api";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Spinner } from "./UrlBar";
import type { DownloadOptions, FolderChoice, QualityChoice } from "@/lib/types";

const QUALITIES: SelectOption[] = [
  { value: "best", label: "Best available", hint: "auto" },
  { value: "2160", label: "2160p", badge: "4K" },
  { value: "1440", label: "1440p", badge: "2K" },
  { value: "1080", label: "1080p", badge: "FHD" },
  { value: "720", label: "720p", badge: "HD" },
  { value: "480", label: "480p", hint: "smaller" },
  { value: "360", label: "360p", hint: "smallest" },
];

const AUDIO_FORMATS: SelectOption[] = [
  { value: "mp3", label: "MP3", hint: "most compatible" },
  { value: "m4a", label: "M4A", hint: "better quality" },
  { value: "opus", label: "Opus", hint: "smallest" },
];

// Sentinel for the "type your own path" entry — no real folder collides with it.
const CUSTOM = "__custom__";

const trimSep = (p: string) => p.replace(/[\\/]+$/, "");
const samePath = (a: string, b: string) => trimSep(a) === trimSep(b);

export function OptionsBar({
  options,
  onChange,
  folderChoices,
  defaultOutputDir,
}: {
  options: DownloadOptions;
  onChange: (next: Partial<DownloadOptions>) => void;
  folderChoices: FolderChoice[];
  defaultOutputDir: string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [browsers, setBrowsers] = useState<string[]>([]);
  const [cookiesFileName, setCookiesFileName] = useState<string | null>(null);
  const [cookiesUploading, setCookiesUploading] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [folderNote, setFolderNote] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    getBrowsers()
      .then((r) => setBrowsers(r.browsers))
      .catch(() => setBrowsers([]));
  }, []);

  // A path that matches no preset is by definition a custom one — but only
  // judge that once the presets have actually arrived from /api/setup.
  const isCustom =
    customMode ||
    (folderChoices.length > 0 &&
      !!options.outputDir &&
      !folderChoices.some((c) => samePath(c.path, options.outputDir)));

  const folderOptions: SelectOption[] = [
    ...folderChoices.map((c) => ({
      value: c.path,
      label: c.label,
      ...(defaultOutputDir && samePath(c.path, defaultOutputDir) ? { badge: "Default" } : {}),
    })),
    { value: CUSTOM, label: "Custom folder…" },
  ];

  function handleFolderChange(value: string) {
    setFolderNote(null);
    if (value === CUSTOM) {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    onChange({ outputDir: value });
  }

  async function handleOpenFolder() {
    setFolderNote(null);
    try {
      await openFolder(options.outputDir);
    } catch (err) {
      setFolderNote(err instanceof Error ? err.message : "Could not open that folder.");
    }
  }

  // Opens the OS folder chooser. The picked path usually isn't one of the
  // presets, so fall into custom mode and show it in full.
  async function handleBrowse() {
    setFolderNote(null);
    setPicking(true);
    try {
      const { path: picked } = await pickFolder(options.outputDir);
      if (!picked) return;
      setCustomMode(!folderChoices.some((c) => samePath(c.path, picked)));
      onChange({ outputDir: picked });
    } catch (err) {
      setFolderNote(err instanceof Error ? err.message : "Could not open a folder picker.");
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-bg p-1">
          <SegButton active={options.kind === "video"} onClick={() => onChange({ kind: "video" })}>
            Video (MP4)
          </SegButton>
          <SegButton active={options.kind === "audio"} onClick={() => onChange({ kind: "audio" })}>
            Audio
          </SegButton>
        </div>

        {options.kind === "video" ? (
          <LabeledSelect
            label="Quality"
            value={options.quality}
            onChange={(v) => onChange({ quality: v as QualityChoice })}
            options={QUALITIES}
          />
        ) : (
          <LabeledSelect
            label="Format"
            value={options.audioFormat}
            onChange={(v) => onChange({ audioFormat: v as DownloadOptions["audioFormat"] })}
            options={AUDIO_FORMATS}
          />
        )}

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <Checkbox
            checked={options.embedSubtitles}
            onChange={(v) => onChange({ embedSubtitles: v })}
            label="Subtitles"
          />
          <Checkbox
            checked={options.embedMetadata}
            onChange={(v) => onChange({ embedMetadata: v })}
            label="Embed metadata"
          />
          <Checkbox
            checked={options.embedThumbnail}
            onChange={(v) => onChange({ embedThumbnail: v })}
            label="Embed thumbnail"
          />
          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text transition-colors"
          >
            Advanced
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Destination stays on the face of the panel: it's the one setting
          people need to confirm before every download. */}
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-text">
            <FolderIcon />
            Save to
          </span>

          <Select
            label="Save to"
            value={isCustom ? CUSTOM : options.outputDir}
            onChange={handleFolderChange}
            options={folderOptions}
            placeholder="Choose a folder…"
            buttonClassName="min-w-52 py-2"
          />

          {isCustom ? (
            <input
              value={options.outputDir}
              onChange={(e) => onChange({ outputDir: e.target.value })}
              placeholder="Type a full folder path"
              spellCheck={false}
              className="min-w-60 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-mono text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          ) : (
            <span
              dir="ltr"
              title={options.outputDir}
              className="min-w-0 flex-1 truncate font-mono text-xs text-text-faint"
            >
              {options.outputDir}
            </span>
          )}

          <button
            onClick={handleBrowse}
            disabled={picking}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-border-strong bg-panel-raised px-3 py-2 text-sm font-medium text-text hover:bg-border transition-colors disabled:opacity-50"
          >
            {picking ? <Spinner /> : <BrowseIcon />}
            {picking ? "Choosing…" : "Browse…"}
          </button>

          <button
            onClick={handleOpenFolder}
            disabled={!options.outputDir}
            className="shrink-0 rounded-lg border border-border bg-panel-raised px-3 py-2 text-sm text-text-muted hover:text-text transition-colors disabled:opacity-40"
          >
            Open
          </button>
        </div>

        {picking && (
          <p className="mt-2 text-xs text-text-faint">
            A folder chooser is open on your desktop — check behind this window if you don&rsquo;t see it.
          </p>
        )}
        {folderNote && <p className="mt-2 text-xs text-warning">{folderNote}</p>}
      </div>

      {advancedOpen && (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">
              Rate limit <span className="text-text-faint">(KB/s, blank = unlimited)</span>
            </label>
            <input
              type="number"
              min={0}
              value={options.limitRateKBps ?? ""}
              onChange={(e) =>
                onChange({ limitRateKBps: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })
              }
              placeholder="Unlimited"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm font-mono text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">Subtitle languages</label>
            <input
              value={options.subtitleLangs}
              onChange={(e) => onChange({ subtitleLangs: e.target.value })}
              placeholder="en,ar"
              disabled={!options.embedSubtitles}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm font-mono text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-40"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-text-muted">
              Sign-in required content <span className="text-text-faint">(private / members-only / age-restricted)</span>
            </label>
            <div className="flex gap-2">
              <Select
                label="Cookie source"
                className="min-w-0 flex-1"
                fullWidth
                buttonClassName="px-3 py-2"
                value={options.cookiesFromBrowser ?? ""}
                onChange={(v) => onChange({ cookiesFromBrowser: v || null, cookiesFilePath: null })}
                options={[
                  { value: "", label: "No cookies" },
                  ...browsers.map((b) => ({ value: b, label: `Use ${b[0].toUpperCase() + b.slice(1)} cookies` })),
                ]}
              />
              <label className="shrink-0 cursor-pointer rounded-lg border border-border bg-panel-raised px-3 py-2 text-sm text-text-muted hover:text-text transition-colors">
                {cookiesUploading ? "Uploading…" : cookiesFileName ?? "Upload cookies.txt"}
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setCookiesUploading(true);
                    try {
                      const res = await uploadCookies(file);
                      setCookiesFileName(file.name);
                      onChange({ cookiesFilePath: res.path, cookiesFromBrowser: null });
                    } catch {
                      // surfaced implicitly by the option staying unset
                    } finally {
                      setCookiesUploading(false);
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BrowseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 10v6m-3-3h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-accent">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-panel-raised text-text" : "text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <span>{label}</span>
      <Select label={label} value={value} onChange={onChange} options={options} buttonClassName="min-w-[9.5rem]" />
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-text-muted select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border-strong accent-accent"
      />
      {label}
    </label>
  );
}
