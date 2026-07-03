import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public health endpoint for Hermes/uptime monitoring.
 * Reports reachability only — no data, no secrets, no row contents.
 */
export async function GET() {
  const startedAt = Date.now();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  let supabase: "ok" | "unconfigured" | "error" = "unconfigured";
  let supabaseMs: number | null = null;
  if (url && key) {
    try {
      const t = Date.now();
      const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/orders?select=id&limit=1`, {
        headers: { apikey: key, authorization: `Bearer ${key}`, prefer: "count=none" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      supabaseMs = Date.now() - t;
      supabase = response.ok ? "ok" : "error";
    } catch {
      supabase = "error";
    }
  }

  const ok = supabase === "ok";
  return NextResponse.json(
    {
      ok,
      supabase,
      supabaseMs,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || null,
      env: process.env.VERCEL_ENV || "local",
      totalMs: Date.now() - startedAt,
    },
    { status: ok ? 200 : 503 }
  );
}
