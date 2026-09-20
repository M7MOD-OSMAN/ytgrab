import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { getSetupStatus } from "@/lib/binaries";

export async function POST() {
  const status = getSetupStatus();
  if (!status.ytDlp.found || !status.ytDlp.binPath) {
    return NextResponse.json({ error: "yt-dlp isn't installed yet." }, { status: 412 });
  }

  const binPath = status.ytDlp.binPath;
  const output = await new Promise<{ code: number | null; text: string }>((resolve) => {
    const child = spawn(binPath, ["-U"], { windowsHide: true });
    let text = "";
    child.stdout.on("data", (d) => (text += d.toString()));
    child.stderr.on("data", (d) => (text += d.toString()));
    child.on("close", (code) => resolve({ code, text }));
    child.on("error", (err) => resolve({ code: -1, text: err.message }));
  });

  getSetupStatus(true); // refresh cached version info
  return NextResponse.json({ ok: output.code === 0, output: output.text.trim() });
}
