import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// A person staring at a dialog is slow; a stuck one shouldn't pin a request forever.
const DIALOG_TIMEOUT_MS = 5 * 60_000;

const PROMPT = "Choose where StreamPull saves downloads";

type PickResult =
  | { kind: "picked"; path: string }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

type Candidate = { cmd: string; args: string[]; env?: NodeJS.ProcessEnv; base64Output?: boolean };

// FolderBrowserDialog ignores a SelectedPath that doesn't exist, so open at the
// closest ancestor that does — the default folder isn't created until first use.
function nearestExisting(dir: string): string {
  let current = dir ? path.resolve(dir) : os.homedir();
  for (let i = 0; i < 32; i++) {
    if (fs.existsSync(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return os.homedir();
}

function candidates(startIn: string): Candidate[] {
  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
      "$dlg = New-Object System.Windows.Forms.FolderBrowserDialog",
      `$dlg.Description = '${PROMPT}'`,
      "$dlg.ShowNewFolderButton = $true",
      "if ($env:SP_START) { try { $dlg.SelectedPath = $env:SP_START } catch { } }",
      // Parent the dialog to a topmost form, or it can open behind the browser.
      "$top = New-Object System.Windows.Forms.Form",
      "$top.TopMost = $true",
      "$res = $dlg.ShowDialog($top)",
      "$top.Dispose()",
      // Base64, not the raw path: PowerShell encodes stdout with the console
      // codepage, which turns any non-Latin folder name into "????".
      "if ($res -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($dlg.SelectedPath))) }",
    ].join("\n");
    return [
      {
        cmd: "powershell",
        // -STA is required for Windows Forms dialogs; the path goes through the
        // environment so it never has to survive script quoting.
        args: ["-NoProfile", "-STA", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
        env: { ...process.env, SP_START: startIn },
        base64Output: true,
      },
    ];
  }

  if (process.platform === "darwin") {
    return [
      {
        cmd: "osascript",
        args: [
          "-e",
          `POSIX path of (choose folder with prompt "${PROMPT}" default location POSIX file ${JSON.stringify(startIn)})`,
        ],
      },
    ];
  }

  return [
    {
      cmd: "zenity",
      args: ["--file-selection", "--directory", `--title=${PROMPT}`, `--filename=${startIn}${path.sep}`],
    },
    { cmd: "kdialog", args: ["--getexistingdirectory", startIn, "--title", PROMPT] },
  ];
}

function runCandidate(candidate: Candidate): Promise<PickResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(candidate.cmd, candidate.args, { env: candidate.env ?? process.env, windowsHide: false });
    } catch {
      resolve({ kind: "unavailable" });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: PickResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({ kind: "error", message: "The folder picker timed out." });
    }, DIALOG_TIMEOUT_MS);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      finish(code === "ENOENT" ? { kind: "unavailable" } : { kind: "error", message: err.message });
    });

    child.on("close", (code) => {
      const raw = stdout.trim();
      const picked = candidate.base64Output && raw ? Buffer.from(raw, "base64").toString("utf8") : raw;
      if (picked) return finish({ kind: "picked", path: picked });
      // Every one of these tools exits non-zero with no output when dismissed.
      if (code !== 0) {
        if (/not recognized|command not found/i.test(stderr)) return finish({ kind: "unavailable" });
        return finish({ kind: "cancelled" });
      }
      finish({ kind: "cancelled" });
    });
  });
}

export async function POST(req: Request) {
  let body: { current?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const startIn = nearestExisting((body.current || "").trim());

  let lastError: string | null = null;
  for (const candidate of candidates(startIn)) {
    const result = await runCandidate(candidate);
    if (result.kind === "picked") return NextResponse.json({ path: result.path, cancelled: false });
    if (result.kind === "cancelled") return NextResponse.json({ path: null, cancelled: true });
    if (result.kind === "error") lastError = result.message;
  }

  return NextResponse.json(
    {
      error:
        lastError ??
        (process.platform === "linux"
          ? "No folder picker found. Install zenity or kdialog, or type the path instead."
          : "Could not open a folder picker on this machine. Type the path instead."),
    },
    { status: 500 }
  );
}
