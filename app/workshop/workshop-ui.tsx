"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { DT, Chip } from "@/components/mission-control-ui";
import type { WorkshopTask } from "@/lib/workshop/store";

/** Shared client pieces for the /workshop screens: task rows with one-tap done. */

export function taskToneStyles(done: boolean): CSSProperties {
  return {
    background: done ? "rgba(110,138,106,0.10)" : DT.cardBg,
    border: done ? "1px solid rgba(110,138,106,0.30)" : "1px solid rgba(0,0,0,0.08)",
    opacity: done ? 0.75 : 1,
  };
}

export function TaskRow({
  task,
  person,
  size = "board",
  showOrder = true,
}: {
  task: WorkshopTask;
  person: string;
  size?: "board" | "kiosk";
  showOrder?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [localDone, setLocalDone] = useState(task.status === "done");
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const next = !localDone;
    setLocalDone(next);
    try {
      const response = await fetch("/api/workshop/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId: task.id, done: next, person }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }
      router.refresh();
    } catch (err) {
      setLocalDone(!next); // revert — truth beats polish
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }, [pending, localDone, task.id, person, router]);

  const kiosk = size === "kiosk";
  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={localDone}
      style={{
        ...taskToneStyles(localDone),
        display: "flex",
        alignItems: "center",
        gap: kiosk ? 14 : 9,
        width: "100%",
        textAlign: "left",
        borderRadius: DT.radiusSm,
        padding: kiosk ? "16px 16px" : "9px 10px",
        minHeight: kiosk ? 64 : 44,
        cursor: pending ? "wait" : "pointer",
        fontFamily: DT.sans,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: kiosk ? 28 : 20,
          height: kiosk ? 28 : 20,
          flex: "none",
          borderRadius: 999,
          border: localDone ? `2px solid ${DT.sage}` : "2px solid rgba(0,0,0,0.25)",
          background: localDone ? DT.sage : "transparent",
          color: DT.cardBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: kiosk ? 16 : 12,
          fontWeight: 900,
        }}
      >
        {localDone ? "✓" : ""}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize: kiosk ? 17 : 13,
            fontWeight: 700,
            color: DT.textPrimary,
            textDecoration: localDone ? "line-through" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {task.title}
        </span>
        {showOrder && task.order ? (
          <span style={{ fontSize: kiosk ? 13 : 11, color: DT.textMuted }}>
            {task.order.order_code ? `${task.order.order_code} · ` : ""}
            {task.order.customer_name}
          </span>
        ) : null}
        {error ? <span style={{ fontSize: 11, color: DT.clay, fontWeight: 700 }}>{error} — tap to retry</span> : null}
      </span>
      {task.estimated_hours ? (
        <span style={{ marginLeft: "auto", flex: "none" }}>
          <Chip label={`${task.estimated_hours}h`} tone="grey" />
        </span>
      ) : null}
    </button>
  );
}
