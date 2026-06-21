import { NextResponse } from "next/server";
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME, createAuthCookieValue } from "@/lib/tuesday/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();

  if (!process.env.SITE_PASSWORD || password !== process.env.SITE_PASSWORD) {
    return new NextResponse(null, { status: 303, headers: { Location: "/login?error=1" } });
  }

  const response = new NextResponse(null, { status: 303, headers: { Location: "/production/plan" } });
  response.cookies.set(AUTH_COOKIE_NAME, await createAuthCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.VERCEL === "1",
    sameSite: "lax",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
