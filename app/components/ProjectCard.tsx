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

const statusColor: Record<string, string> = {
  Active: "var(--color-active)",
  "In Progress": "var(--color-in-progress)",
  Planned: "var(--color-planned)",
  Parked: "var(--color-parked)",
};

function daysAgo(isoDate: string): number {
  return Math.floor(
    (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function borderColor(stale: number, color: string): string {
  if (stale >= 14) return "#DC2626";
  if (stale >= 7) return "#EA580C";
  if (stale >= 3) return "#F59E0B";
  return color;
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
  const color = statusColor[project.status] ?? "var(--color-parked)";
  const stale = project.lastModifiedTime ? daysAgo(project.lastModifiedTime) : 0;
  const leftBorder = borderColor(stale, color);
  const isFocus = variant === "focus";
  const isCompact = variant === "compact";

  const baseBg = isFocus ? "#fdfaf5" : isCompact ? "white" : (staleBg(stale) ?? "white");

  const cardClass = [
    "card",
    "w-full text-left rounded-xl border-0",
    isFocus ? "card-focus" : isCompact ? "card-compact" : "card-normal",
    open ? "card-open" : "",
  ].join(" ");

  return (
    <button
      onClick={() => setOpen(!open)}
      className={cardClass}
      style={{
        borderLeft: `${isFocus ? 5 : 3}px solid ${leftBorder}`,
        borderTop: isFocus ? "2px solid #c8a96e" : undefined,
        background: baseBg,
        opacity: isCompact ? 0.55 : 1,
        padding: 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3"
        style={{
          padding: isFocus ? "16px 24px 8px" : isCompact ? "10px 12px 6px" : "12px 16px 8px",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ background: color }}
          />
          <h2
            className="font-semibold truncate"
            style={{ fontSize: isFocus ? 20 : 15, lineHeight: 1.3 }}
          >
            {project.name}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stale > 7 && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                background: stale > 14 ? "#fee2e2" : "#fff3e0",
                color: stale > 14 ? "#dc2626" : "#e65100",
              }}
            >
              {stale}d ago
            </span>
          )}
          <span
            className="status-pill text-[11px] font-medium px-2 py-0.5 rounded-full text-white transition-transform"
            style={{ background: color }}
          >
            {project.status}
          </span>
          <svg
            className={`w-3.5 h-3.5 text-black/25 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Focus: next action prominent */}
      {isFocus && !open && project.nextAction && (
        <div style={{ padding: "0 24px 12px" }}>
          <p
            className="font-semibold leading-snug"
            style={{ fontSize: 15, color: "rgba(0,0,0,0.82)" }}
          >
            {project.nextAction}
          </p>
        </div>
      )}

      {/* Progress bar (hidden on compact) */}
      {!isCompact && project.progress > 0 && (
        <div
          style={{
            padding: isFocus ? "0 24px 12px" : "0 16px 10px",
          }}
        >
          <div
            className="overflow-hidden"
            style={{
              height: 3,
              borderRadius: 2,
              background: "rgba(0,0,0,0.04)",
            }}
          >
            <div
              className="h-full progress-fill"
              style={{
                width: `${Math.round(project.progress * 100)}%`,
                borderRadius: 2,
                background: color,
                opacity: 0.65,
              }}
            />
          </div>
          <p
            className="text-right"
            style={{ fontSize: 10, color: "rgba(0,0,0,0.32)", marginTop: 3 }}
          >
            {Math.round(project.progress * 100)}%
          </p>
        </div>
      )}

      {/* Next action preview (collapsed, non-focus, non-compact) */}
      {!isFocus && !open && !isCompact && project.nextAction && (
        <div style={{ padding: "0 16px 10px" }}>
          <p
            className="leading-snug truncate"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(0,0,0,0.55)",
            }}
          >
            {project.nextAction}
          </p>
        </div>
      )}

      {/* Blocked by indicator (collapsed) */}
      {!open && project.blockedBy && (isCompact || project.status === "Parked") && (
        <div
          style={{
            padding: isCompact ? "0 12px 10px" : "0 16px 10px",
          }}
        >
          <p
            className="truncate"
            style={{
              fontSize: isCompact ? 10 : 11,
              fontStyle: isCompact ? "italic" : "normal",
              color: "rgba(0,0,0,0.35)",
            }}
          >
            Waiting on: {project.blockedBy}
          </p>
        </div>
      )}

      {/* Expandable body */}
      <div className={`card-body ${open ? "open" : ""}`}>
        <div>
          <div
            className="card-body-inner space-y-3"
            style={{
              padding: isFocus ? "12px 24px 20px" : "10px 16px 16px",
              borderTop: "1px solid rgba(0,0,0,0.05)",
            }}
          >
            {project.summary && (
              <div>
                <p
                  className="uppercase tracking-wider"
                  style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", marginBottom: 2 }}
                >
                  Summary
                </p>
                <p
                  className="leading-relaxed"
                  style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}
                >
                  {project.summary}
                </p>
              </div>
            )}
            {project.nextAction && (
              <div>
                <p
                  className="uppercase tracking-wider"
                  style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", marginBottom: 2 }}
                >
                  Next Action
                </p>
                <p
                  className="leading-relaxed"
                  style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}
                >
                  {project.nextAction}
                </p>
              </div>
            )}
            {project.notes && (
              <div>
                <p
                  className="uppercase tracking-wider"
                  style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", marginBottom: 2 }}
                >
                  Notes
                </p>
                <p
                  className="leading-relaxed whitespace-pre-line"
                  style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}
                >
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
