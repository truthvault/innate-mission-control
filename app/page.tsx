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

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="col-span-1 lg:col-span-2 pt-0 pb-1">
      <p
        className="section-header uppercase"
        style={{ fontSize: 10, letterSpacing: "0.1em", color: "#9a9088" }}
      >
        {label}
      </p>
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
      <header className="bg-header text-white">
        <div className="max-w-[720px] lg:max-w-[1200px] mx-auto px-4 py-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Mission Control
          </h1>
          <p className="text-white/50 text-sm mt-1">
            {projects.length} project{projects.length !== 1 && "s"} tracked
          </p>
        </div>
      </header>

      <div className="max-w-[720px] lg:max-w-[1200px] mx-auto px-4 py-6">
        {/* Focus Now strip */}
        {focusProject && (
          <section className="mb-7">
            <p
              className="uppercase pb-2"
              style={{ fontSize: 9, letterSpacing: "0.12em", color: "#c8a96e" }}
            >
              Focus Now
            </p>
            <ProjectCard project={focusProject} variant="focus" />
          </section>
        )}

        {/* Sectioned grid */}
        <main className="space-y-7">
          {needsAttention.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 6 }}>
              <SectionHeader label="Needs Attention" />
              {needsAttention.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}

          {onTrack.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 6 }}>
              <SectionHeader label="On Track" />
              {onTrack.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}

          {parked.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 6 }}>
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
