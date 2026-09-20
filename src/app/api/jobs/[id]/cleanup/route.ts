import { NextResponse } from "next/server";
import { deletePartialFiles, getJob } from "@/lib/jobs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.status === "running" || job.status === "queued") {
    return NextResponse.json({ error: "Job is still running." }, { status: 409 });
  }
  const result = deletePartialFiles(id);
  return NextResponse.json(result);
}
