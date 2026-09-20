import { getJob, onJobUpdate, snapshot } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const current = getJob(id);
        if (!current) return;
        const data = `data: ${JSON.stringify(snapshot(current))}\n\n`;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // controller already closed
        }
        if (current.status !== "running" && current.status !== "queued") {
          cleanup();
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      send();
      unsubscribe = onJobUpdate(id, send);
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);

      function cleanup() {
        if (unsubscribe) unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
      }
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
