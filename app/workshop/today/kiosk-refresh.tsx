"use client";

import { useRealtimeRefresh } from "@/lib/supabase/use-realtime-refresh";

/** Keeps the kiosk current: refreshes the server-rendered task list when tasks change. */
export function KioskRefresh() {
  useRealtimeRefresh({
    channelName: "workshop-today-tasks",
    table: "production_order_tasks",
    debounceMs: 1200,
  });
  return null;
}
