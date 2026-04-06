export const dynamic = "force-dynamic";

import Airtable from "airtable";
import ProjectCard, { type Project } from "./components/ProjectCard";

const priorityOrder: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

async function getProjects(): Promise<Project[]> {
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
    "apphs7DnsHiLGdNbc"
  );

  const records = await base("tblIts3AQk8GErFY9")
    .select({ view: "Grid view" })
    .all();

  const projects: Project[] = records.map((r) => ({
    id: r.id,
    name: (r.get("Project Name") as string) ?? "",
    status: (r.get("Status") as string) ?? "",
    priority: (r.get("Priority") as string) ?? "Low",
    progress: (r.get("Progress") as number) ?? 0,
    summary: (r.get("Summary") as string) ?? "",
    nextAction: (r.get("Next Action") as string) ?? "",
    notes: (r.get("Notes") as string) ?? "",
    lastModifiedTime: (r.get("Last Modified") as string) ?? "",
    blockedBy: (r.get("Blocked By") as string) ?? "",
  }));

  projects.sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99)
  );

  return projects;
}

const sectionIcons: Record<string, React.ReactNode> = {
  "Needs Attention": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  "On Track": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Parked: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="10" y1="15" x2="10" y2="9" />
      <line x1="14" y1="15" x2="14" y2="9" />
    </svg>
  ),
};

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="col-span-1 lg:col-span-2 pt-0 pb-1.5">
      <div
        className="section-header"
        style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}
      >
        {sectionIcons[label]}
        <span>{label}</span>
      </div>
    </div>
  );
}

export default async function Page() {
  const projects = await getProjects();

  // Change 1: Pull the first High-priority project out as Focus
  const focusProject = projects.find((p) => p.priority === "High");
  const rest = focusProject
    ? projects.filter((p) => p.id !== focusProject.id)
    : projects;

  // Change 2: Group remaining into sections
  const needsAttention = rest.filter(
    (p) => p.status === "Active" || p.status === "In Progress"
  );
  const onTrack = rest.filter((p) => p.status === "Planned");
  const parked = rest.filter(
    (p) => p.status === "Parked" || !["Active", "In Progress", "Planned"].includes(p.status)
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="app-header">
        <div className="max-w-[720px] lg:max-w-[1200px] mx-auto px-4" style={{ padding: "18px 16px 16px" }}>
          <h1 className="header-title">Mission Control</h1>
          <p className="header-sub">
            {projects.length} project{projects.length !== 1 && "s"} tracked
          </p>
        </div>
      </header>

      <div className="max-w-[720px] lg:max-w-[1200px] mx-auto px-4" style={{ paddingTop: 40, paddingBottom: 24 }}>
        {/* Focus Now strip */}
        {focusProject && (
          <section style={{ marginBottom: 36 }}>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 11,
                fontWeight: 400,
                letterSpacing: "0.08em",
                textTransform: "uppercase" as unknown as undefined,
                color: "var(--accent)",
                paddingBottom: 10,
              }}
              className="uppercase"
            >
              Focus Now
            </p>
            <ProjectCard project={focusProject} variant="focus" />
          </section>
        )}

        {/* Sectioned grid */}
        <main className="space-y-7">
          {needsAttention.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 8 }}>
              <SectionHeader label="Needs Attention" />
              {needsAttention.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}

          {onTrack.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 8 }}>
              <SectionHeader label="On Track" />
              {onTrack.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}

          {parked.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 8 }}>
              <SectionHeader label="Parked" />
              {parked.map((p) => (
                <ProjectCard key={p.id} project={p} variant="compact" />
              ))}
            </div>
          )}

          {projects.length === 0 && (
            <p className="text-center text-black/40 py-12">
              No projects found.
            </p>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="max-w-[720px] lg:max-w-[1200px] mx-auto px-4 py-8 text-center">
        <p className="text-xs text-black/30">
          Innate Mission Control — refreshed on each load
        </p>
      </footer>
    </div>
  );
}
