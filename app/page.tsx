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

export default async function Page() {
  const projects = await getProjects();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-header text-white">
        <div className="max-w-[720px] mx-auto px-4 py-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Mission Control
          </h1>
          <p className="text-white/50 text-sm mt-1">
            {projects.length} project{projects.length !== 1 && "s"} tracked
          </p>
        </div>
      </header>

      {/* Card list */}
      <main className="max-w-[720px] mx-auto px-4 py-6 space-y-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}

        {projects.length === 0 && (
          <p className="text-center text-black/40 py-12">
            No projects found.
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-[720px] mx-auto px-4 py-8 text-center">
        <p className="text-xs text-black/30">
          Innate Mission Control — refreshed on each load
        </p>
      </footer>
    </div>
  );
}
