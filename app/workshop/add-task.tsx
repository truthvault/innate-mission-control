"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DT } from "@/components/mission-control-ui";

/** Compact inline add-task control for a person/day cell on the week board. */
export function AddTask({ person, scheduledDate }: { person: string; scheduledDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/workshop/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed, owner: person, scheduledDate }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }
      setTitle("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          border: "1px dashed rgba(0,0,0,0.15)",
          background: "transparent",
          color: DT.textFaint,
          borderRadius: DT.radiusSm,
          minHeight: 32,
          fontSize: 11,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: DT.sans,
        }}
      >
        + Add
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={`Task for ${person}`}
        disabled={pending}
        style={{
          border: `1px solid ${DT.teal}`,
          borderRadius: DT.radiusSm,
          padding: "8px 9px",
          fontSize: 13,
          fontFamily: DT.sans,
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={submit}
          disabled={pending || !title.trim()}
          style={{ background: DT.teal, color: "#fff", border: "none", borderRadius: DT.radiusSm, minHeight: 34, padding: "0 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: DT.sans }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null); }}
          style={{ background: "transparent", color: DT.textMuted, border: "1px solid rgba(0,0,0,0.1)", borderRadius: DT.radiusSm, minHeight: 34, padding: "0 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DT.sans }}
        >
          Cancel
        </button>
      </div>
      {error ? <span style={{ fontSize: 11, color: DT.clay, fontWeight: 700 }}>{error}</span> : null}
    </div>
  );
}
