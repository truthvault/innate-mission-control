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
  // Exclude: login page, Next internals, favicon, and the Monday webhook
  // (must be callable by Monday.com with no cookie). Note: /api/monday/refresh
  // IS still matched and stays gated by the auth cookie.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api/monday/webhook).*)"],
};
