import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Next's dev server only trusts its own detected host by default and
  // silently fails to hydrate the page (no console error — the page just
  // looks right and does nothing) when opened from a different one. People
  // reflexively type either "localhost" or "127.0.0.1", so both need to
  // work without a config change getting in the way.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  // The desktop app runs Next's self-contained server; web builds are unchanged. No
  // next/image here, so sharp stays out, and so does any local download archive.
  ...(process.env.STREAMPULL_DESKTOP
    ? {
        output: "standalone" as const,
        images: { unoptimized: true },
        outputFileTracingExcludes: {
          "*": ["**/node_modules/sharp/**", "**/node_modules/@img/**", "**/.ytgrab-archive.txt"],
        },
      }
    : {}),
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
