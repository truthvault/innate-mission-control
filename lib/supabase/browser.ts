import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export type BrowserSupabaseStatus =
  | { ok: true; client: SupabaseClient }
  | { ok: false; reason: string };

export function createBrowserSupabaseClient(): BrowserSupabaseStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { ok: false, reason: "Supabase realtime browser env is not configured." };
  }

  if (!browserClient) {
    browserClient = createClient(url.replace(/\/$/, ""), anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 8,
        },
      },
    });
  }

  return { ok: true, client: browserClient };
}
