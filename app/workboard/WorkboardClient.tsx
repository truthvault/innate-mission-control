"use client";

import { useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip, DT, KpiCard, type ChipTone } from "@/components/mission-control-ui";
import type { WorkboardResult, WorkPriority, WorkProject, WorkSource, WorkTask, WorkTaskStatus } from "@/lib/workboard/types";
import { nextTaskForProject, priorityRank, projectOpenTaskCount, visibleTodayTasks } from "@/lib/workboard/prioritisation.mjs";

type TaskAction = { label: string; status: WorkTaskStatus; aria: string };

const STATUS_LABELS: Record<WorkTaskStatus, string> = {
  inbox: "Inbox",
  next: "Next",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
  parked: "Parked",
  cancelled: "Cancelled",
};

const PRIORITY_LABELS: Record<WorkPriority, string> = {
  cash: "Cash",
  high: "High",
  normal: "Normal",
  later: "Later",
};

function priorityTone(priority: WorkPriority): ChipTone {
  if (priority === "cash") return "green";
  if (priority === "high") return "amber";
  if (priority === "later") return "grey";
  return "neutral";
}

function statusTone(status: WorkTaskStatus): ChipTone {
  if (status === "done") return "green";
  if (status === "waiting") return "amber";
  if (status === "in_progress") return "teal";
  if (status === "parked" || status === "cancelled") return "grey";
  return "neutral";
}

function dateLabel(value?: string) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

async function updateTask(id: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/workboard/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Task update failed");
  return body;
}

function SourceLabel({ source }: { source?: WorkSource }) {
  if (!source) return <span style={mutedStyle}>No source</span>;
  return <span title={source.summary || source.title} style={sourceStyle}>{source.title}</span>;
}

