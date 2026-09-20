import { probeSizes } from "@/lib/ytdlp";
import { getSetupStatus } from "@/lib/binaries";

export const dynamic = "force-dynamic";

// Streams newline-delimited JSON, one entry per video, so the UI can fill in
// sizes as yt-dlp resolves them instead of waiting for the whole playlist.
export async function POST(req: Request) {
  let body: { url?: string; isPlaylist?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Bad request." }), { status: 400 });
  }

  const url = (body.url || "").trim();
  if (!url) return new Response(JSON.stringify({ error: "No URL given." }), { status: 400 });
  if (!getSetupStatus().ready) {
    return new Response(JSON.stringify({ error: "yt-dlp is not installed." }), { status: 400 });
  }

  const encoder = new TextEncoder();
  let probe: ReturnType<typeof probeSizes> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      probe = probeSizes(url, !!body.isPlaylist, (entry) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(entry) + "\n"));
        } catch {
          // client went away; cancel() handles teardown
        }
      });
      probe.done.then(() => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      probe?.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
