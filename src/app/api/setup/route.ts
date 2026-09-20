import { NextResponse } from "next/server";
import { getSetupStatus } from "@/lib/binaries";
import { commonDownloadDirs, defaultDownloadDir } from "@/lib/paths";

export async function GET() {
  const status = getSetupStatus(true);
  return NextResponse.json({
    ...status,
    defaultDownloadDir: defaultDownloadDir(),
    folderChoices: commonDownloadDirs(),
  });
}
