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
}

const statusColor: Record<string, string> = {
  Active: "var(--color-active)",
  "In Progress": "var(--color-in-progress)",
  Planned: "var(--color-planned)",
  Parked: "var(--color-parked)",
};

export default function ProjectCard({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const color = statusColor[project.status] ?? "var(--color-parked)";

  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left bg-white rounded-xl border border-black/5 shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="shrink-0 w-2.5 h-2.5 rounded-full"
            style={{ background: color }}
          />
          <h2 className="font-semibold text-[15px] truncate">
            {project.name}
          </h2>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
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

      {/* Progress bar */}
      {project.progress > 0 && (
        <div className="px-4 pb-3">
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

      {/* Expandable body */}
      <div className={`card-body ${open ? "open" : ""}`}>
        <div>
          <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3">
            {project.summary && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-black/40 mb-0.5">
                  Summary
                </p>
                <p className="text-sm text-black/70 leading-relaxed">
                  {project.summary}
                </p>
              </div>
            )}
            {project.nextAction && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-black/40 mb-0.5">
                  Next Action
                </p>
                <p className="text-sm text-black/70 leading-relaxed">
                  {project.nextAction}
                </p>
              </div>
            )}
            {project.notes && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-black/40 mb-0.5">
                  Notes
                </p>
                <p className="text-sm text-black/70 leading-relaxed whitespace-pre-line">
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
