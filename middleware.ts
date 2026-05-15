import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const auth = request.cookies.get("innate-auth")?.value;
  if (auth === "authenticated") {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Exclude: login page, Next internals, favicon, the Monday webhook, and the
  // preview-only freight endpoints. The freight endpoints still validate request
  // shape/origin in route handlers and never expose server-side secrets.
  // Note: /api/monday/refresh IS still matched and stays gated by the auth cookie.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api/monday/webhook|api/freight/).*)"],
};
