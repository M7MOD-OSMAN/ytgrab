import { NextResponse } from "next/server";
import { pauseJob } from "@/lib/jobs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!pauseJob(id)) {
    return NextResponse.json({ error: "Only a running download can be paused." }, { status: 409 });
  }
  return NextResponse.json({ paused: true });
}
