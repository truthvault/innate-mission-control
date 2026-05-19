import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, isValidAuthCookie } from "@/lib/tuesday/auth";

export async function middleware(request: NextRequest) {
  const auth = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (await isValidAuthCookie(auth)) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Exclude: login page, Next internals, favicon, the Monday webhook, the 2talk
  // inbound SMS webhook, and the preview-only freight endpoints. Public webhook
  // endpoints still validate their own shared-secret/auth in route handlers.
  // Note: /api/monday/refresh IS still matched and stays gated by the auth cookie.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api/monday/webhook|api/sms/2talk/inbound|api/freight/).*)"],
};
