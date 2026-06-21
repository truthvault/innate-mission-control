"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type RealtimeRefreshStatus = "disabled" | "connecting" | "connected" | "refreshing" | "error";

type RealtimeRefreshConfig = {
  channelName: string;
  table: string;
  schema?: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  filter?: string;
  enabled?: boolean;
  debounceMs?: number;
  refreshOnChange?: boolean;
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
};

export function useRealtimeRefresh({
  channelName,
  table,
  schema = "public",
  event = "*",
  filter,
  enabled = true,
  debounceMs = 900,
  refreshOnChange = true,
  onChange,
}: RealtimeRefreshConfig) {
  const router = useRouter();
  const [status, setStatus] = useState<RealtimeRefreshStatus>(enabled ? "connecting" : "disabled");
  const [message, setMessage] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    deferStatus("connecting");

    const channel = supabase.client
      .channel(stableChannelName)
      .on(
        "postgres_changes",
        { event, schema, table, ...(filter ? { filter } : {}) },
        (payload) => {
          onChange?.(payload);
          if (!refreshOnChange) return;
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          setStatus("refreshing");
          refreshTimer.current = setTimeout(() => {
            router.refresh();
            setStatus("connected");
          }, debounceMs);
        },
      )
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
  }, [debounceMs, enabled, event, filter, onChange, refreshOnChange, router, schema, stableChannelName, table]);

  return { status, message, enabled: enabled && status !== "disabled" };
}
