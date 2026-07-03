import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, isValidAuthCookie } from "@/lib/tuesday/auth";

const PUBLIC_PREFIXES = [
  "/timbers/",
  "/api/address-autocomplete",
  "/api/address-details",
  "/api/freight-estimate",
  "/api/send-quote",
  "/api/freight/",
  "/api/monday/webhook",
  "/api/sms/2talk/inbound",
  "/api/sms/slack/events",
  "/api/sms/slack/commands",
  "/api/sms/slack/context",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const auth = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (await isValidAuthCookie(auth)) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Exclude: login page, Next internals, favicon, the Monday webhook, public
  // storefront assets, and public configurator endpoints. The storefront-facing
  // endpoints still validate request shape/origin in route handlers and never
  // expose server-side secrets.
  // Note: /api/monday/refresh IS still matched and stays gated by the auth cookie.
  matcher: [
    "/((?!login|_next/static|_next/image|favicon.ico|timbers/|api/monday/webhook|api/sms/2talk/inbound|api/sms/slack/events|api/sms/slack/commands|api/sms/slack/context|api/freight/|api/address-autocomplete|api/address-details|api/freight-estimate|api/send-quote).*)",
  ],
};
