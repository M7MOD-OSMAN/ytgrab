import { NextResponse } from "next/server";
import { fetchMediaInfo, InfoFetchError } from "@/lib/ytdlp";
import { getSetupStatus } from "@/lib/binaries";

export async function POST(req: Request) {
  const status = getSetupStatus();
  if (!status.ytDlp.found) {
    return NextResponse.json({ error: "yt-dlp isn't installed yet." }, { status: 412 });
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const url = (body.url || "").trim();
  if (!url) return NextResponse.json({ error: "Paste a video or playlist URL first." }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json({ error: "Only http(s) links are supported." }, { status: 400 });
  }

  try {
    const info = await fetchMediaInfo(url);
    return NextResponse.json(info);
  } catch (err) {
    if (err instanceof InfoFetchError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json({ error: "Unexpected error reading that URL." }, { status: 500 });
  }
}
