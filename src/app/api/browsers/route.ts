import { NextResponse } from "next/server";

export async function GET() {
  const common = ["chrome", "edge", "firefox", "brave", "vivaldi", "opera"];
  const list = process.platform === "darwin" ? [...common, "safari"] : common;
  return NextResponse.json({ browsers: list });
}
