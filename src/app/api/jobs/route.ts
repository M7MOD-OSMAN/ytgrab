import { NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/jobs";
import { getSetupStatus } from "@/lib/binaries";
import type { DownloadOptions } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}

type CreateJobBody = {
  options: DownloadOptions;
  expectedIds?: { id: string; title: string; index: number }[] | null;
};

export async function POST(req: Request) {
  const status = getSetupStatus();
  if (!status.ready) {
    return NextResponse.json(
      { error: "yt-dlp and ffmpeg both need to be installed first." },
      { status: 412 }
    );
  }

  let body: CreateJobBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const options = body.options;
  if (!options || !options.url || !options.outputDir) {
    return NextResponse.json({ error: "Missing url or output folder." }, { status: 400 });
  }
  try {
    new URL(options.url);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }
  if (options.kind !== "video" && options.kind !== "audio") {
    return NextResponse.json({ error: "Invalid media kind." }, { status: 400 });
  }
  if (
    options.playlistItems &&
    (!Array.isArray(options.playlistItems) || options.playlistItems.some((n) => typeof n !== "number" || n < 1))
  ) {
    return NextResponse.json({ error: "Invalid playlist item selection." }, { status: 400 });
  }

  try {
    const snap = createJob(options, body.expectedIds ?? null);
    return NextResponse.json(snap, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start the download." },
      { status: 400 }
    );
  }
}
