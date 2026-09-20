import { NextResponse } from "next/server";
import os from "os";
import path from "path";
import fs from "fs";

const COOKIES_PATH = path.join(os.tmpdir(), "ytgrab-cookies.txt");

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const text = await file.text();
  if (!text.includes("\t") && !text.trim().startsWith("# Netscape")) {
    return NextResponse.json(
      { error: "That doesn't look like a Netscape-format cookies.txt file." },
      { status: 400 }
    );
  }
  fs.writeFileSync(COOKIES_PATH, text, { mode: 0o600 });
  return NextResponse.json({ path: COOKIES_PATH });
}

export async function DELETE() {
  try {
    fs.unlinkSync(COOKIES_PATH);
  } catch {
    // already gone
  }
  return NextResponse.json({ removed: true });
}
