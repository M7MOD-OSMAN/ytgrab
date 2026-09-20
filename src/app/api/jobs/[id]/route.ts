import { NextResponse } from "next/server";
import { cancelJob, getJob, snapshot } from "@/lib/jobs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json(snapshot(job));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = cancelJob(id);
  if (!ok) return NextResponse.json({ error: "Job not found or already finished." }, { status: 404 });
  return NextResponse.json({ cancelled: true });
}
