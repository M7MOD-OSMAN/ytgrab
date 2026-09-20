"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SetupStatus } from "@/lib/api";

type T = ReturnType<typeof useTranslations<"Setup">>;

function installCommands(platform: string, t: T): { label: string; commands: string[] }[] {
  if (platform === "win32") {
    return [
      {
        label: t("winTerminal"),
        commands: ["winget install yt-dlp.yt-dlp", "winget install Gyan.FFmpeg"],
      },
    ];
  }
  if (platform === "darwin") {
    return [
      {
        label: t("macTerminal"),
        commands: ["brew install yt-dlp ffmpeg"],
      },
    ];
  }
  return [
    {
      label: "Debian / Ubuntu",
      commands: ["sudo apt update && sudo apt install ffmpeg", "pip install --user -U yt-dlp"],
    },
    {
      label: "Fedora",
      commands: ["sudo dnf install ffmpeg", "pip install --user -U yt-dlp"],
    },
    {
      label: "Arch",
      commands: ["sudo pacman -S ffmpeg yt-dlp"],
    },
  ];
}

function CopyableCommand({ command }: { command: string }) {
  const t = useTranslations("Setup");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-bg/60 border border-border px-3 py-2" dir="ltr">
      <code className="text-[13px] font-mono text-text overflow-x-auto whitespace-pre">{command}</code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded-md px-2 py-0.5 text-xs font-mono text-text-muted hover:bg-panel-raised hover:text-text transition-colors"
      >
        {copied ? t("copied") : t("copy")}
      </button>
    </div>
  );
}

export function SetupBanner({
  status,
  onRefresh,
}: {
  status: SetupStatus;
  onRefresh: () => void;
}) {
  const t = useTranslations("Setup");
  const groups = installCommands(status.platform, t);
  const missing = [
    !status.ytDlp.found ? "yt-dlp" : null,
    !status.ffmpeg.found ? "ffmpeg" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-xl border border-warning-border bg-warning-soft p-5">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warning" />
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-medium text-text">
            {t("missing", { count: missing.length, names: missing.join(t("and")) })}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{t("body")}</p>

          <div className="mt-4 space-y-4">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="text-xs text-text-faint mb-1.5">{g.label}</div>
                <div className="space-y-1.5">
                  {g.commands.map((c) => (
                    <CopyableCommand key={c} command={c} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={onRefresh}
              className="text-sm font-medium text-accent hover:text-accent-hover transition-colors"
            >
              {t("recheck")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
