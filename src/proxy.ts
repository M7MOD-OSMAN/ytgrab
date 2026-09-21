import { NextResponse, type NextRequest } from "next/server";

// Only the desktop app sets STREAMPULL_TOKEN: any page in the user's browser can reach its
// localhost server, so the API answers only the app window, which got the token as a cookie.
export function proxy(request: NextRequest) {
  const token = process.env.STREAMPULL_TOKEN;
  if (!token) return NextResponse.next();

  // A DNS-rebinding page arrives with its own hostname in Host.
  const host = process.env.STREAMPULL_HOST;
  if (host && request.headers.get("host") !== host) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (request.cookies.get("sp_token")?.value !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
