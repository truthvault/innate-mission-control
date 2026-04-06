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

  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left rounded-xl border border-black/5 shadow-sm hover:shadow-md transition-shadow"
      style={{
        borderLeft: `${isFocus ? 5 : 3}px solid ${leftBorder}`,
        background: isFocus ? "#fdf8f0" : "white",
        opacity: isCompact ? 0.7 : 1,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 lg:px-3 lg:py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="shrink-0 w-2.5 h-2.5 rounded-full"
            style={{ background: color }}
          />
          <h2
            className="font-semibold truncate"
            style={{ fontSize: isFocus ? 20 : 15 }}
          >
            {project.name}
          </h2>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {stale > 7 && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                background: stale > 14 ? "#fee2e2" : "#fff3e0",
                color: stale > 14 ? "#dc2626" : "#e65100",
              }}
            >
              Updated {stale}d ago
            </span>
          )}
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
            style={{ background: color }}
          >
            {project.status}
          </span>
          <svg
            className={`w-4 h-4 text-black/30 transition-transform ${open ? "rotate-180" : ""}`}
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
        <div className="px-4 pb-3 lg:px-3 lg:pb-2">
          <p className="text-[16px] font-bold leading-snug text-black/85">
            {project.nextAction}
          </p>
        </div>
      )}

      {/* Progress bar (hidden on compact) */}
      {!isCompact && project.progress > 0 && (
        <div className="px-4 pb-3 lg:px-3 lg:pb-2">
          <div className="h-1.5 rounded-full bg-black/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(project.progress * 100)}%`,
                background: color,
                opacity: 0.7,
              }}
            />
          </div>
          <p className="text-[11px] text-black/40 mt-1 text-right">
            {Math.round(project.progress * 100)}%
          </p>
        </div>
      )}

      {/* Next action preview (collapsed, non-focus) */}
      {!isFocus && !open && !isCompact && project.nextAction && (
        <div className="px-4 pb-3 lg:px-3 lg:pb-2">
          <p
            className="text-[11px] leading-snug px-2 py-1 rounded-md truncate"
            style={{ background: "#f5f0e8", color: "#5c4b28" }}
          >
            {project.nextAction}
          </p>
        </div>
      )}

      {/* Blocked by indicator (collapsed) */}
      {!open && project.blockedBy && (isCompact || project.status === "Parked") && (
        <div className={`px-4 pb-3 lg:px-3 lg:pb-2 ${isCompact ? "pt-0" : ""}`}>
          <p className="text-[11px] text-black/40 truncate">
            Waiting on: {project.blockedBy}
          </p>
        </div>
      )}

      {/* Expandable body */}
      <div className={`card-body ${open ? "open" : ""}`}>
        <div>
          <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3 lg:px-3 lg:pb-3 lg:pt-2 lg:space-y-2">
            {project.summary && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-black/40 mb-0.5">
                  Summary
                </p>
                <p className="text-sm lg:text-[13px] text-black/70 leading-relaxed">
                  {project.summary}
                </p>
              </div>
            )}
            {project.nextAction && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-black/40 mb-0.5">
                  Next Action
                </p>
                <p className="text-sm lg:text-[13px] text-black/70 leading-relaxed">
                  {project.nextAction}
                </p>
              </div>
            )}
            {project.notes && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-black/40 mb-0.5">
                  Notes
                </p>
                <p className="text-sm lg:text-[13px] text-black/70 leading-relaxed whitespace-pre-line">
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
