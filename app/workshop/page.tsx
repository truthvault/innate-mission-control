import Link from "next/link";
import { DT, Chip } from "@/components/mission-control-ui";
import { addDays, listTasksBetween, mondayOfWeek, nzToday, type WorkshopTask } from "@/lib/workshop/store";
import { WorkshopShell } from "./workshop-shell";
import { TaskRow } from "./workshop-ui";
import { AddTask } from "./add-task";

export const dynamic = "force-dynamic";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
// Workshop availability from lib/production/workshop-process-rules.ts:
// Nick Mon–Wed, Dylan Mon–Thu. Off days render dimmed, never blocked.
const AVAILABILITY: Record<string, number[]> = { Nick: [0, 1, 2], Dylan: [0, 1, 2, 3] };
const PEOPLE = ["Nick", "Dylan"] as const;

function formatDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-NZ", { month: "short", timeZone: "UTC" })}`;
}

export default async function WorkshopWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const today = nzToday();
  const anchor = params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today;
  const weekStart = mondayOfWeek(anchor);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i));

  let tasks: WorkshopTask[] = [];
  let sourceError: string | null = null;
  try {
    tasks = await listTasksBetween(days[0], days[4]);
  } catch (err) {
    sourceError = err instanceof Error ? err.message : "Supabase unavailable";
  }

  const cell = (person: string, day: string) =>
    tasks.filter((t) => t.owner === person && t.scheduled_date === day);
  const weekHours = (person: string) =>
    tasks.filter((t) => t.owner === person && t.status !== "done").reduce((sum, t) => sum + (t.estimated_hours || 0), 0);

  return (
    <WorkshopShell active="week" title="Workshop week" subtitle={`${formatDay(days[0])} – ${formatDay(days[4])} · Supabase`}>
      <style>{`
        .wk-nav{display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap}
        .wk-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
        .wk-day-col{display:flex;flex-direction:column;gap:8px}
        .wk-person-label{display:none}
        @media(max-width:900px){
          .wk-grid{grid-template-columns:1fr}
          .wk-day-hidden-empty{display:none}
        }
      `}</style>

      <div className="wk-nav">
        <WeekLink week={addDays(weekStart, -7)} label="← Previous" />
        <WeekLink week={today} label="This week" strong />
        <WeekLink week={addDays(weekStart, 7)} label="Next →" />
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {PEOPLE.map((p) => (
            <Chip key={p} label={`${p}: ${weekHours(p)}h open`} tone={p === "Nick" ? "teal" : "amber"} />
          ))}
        </span>
      </div>

      {sourceError ? (
        <div style={{ background: "rgba(154,59,47,0.08)", border: `1px solid rgba(154,59,47,0.25)`, borderRadius: DT.radiusSm, padding: 14, fontWeight: 700, color: DT.clay }}>
          Supabase is unavailable — this board cannot show the week right now. {sourceError}
        </div>
      ) : (
        <div className="wk-grid">
          {days.map((day, dayIndex) => {
            const isToday = day === today;
            return (
              <section
                key={day}
                className="wk-day-col"
                style={{
                  background: isToday ? "rgba(200,169,110,0.07)" : "transparent",
                  border: isToday ? "1px solid rgba(200,169,110,0.35)" : "1px solid rgba(0,0,0,0.05)",
                  borderRadius: DT.radius,
                  padding: 8,
                }}
              >
                <h2 style={{ margin: "2px 4px 4px", fontSize: 13, fontWeight: 900, color: isToday ? "#8a5b1f" : DT.textSecondary }}>
                  {DAY_LABELS[dayIndex]} <span style={{ fontWeight: 600, color: DT.textFaint }}>{formatDay(day)}</span>
                </h2>
                {PEOPLE.map((person) => {
                  const items = cell(person, day);
                  const offDay = !AVAILABILITY[person].includes(dayIndex);
                  return (
                    <div key={person} style={{ opacity: offDay && items.length === 0 ? 0.45 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 4px 4px" }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: person === "Nick" ? DT.teal : "#8a5b1f" }}>{person}</span>
                        {offDay ? <span style={{ fontSize: 10, color: DT.textFaint }}>off-day</span> : null}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {items.map((task) => (
                          <TaskRow key={task.id} task={task} person={person} />
                        ))}
                        <AddTask person={person} scheduledDate={day} />
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </WorkshopShell>
  );
}

function WeekLink({ week, label, strong = false }: { week: string; label: string; strong?: boolean }) {
  return (
    <Link
      href={`/workshop?week=${week}`}
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        background: strong ? DT.cardBg : "transparent",
        color: DT.textSecondary,
        borderRadius: DT.radiusSm,
        minHeight: 40,
        padding: "0 12px",
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12,
        fontWeight: 800,
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
}
