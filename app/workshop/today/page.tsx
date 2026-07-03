import Link from "next/link";
import { DT } from "@/components/mission-control-ui";
import { listTasksBetween, nzToday, type WorkshopTask } from "@/lib/workshop/store";
import { WorkshopShell } from "../workshop-shell";
import { TaskRow } from "../workshop-ui";
import { KioskRefresh } from "./kiosk-refresh";

export const dynamic = "force-dynamic";

const PEOPLE = ["Nick", "Dylan"] as const;
type Person = (typeof PEOPLE)[number];

export default async function WorkshopTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const params = await searchParams;
  const person: Person = params.person?.toLowerCase() === "dylan" ? "Dylan" : "Nick";
  const today = nzToday();

  let tasks: WorkshopTask[] = [];
  let sourceError: string | null = null;
  try {
    tasks = (await listTasksBetween(today, today)).filter((t) => t.owner === person);
  } catch (err) {
    sourceError = err instanceof Error ? err.message : "Supabase unavailable";
  }

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <WorkshopShell active="today" title={`${person}'s day`} subtitle={dateLabel}>
      <KioskRefresh />
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {PEOPLE.map((p) => (
          <Link
            key={p}
            href={`/workshop/today?person=${p.toLowerCase()}`}
            style={{
              flex: 1,
              maxWidth: 220,
              textAlign: "center",
              minHeight: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: DT.radius,
              textDecoration: "none",
              fontSize: 17,
              fontWeight: 900,
              fontFamily: DT.sans,
              color: p === person ? "#fff" : DT.textSecondary,
              background: p === person ? DT.teal : DT.cardBg,
              border: p === person ? `1px solid ${DT.teal}` : "1px solid rgba(0,0,0,0.1)",
            }}
          >
            {p}
          </Link>
        ))}
      </div>

      {sourceError ? (
        <div style={{ background: "rgba(154,59,47,0.08)", border: "1px solid rgba(154,59,47,0.25)", borderRadius: DT.radiusSm, padding: 16, fontWeight: 700, color: DT.clay, fontSize: 15 }}>
          Supabase is unavailable — today&apos;s list can&apos;t load. This is a source problem, not an empty day. {sourceError}
        </div>
      ) : tasks.length === 0 ? (
        <div style={{ background: DT.cardBg, border: "1px solid rgba(0,0,0,0.08)", borderRadius: DT.radius, padding: 22, fontSize: 16, fontWeight: 700, color: DT.textSecondary }}>
          Supabase responded — no tasks are scheduled for {person} today. Check the{" "}
          <Link href="/workshop" style={{ color: DT.teal }}>Week board</Link> for what&apos;s next.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
            {open.map((task) => (
              <TaskRow key={task.id} task={task} person={person} size="kiosk" />
            ))}
          </div>
          {done.length > 0 ? (
            <>
              <h2 style={{ fontSize: 13, fontWeight: 900, color: DT.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "22px 0 8px" }}>
                Done today · {done.length}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
                {done.map((task) => (
                  <TaskRow key={task.id} task={task} person={person} size="kiosk" />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </WorkshopShell>
  );
}
