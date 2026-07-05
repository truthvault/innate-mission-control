"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type RealtimeRefreshStatus = "disabled" | "connecting" | "connected" | "refreshing" | "error";

// Data-less change signal broadcast by the DB trigger (see
// supabase/migrations/*_secure_realtime_broadcast.sql). Carries no row data —
// consumers use it only to trigger a server-side refetch.
export type RealtimeChangeSignal = { table: string; op: "INSERT" | "UPDATE" | "DELETE" | string; order_id?: string | number | null };

type RealtimeRefreshConfig = {
  channelName: string;
  table: string;
  schema?: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  /** Retained for API compatibility; scoping is now table-level via the broadcast topic. */
  filter?: string;
  enabled?: boolean;
  debounceMs?: number;
  refreshOnChange?: boolean;
  onChange?: (signal: RealtimeChangeSignal) => void;
};

export function useRealtimeRefresh({
  channelName,
  table,
  enabled = true,
  debounceMs = 900,
  refreshOnChange = true,
  onChange,
}: RealtimeRefreshConfig) {
  const router = useRouter();
  const [status, setStatus] = useState<RealtimeRefreshStatus>(enabled ? "connecting" : "disabled");
  const [message, setMessage] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Topic is table-scoped and matches the DB trigger's `rt:<table>` broadcast.
  const topic = useMemo(() => `rt:${table}`, [table]);
  // Kept for cleanup/debug parity with prior channel naming.
  const stableChannelName = useMemo(() => channelName.replace(/[^a-zA-Z0-9:_-]/g, "-"), [channelName]);

  useEffect(() => {
    let alive = true;
    const deferStatus = (nextStatus: RealtimeRefreshStatus, nextMessage = "") => {
      queueMicrotask(() => {
        if (!alive) return;
        setStatus(nextStatus);
        setMessage(nextMessage);
      });
    };

    if (!enabled) {
      deferStatus("disabled");
      return () => {
        alive = false;
      };
    }

    const supabase = createBrowserSupabaseClient();
    if (!supabase.ok) {
      deferStatus("disabled", supabase.reason);
      return () => {
        alive = false;
      };
    }

    // Private channel: only holders of the anon key (behind the app's auth gate)
    // may subscribe, per the realtime.messages RLS policy. No table data flows.
    supabase.client.realtime.setAuth();
    deferStatus("connecting");

    const channel = supabase.client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "change" }, (message) => {
        const signal = (message.payload ?? {}) as RealtimeChangeSignal;
        onChange?.(signal);
        if (!refreshOnChange) return;
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        setStatus("refreshing");
        refreshTimer.current = setTimeout(() => {
          router.refresh();
          setStatus("connected");
        }, debounceMs);
      })
      .subscribe((nextStatus) => {
        if (nextStatus === "SUBSCRIBED") {
          setStatus("connected");
          setMessage("");
        } else if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT" || nextStatus === "CLOSED") {
          setStatus("error");
          setMessage(`Realtime ${nextStatus.toLowerCase().replace("_", " ")}`);
        }
      });

    return () => {
      alive = false;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.client.removeChannel(channel);
    };
  }, [debounceMs, enabled, onChange, refreshOnChange, router, stableChannelName, topic]);

  return { status, message, enabled: enabled && status !== "disabled" };
}