function TaskRow({ task, project, source, actions, onStatus, disabled }: { task: WorkTask; project?: WorkProject; source?: WorkSource; actions: TaskAction[]; onStatus: (task: WorkTask, status: WorkTaskStatus) => void; disabled: boolean }) {
  return (
    <article style={taskRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 16, lineHeight: 1.25 }}>{task.title}</strong>
          <Chip label={PRIORITY_LABELS[task.priority]} tone={priorityTone(task.priority)} />
          <Chip label={STATUS_LABELS[task.status]} tone={statusTone(task.status)} />
        </div>
        <div style={{ ...mutedStyle, marginTop: 5 }}>
          {[project?.name, task.owner ? `Owner: ${task.owner}` : undefined, task.dueDate ? `Due: ${dateLabel(task.dueDate)}` : undefined].filter(Boolean).join(" · ") || "Unassigned task"}
        </div>
        <div style={{ marginTop: 7 }}><SourceLabel source={source} /></div>
      </div>
      <div style={actionBarStyle}>
        {actions.map((action) => (
          <button
            key={action.status}
            type="button"
            disabled={disabled || task.status === action.status}
            aria-label={`${action.aria} ${task.title}`}
            onClick={() => onStatus(task, action.status)}
            style={{ ...miniButtonStyle, opacity: disabled || task.status === action.status ? 0.48 : 1, cursor: disabled || task.status === action.status ? "not-allowed" : "pointer" }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <div style={{ marginBottom: 11 }}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        {subtitle && <p style={sectionSubtitleStyle}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div style={emptyStyle}>{label}</div>;
}

export default function WorkboardClient({ result }: { result: WorkboardResult }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sourcesById = useMemo(() => new Map(result.sources.map((source) => [source.id, source])), [result.sources]);
  const projectsById = useMemo(() => new Map(result.projects.map((project) => [project.id, project])), [result.projects]);
  const today = useMemo(() => visibleTodayTasks(result.tasks, 7), [result.tasks]);
  const inboxTasks = useMemo(() => result.tasks.filter((task) => task.status === "inbox"), [result.tasks]);
  const waitingTasks = useMemo(() => result.tasks.filter((task) => task.status === "waiting"), [result.tasks]);
  const doneTasks = useMemo(() => result.tasks.filter((task) => task.status === "done").sort((a, b) => String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt))).slice(0, 10), [result.tasks]);
  const activeProjects = useMemo(() => result.projects
    .filter((project) => project.status !== "done" && project.status !== "cancelled")
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.name.localeCompare(b.name, "en-NZ")), [result.projects]);

  const changeStatus = async (task: WorkTask, status: WorkTaskStatus) => {
    setError(null);
    setPendingId(task.id);
    try {
      await updateTask(task.id, { status });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  };

  const taskProject = (task: WorkTask) => task.projectId ? projectsById.get(task.projectId) : undefined;
  const taskSource = (task: WorkTask) => task.sourceId ? sourcesById.get(task.sourceId) : undefined;

  return (
    <MissionControlShell section="workboard" pageTitle="Workboard" pageSubtitle="Small daily list, source-linked work, no project-management swamp." syncedAt={result.syncedAt} source={result.source} mondayError={result.error}>
      <div style={{ display: "grid", gap: 14 }}>
        {result.error && <div style={warningStyle}><strong>Workboard not fully ready:</strong> {result.error}</div>}
        {error && <div style={errorStyle}>{error}</div>}

        <div style={kpiGridStyle}>
          <KpiCard label="Today" value={`${today.visible.length}${today.hiddenCount ? ` +${today.hiddenCount}` : ""}`} tone={today.hiddenCount ? "warn" : "neutral"} />
          <KpiCard label="Inbox" value={inboxTasks.length} tone={inboxTasks.length ? "warn" : "neutral"} />
          <KpiCard label="Waiting" value={waitingTasks.length} tone={waitingTasks.length ? "warn" : "neutral"} />
          <KpiCard label="Projects" value={activeProjects.length} />
        </div>

        <Section title="Today" subtitle="Cash and high-leverage next work only. Kept deliberately small.">
          {today.visible.length ? (
            <div style={listStyle}>
              {today.visible.map((task) => <TaskRow key={task.id} task={task} project={taskProject(task)} source={taskSource(task)} disabled={isPending || pendingId === task.id} onStatus={changeStatus} actions={todayActions} />)}
              {today.hiddenCount > 0 && <div style={overflowStyle}>More ready below — hidden to keep Today small: {today.hiddenCount}</div>}
            </div>
          ) : <EmptyState label="No active Today tasks yet. Seed Workboard or move Inbox tasks to Next." />}
        </Section>

        <Section title="Projects" subtitle="Outcome buckets, not a giant roadmap.">
          {activeProjects.length ? <div style={projectGridStyle}>{activeProjects.map((project) => {
            const next = nextTaskForProject(project.id, result.tasks);
            const source = project.sourceId ? sourcesById.get(project.sourceId) : undefined;
            return (
              <article key={project.id} style={projectCardStyle}>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
                  <Chip label={project.area.replace(/_/g, " ")} tone="teal" />
                  <Chip label={PRIORITY_LABELS[project.priority]} tone={priorityTone(project.priority)} />
                  <Chip label={project.status} tone="neutral" />
                </div>
                <h3 style={projectTitleStyle}>{project.name}</h3>
                {project.description && <p style={projectDescriptionStyle}>{project.description}</p>}
                <div style={mutedStyle}>Owner: {project.owner || "Unassigned"} · Open tasks: {projectOpenTaskCount(project.id, result.tasks)}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: DT.textPrimary, fontWeight: 800 }}>Next: {next?.title || "No open task"}</div>
                <div style={{ marginTop: 8 }}><SourceLabel source={source} /></div>
              </article>
            );
          })}</div> : <EmptyState label="No Workboard projects yet." />}
        </Section>

        <Section title="Inbox" subtitle="Captured work that still needs triage.">
          {inboxTasks.length ? <div style={listStyle}>{inboxTasks.map((task) => <TaskRow key={task.id} task={task} project={taskProject(task)} source={taskSource(task)} disabled={isPending || pendingId === task.id} onStatus={changeStatus} actions={inboxActions} />)}</div> : <EmptyState label="Inbox clear." />}
        </Section>

        <Section title="Waiting" subtitle="Blocked work visible without clogging Today.">
          {waitingTasks.length ? <div style={listStyle}>{waitingTasks.map((task) => <TaskRow key={task.id} task={task} project={taskProject(task)} source={taskSource(task)} disabled={isPending || pendingId === task.id} onStatus={changeStatus} actions={waitingActions} />)}</div> : <EmptyState label="Nothing waiting." />}
        </Section>

        <Section title="Done / Record" subtitle="Recent completed work, kept for confidence and traceability.">
          {doneTasks.length ? <div style={listStyle}>{doneTasks.map((task) => <TaskRow key={task.id} task={task} project={taskProject(task)} source={taskSource(task)} disabled={isPending || pendingId === task.id} onStatus={changeStatus} actions={doneActions} />)}</div> : <EmptyState label="No completed Workboard tasks yet." />}
        </Section>
      </div>
    </MissionControlShell>
  );
}

const todayActions: TaskAction[] = [
  { label: "Start", status: "in_progress", aria: "Start" },
  { label: "Waiting", status: "waiting", aria: "Mark waiting" },
  { label: "Done", status: "done", aria: "Mark done" },
  { label: "Park", status: "parked", aria: "Park" },
];

const inboxActions: TaskAction[] = [
  { label: "Move to Next", status: "next", aria: "Move to Next" },
  { label: "Waiting", status: "waiting", aria: "Mark waiting" },
  { label: "Park", status: "parked", aria: "Park" },
];

const waitingActions: TaskAction[] = [
  { label: "Move to Next", status: "next", aria: "Move to Next" },
  { label: "Done", status: "done", aria: "Mark done" },
  { label: "Park", status: "parked", aria: "Park" },
];

const doneActions: TaskAction[] = [
  { label: "Reopen", status: "next", aria: "Reopen" },
];

const kpiGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 };
const sectionStyle: CSSProperties = { background: "rgba(255,253,249,0.70)", border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: 14 };
const sectionTitleStyle: CSSProperties = { margin: 0, color: DT.textPrimary, fontFamily: DT.serif, fontSize: 22, letterSpacing: "-0.03em" };
const sectionSubtitleStyle: CSSProperties = { margin: "4px 0 0", color: DT.textSecondary, fontSize: 12, lineHeight: 1.45 };
const listStyle: CSSProperties = { display: "grid", gap: 8 };
const taskRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radiusSm, padding: "11px 12px" };
const actionBarStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };
const miniButtonStyle: CSSProperties = { border: `1px solid ${DT.border}`, background: "#fffaf0", color: DT.textPrimary, borderRadius: 999, padding: "6px 9px", fontFamily: DT.sans, fontWeight: 800, fontSize: 11 };
const mutedStyle: CSSProperties = { color: DT.textMuted, fontSize: 11, fontFamily: DT.sans, lineHeight: 1.35 };
const sourceStyle: CSSProperties = { ...mutedStyle, display: "inline-block", background: "rgba(79,95,168,0.07)", color: DT.teal, border: "1px solid rgba(79,95,168,0.14)", borderRadius: 999, padding: "3px 8px", fontWeight: 800, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const };
const emptyStyle: CSSProperties = { border: `1px dashed ${DT.border}`, borderRadius: DT.radiusSm, padding: 14, color: DT.textMuted, fontSize: 12, background: "rgba(255,255,255,0.45)" };
const warningStyle: CSSProperties = { background: "rgba(210,174,109,0.16)", border: "1px solid rgba(210,174,109,0.28)", borderRadius: DT.radiusSm, color: "#7a521d", padding: 12, fontSize: 12, lineHeight: 1.45 };
const errorStyle: CSSProperties = { background: "rgba(180,107,70,0.11)", border: "1px solid rgba(180,107,70,0.22)", borderRadius: DT.radiusSm, color: "#8f3f24", padding: 12, fontSize: 12, lineHeight: 1.45 };
const overflowStyle: CSSProperties = { color: DT.textMuted, background: "rgba(0,0,0,0.025)", borderRadius: DT.radiusSm, padding: 10, fontSize: 12, textAlign: "center" as const, fontWeight: 800 };
const projectGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))", gap: 10 };
const projectCardStyle: CSSProperties = { background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radiusSm, padding: 13 };
const projectTitleStyle: CSSProperties = { margin: 0, color: DT.textPrimary, fontFamily: DT.serif, fontSize: 18, lineHeight: 1.15, letterSpacing: "-0.03em" };
const projectDescriptionStyle: CSSProperties = { color: DT.textSecondary, fontSize: 12, lineHeight: 1.45, margin: "7px 0 8px" };
