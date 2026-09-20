import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";

export async function POST(req: Request) {
  let body: { dir?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const dir = (body.dir || "").trim();
  if (!dir) return NextResponse.json({ error: "No folder given." }, { status: 400 });
  if (!fs.existsSync(dir)) return NextResponse.json({ error: "That folder doesn't exist." }, { status: 404 });

  try {
    if (process.platform === "win32") {
      spawn("explorer", [dir], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [dir], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [dir], { detached: true, stdio: "ignore" }).unref();
    }
    return NextResponse.json({ opened: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open that folder." },
      { status: 500 }
    );
  }
}
