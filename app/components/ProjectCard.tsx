"use client";

import { useState } from "react";

export interface Project {
  id: string;
  name: string;
  status: string;
  priority: string;
  progress: number;
  summary: string;
  nextAction: string;
  notes: string;
  lastModifiedTime: string;
  blockedBy: string;
}

/* ── Status: colour for dots + strip, tonal for pills ── */
const statusDot: Record<string, string> = {
  Active: "var(--color-active)",
  "In Progress": "var(--color-in-progress)",
  Planned: "var(--color-planned)",
  Parked: "var(--color-parked)",
};

const statusPillBg: Record<string, string> = {
  Active: "rgba(46,125,50,0.09)",
  "In Progress": "rgba(21,101,192,0.09)",
  Planned: "rgba(180,83,9,0.09)",
  Parked: "rgba(120,113,108,0.08)",
};

const statusPillText: Record<string, string> = {
  Active: "#1b5e20",
  "In Progress": "#0d47a1",
  Planned: "#92400e",
  Parked: "#57534e",
};

function daysAgo(isoDate: string): number {
  return Math.floor(
    (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function stripColor(stale: number, dotColor: string): string {
  if (stale >= 7) return "var(--stale-hot)";
  if (stale >= 3) return "var(--stale-warm)";
  return dotColor;
}

function staleBg(stale: number): string | undefined {
  if (stale >= 14) return "rgba(220,38,38,0.04)";
  if (stale >= 7) return "rgba(245,158,11,0.03)";
  return undefined;
}

export default function ProjectCard({
  project,
  variant = "normal",
}: {
  project: Project;
  variant?: "focus" | "normal" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const dot = statusDot[project.status] ?? "var(--color-parked)";
  const pillBg = statusPillBg[project.status] ?? "rgba(120,113,108,0.08)";
  const pillText = statusPillText[project.status] ?? "#57534e";
  const stale = project.lastModifiedTime ? daysAgo(project.lastModifiedTime) : 0;
  const strip = stripColor(stale, dot);
  const isFocus = variant === "focus";
  const isCompact = variant === "compact";

  const baseBg = isFocus
    ? "var(--bg-surface-focus)"
    : staleBg(stale) ?? "var(--bg-surface)";

  const cardClass = [
    "card w-full text-left",
    isFocus ? "card-focus" : isCompact ? "card-compact" : "card-normal",
    open ? "card-open" : "",
  ].join(" ");

  return (
    <button
      onClick={() => setOpen(!open)}
      className={cardClass}
      style={{
        borderLeft: `4px solid ${strip}`,
        borderTop: isFocus ? "2px solid var(--accent)" : undefined,
        background: baseBg,
        opacity: isCompact ? 0.55 : 1,
        padding: 0,
      }}
    >
      {/* ── Header row ─────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3"
        style={{
          padding: isFocus
            ? "20px 24px 10px"
            : isCompact
              ? "10px 12px 6px"
              : "14px 16px 8px",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="shrink-0 rounded-full"
            style={{ width: 6, height: 6, background: dot }}
          />
          <h2
            className="truncate"
            style={{
              fontSize: isFocus ? 22 : 15,
              fontWeight: 600,
              lineHeight: 1.25,
              color: "var(--text-main)",
              letterSpacing: isFocus ? "-0.01em" : undefined,
            }}
          >
            {project.name}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {stale > 7 && (
            <span
              className="font-medium rounded-full"
              style={{
                fontSize: 10,
                padding: "2px 7px",
                background: stale > 14 ? "rgba(220,38,38,0.08)" : "rgba(217,119,6,0.08)",
                color: stale > 14 ? "var(--stale-hot)" : "var(--stale-warm)",
              }}
            >
              {stale}d
            </span>
          )}
          <span
            className="status-pill font-medium rounded-full"
            style={{
              fontSize: 10,
              padding: "2px 8px",
              background: pillBg,
              color: pillText,
              transition: "transform 0.15s ease",
            }}
          >
            {project.status}
          </span>
          <svg
            className={`chevron-icon ${open ? "rotate-180" : ""}`}
            style={{
              width: 14,
              height: 14,
              color: "var(--text-faint)",
              transition: "transform 0.2s ease",
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* ── Focus: next action hero ────────────── */}
      {isFocus && !open && project.nextAction && (
        <div style={{ padding: "2px 24px 16px" }}>
          <p style={{
            fontSize: 16,
            fontWeight: 500,
            lineHeight: 1.45,
            color: "var(--text-secondary)",
          }}>
            {project.nextAction}
          </p>
        </div>
      )}

      {/* ── Progress bar (hidden on compact) ───── */}
      {!isCompact && project.progress > 0 && (
        <div style={{ padding: isFocus ? "0 24px 16px" : "0 16px 12px" }}>
          <div
            className="overflow-hidden"
            style={{ height: 3, borderRadius: 2, background: "rgba(28,25,23,0.04)" }}
          >
            <div
              className="h-full progress-fill"
              style={{
                width: `${Math.round(project.progress * 100)}%`,
                borderRadius: 2,
                background: "var(--accent)",
                opacity: 0.6,
              }}
            />
          </div>
          <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3, textAlign: "right" }}>
            {Math.round(project.progress * 100)}%
          </p>
        </div>
      )}

      {/* ── Next action (collapsed, non-focus) ─── */}
      {!isFocus && !open && !isCompact && project.nextAction && (
        <div style={{ padding: "0 16px 12px" }}>
          <p
            className="truncate"
            style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: "var(--text-secondary)" }}
          >
            {project.nextAction}
          </p>
        </div>
      )}

      {/* ── Blocked by (collapsed) ─────────────── */}
      {!open && project.blockedBy && (isCompact || project.status === "Parked") && (
        <div style={{ padding: isCompact ? "0 12px 10px" : "0 16px 10px" }}>
          <p
            className="truncate"
            style={{
              fontSize: isCompact ? 10 : 11,
              fontStyle: isCompact ? "italic" : "normal",
              color: "var(--text-faint)",
            }}
          >
            Waiting on: {project.blockedBy}
          </p>
        </div>
      )}

      {/* ── Expandable body ────────────────────── */}
      <div className={`card-body ${open ? "open" : ""}`}>
        <div>
          <div
            className="card-body-inner"
            style={{
              padding: isFocus ? "14px 24px 22px" : "12px 16px 16px",
              borderTop: "1px solid rgba(28,25,23,0.05)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {project.summary && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "var(--text-faint)", marginBottom: 3 }}>
                  Summary
                </p>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)" }}>
                  {project.summary}
                </p>
              </div>
            )}
            {project.nextAction && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "var(--text-faint)", marginBottom: 3 }}>
                  Next Action
                </p>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)" }}>
                  {project.nextAction}
                </p>
              </div>
            )}
            {project.notes && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "var(--text-faint)", marginBottom: 3 }}>
                  Notes
                </p>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", whiteSpace: "pre-line" }}>
                  {project.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
