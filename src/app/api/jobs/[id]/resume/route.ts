import { NextResponse } from "next/server";
import { resumeJob } from "@/lib/jobs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!resumeJob(id)) {
    return NextResponse.json({ error: "Only a paused download can be resumed." }, { status: 409 });
  }
  return NextResponse.json({ resumed: true });
}
