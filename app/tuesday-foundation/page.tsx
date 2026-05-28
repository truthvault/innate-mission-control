import { MissionControlShell } from "@/components/mission-control-shell";
import {
  TuesdayActionSafetyCard,
  TuesdayDecisionPanel,
  TuesdayDetailPanel,
  TuesdayOverviewPanel,
  TuesdaySourceEvidencePanel,
  TuesdayWorkQueuePanel,
} from "@/components/tuesday-section-panels";
import { getTuesdaySection, tuesdaySections } from "@/lib/tuesday/sections";

export default function TuesdayFoundationPage() {
  const section = getTuesdaySection("quoting");
  const liveSections = tuesdaySections.filter((item) => item.status === "live").length;
  const plannedSections = tuesdaySections.filter((item) => item.status === "planned").length;

  return (
    <MissionControlShell
      section="dashboard"
      pageTitle="Tuesday foundation"
      pageSubtitle="Internal architecture route for the reusable master shell pattern. Demo data only; no external writes."
      syncedAt={new Date().toISOString()}
      source="foundation"
      showRefresh={false}
      navMode="tuesday-master"
    >
      <div style={{ display: "grid", gap: 14 }}>
        <TuesdayOverviewPanel
          section={section}
          metrics={[
            { label: "Registered sections", value: tuesdaySections.length, tone: "good", note: `${liveSections} live, ${plannedSections} planned` },
            { label: "Protected actions", value: section.protectedActions.length, tone: "warn", note: "Customer-visible and financial actions stay gated" },
            { label: "Required panels", value: section.requiredPanels.length, tone: "neutral", note: "Each section declares its page pattern" },
          ]}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          <TuesdayWorkQueuePanel
            items={[
              {
                id: "pricing-policy",
                title: "Quote category pricing policy",
                status: "needs review",
                owner: "Guido",
                nextAction: "Review policy evidence before Hermes can draft customer-visible wording.",
                sourceFreshness: "Supabase quote spine planned for this clean worktree",
                blockers: ["unapproved_policy", "stale_source_price"],
              },
              {
                id: "supplier-prices",
                title: "Supplier price freshness",
                status: "blocked",
                owner: "Hermes",
                nextAction: "Connect source evidence and last-checked timestamps before any quote-ready state.",
                sourceFreshness: "Reference-only demo record",
                blockers: ["missing_source_price"],
              },
            ]}
          />

          <TuesdayDecisionPanel
            actionClass="draft"
            suggestedAction="Keep quoting as draft-only until source prices and owner approval are present."
            rationale="The foundation route demonstrates the action language future sections should reuse without adding write behaviour."
            blockedBy={["customer_visible_requires_approval", "financial_write_not_enabled"]}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          <TuesdayDetailPanel
            title="Section contract snapshot"
            rows={[
              { label: "Key", value: section.key, source: "registry" },
              { label: "Purpose", value: section.purpose, source: "reference/tuesday/quoting.md" },
              { label: "Objects", value: section.primaryObjects.join(", ") },
              { label: "Tables", value: section.canonicalTables.join(", ") },
              { label: "Owners", value: section.owners.join(", ") },
            ]}
          />

          <TuesdaySourceEvidencePanel
            items={[
              { source: "Tuesday architecture", record: "reference/tuesday/tuesday-master-hub-ui-architecture.md", timestamp: "2026-05-28", confidence: "high" },
              { source: "Quoting lane", record: "reference/tuesday/quoting.md", timestamp: "2026-05-27", confidence: "high", warning: "Route is planned in this clean worktree; no dirty implementation was copied." },
              { source: "Quote spine", record: "reference/quoting/README.md", timestamp: "2026-05-27", confidence: "medium" },
            ]}
          />
        </div>

        <TuesdayActionSafetyCard section={section} />
      </div>
    </MissionControlShell>
  );
}
