import { NextResponse } from "next/server";
import { deletePartialFiles, getJob } from "@/lib/jobs";
import { isJobLive } from "@/lib/types";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  // A paused job resumes from these .part files, so they aren't leftovers yet.
  if (isJobLive(job.status)) {
    return NextResponse.json({ error: "Job is still active." }, { status: 409 });
  }
  const result = deletePartialFiles(id);
  return NextResponse.json(result);
}
