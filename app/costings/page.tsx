import Link from "next/link";
import { MissionControlShell } from "@/components/mission-control-shell";
import { listCostings } from "@/lib/costings/fetch-costings";
import { CostingsClient, type CostingsTab } from "./CostingsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type TabStyleKey = "border" | "cardBg" | "textSecondary" | "textPrimary" | "sans";
const TAB: Record<TabStyleKey, string> = {
  border: "rgba(44,37,32,0.09)",
  cardBg: "#fffdf9",
  textSecondary: "#5d554c",
  textPrimary: "#2c2520",
  sans: "var(--font-sans), 'Figtree', -apple-system, BlinkMacSystemFont, sans-serif",
};

function Tabs({ active }: { active: CostingsTab }) {
  const linkStyle = (selected: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    padding: "0 13px",
    borderRadius: 999,
    border: `1px solid ${selected ? TAB.textPrimary : TAB.border}`,
    background: selected ? TAB.textPrimary : TAB.cardBg,
    color: selected ? "#fff" : TAB.textSecondary,
    fontFamily: TAB.sans,
    fontSize: 12,
    fontWeight: 850,
    textDecoration: "none",
    boxShadow: selected ? "0 4px 12px rgba(44,37,32,0.10)" : "none",
  });
  return (
    <nav style={{ display: "flex", gap: 7, justifyContent: "flex-end", flexWrap: "wrap" }} aria-label="Costings views">
      <Link style={linkStyle(active === "materials")} href="/costings?tab=materials">
        Suppliers & Materials
      </Link>
      <Link style={linkStyle(active === "products")} href="/costings?tab=products">
        Product Costing Sheets
      </Link>
    </nav>
  );
}

export default async function CostingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const params = searchParams ? await searchParams : {};
  const tab: CostingsTab = firstParam(params.tab) === "products" ? "products" : "materials";
  const result = await listCostings();

  return (
    <MissionControlShell
      section="costings"
      pageTitle="Costings"
      pageSubtitle="A source-backed costing command view for checking what is usable, what needs review, and where the proof came from."
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.errors.join(" | ") || undefined}
      maxWidth={1320}
      pageTitleAccessory={<Tabs active={tab} />}
    >
      <CostingsClient result={result} activeTab={tab} />
    </MissionControlShell>
  );
}
