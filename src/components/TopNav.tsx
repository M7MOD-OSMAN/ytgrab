"use client";

import { Logo } from "./Logo";

export type Tab = "downloader" | "history";

export function TopNav({
  tab,
  onTabChange,
  historyCount,
  ready,
  ytDlpVersion,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  historyCount: number;
  ready: boolean;
  ytDlpVersion: string | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-6 px-4 lg:px-8">
        <Logo />

        <nav className="flex items-center gap-1">
          <TabButton active={tab === "downloader"} onClick={() => onTabChange("downloader")}>
            Downloader
          </TabButton>
          <TabButton active={tab === "history"} onClick={() => onTabChange("history")}>
            History
            {historyCount > 0 && (
              <span className="ml-1.5 rounded-full bg-panel-raised px-1.5 py-0.5 text-[11px] font-mono text-text-muted">
                {historyCount}
              </span>
            )}
          </TabButton>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-1.5 rounded-full border border-border bg-panel px-2.5 py-1 text-xs text-text-muted sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-success" : "bg-warning"}`} />
            {ready ? (ytDlpVersion ? <span className="font-mono">yt-dlp {ytDlpVersion}</span> : "Ready") : "Setup needed"}
          </div>
        </div>
      </div>
    </header>
  );
}

function TabButton({
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
      className={`flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-panel-raised text-text" : "text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
