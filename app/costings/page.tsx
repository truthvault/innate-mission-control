import Link from "next/link";
import type { ReactNode } from "react";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip, DT, OpenHint } from "@/components/mission-control-ui";
import { listCostings, type CostingMaterialRow, type ProductCostingSheetRow } from "@/lib/costings/fetch-costings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tab = "materials" | "products";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function money(value: number | null | undefined, suffix = " ex GST") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unknown";
  return `${new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value)}${suffix}`;
}

function numberValue(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unknown";
  return `${value.toLocaleString("en-NZ", { maximumFractionDigits: 2 })}${suffix}`;
}

function dateValue(iso: string | null | undefined) {
  if (!iso) return "Unknown";
  try {
    return new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusTone(status: string): "neutral" | "amber" | "teal" | "red" | "grey" | "green" {
  if (status === "fresh" || status === "approved" || status === "ready") return "green";
  if (status === "stale" || status === "needs_review" || status === "draft") return "amber";
  if (status === "conflict" || status === "missing_source" || status === "blocked") return "red";
  return "grey";
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="costings-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SourceLink({ row }: { row: { sourceLabel: string | null; sourceUrl: string | null; sourceType: string | null } }) {
  const label = row.sourceLabel || row.sourceType || "Missing source";
  if (!row.sourceUrl) return <span>{label}</span>;
  return (
    <a className="source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">
      <span>{label}</span>
      <OpenHint />
    </a>
  );
}

function Blocker({ blocker, notes }: { blocker: string | null; notes: string | null }) {
  if (!blocker && !notes) return <span className="unknown">None recorded</span>;
  return (
    <div className="blocker">
      {blocker ? <strong>{blocker}</strong> : null}
      {notes ? <span>{notes}</span> : null}
    </div>
  );
}

function MaterialCard({ row }: { row: CostingMaterialRow }) {
  return (
    <article className="costings-card">
      <div className="costings-card-top">
        <div>
          <h2>{row.name}</h2>
          <p>{[row.internalCode, row.category, row.supplierName].filter(Boolean).join(" · ") || "No internal code, category, or supplier recorded"}</p>
        </div>
        <Chip label={row.priceStatus.replace(/_/g, " ")} tone={statusTone(row.priceStatus)} />
      </div>
      <dl className="costings-grid">
        <Field label="Supplier reference" value={row.supplierCode || "Unknown"} />
        <Field label="Unit" value={row.unit || "Unknown"} />
        <Field label="Current approved unit cost" value={money(row.currentApprovedUnitCostExGst)} />
        <Field label="Approved date" value={dateValue(row.currentApprovedAt)} />
        <Field label="Latest observed unit cost" value={money(row.latestObservedUnitCostExGst)} />
        <Field label="Source type" value={row.sourceType?.replace(/_/g, " ") || "Missing source"} />
        <Field label="Source label/reference" value={<SourceLink row={row} />} />
        <Field label="Last checked/captured" value={dateValue(row.lastCheckedAt)} />
        <Field label="Confidence" value={row.confidence} />
        <Field label="Xero reconciliation" value={[row.latestXeroBillNumber, dateValue(row.latestXeroBillDate), row.latestXeroLineDescription].filter((value) => value && value !== "Unknown").join(" · ") || "Unknown"} />
        <Field label="Average inbound freight" value={row.averageInboundFreightExGst === null ? "Unknown" : `${money(row.averageInboundFreightExGst)} from ${numberValue(row.averageInboundFreightSampleCount)} samples`} />
        <Field label="Latest inbound freight" value={money(row.latestInboundFreightExGst)} />
        <Field label="Customer delivery charge" value={money(row.customerDeliveryChargeExGst)} />
        <Field label="Notes/blocker" value={<Blocker blocker={row.blocker} notes={row.notes} />} />
      </dl>
    </article>
  );
}

function ProductCard({ row }: { row: ProductCostingSheetRow }) {
  return (
    <article className="costings-card">
      <div className="costings-card-top">
        <div>
          <h2>{row.productName}</h2>
          <p>{[row.productCode, row.productFamily, row.defaultVariant].filter(Boolean).join(" · ") || "No product code, family, or default variant recorded"}</p>
        </div>
        <div className="chip-stack">
          <Chip label={row.status.replace(/_/g, " ")} tone={statusTone(row.status)} />
          <Chip label={row.readyToQuoteStatus.replace(/_/g, " ")} tone={statusTone(row.readyToQuoteStatus)} />
        </div>
      </div>
      <dl className="costings-grid">
        <Field label="Source sheet/reference" value={<SourceLink row={row} />} />
        <Field label="Last imported/reconciled" value={dateValue(row.lastImportedAt)} />
        <Field label="Stale source lines" value={numberValue(row.staleSourceLineCount)} />
        <Field label="Materials total" value={money(row.totalMaterialsExGst)} />
        <Field label="Labour hours" value={numberValue(row.totalLabourHours, " h")} />
        <Field label="Labour cost" value={money(row.totalLabourCostExGst)} />
        <Field label="Other costs" value={money(row.otherCostsExGst)} />
        <Field label="Total cost" value={money(row.totalCostExGst)} />
        <Field label="Sell price ex GST" value={money(row.sellPriceExGst)} />
        <Field label="Sell price incl GST" value={money(row.sellPriceInclGst, " incl GST")} />
        <Field label="Gross profit" value={money(row.grossProfitExGst)} />
        <Field label="Gross margin" value={numberValue(row.grossMarginPercent, "%")} />
        <Field label="Markup" value={numberValue(row.markupPercent, "%")} />
        <Field label="Notes/blocker" value={<Blocker blocker={row.blocker} notes={row.notes} />} />
      </dl>
    </article>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <section className="empty-state">
      <h2>{tab === "materials" ? "No source-backed material rows yet" : "No source-backed product costing sheets yet"}</h2>
      <p>
        Tuesday is ready to read from Supabase, but there are no rows available for this view yet. Unknown costs stay unknown until a Drive sheet, Xero line, supplier document, Gmail evidence, calculator result, or manual note is captured with source metadata.
      </p>
    </section>
  );
}

function Tabs({ active }: { active: Tab }) {
  return (
    <nav className="tabs" aria-label="Costings views">
      <Link className={active === "materials" ? "tab tab-active" : "tab"} href="/costings?tab=materials">Suppliers & Materials</Link>
      <Link className={active === "products" ? "tab tab-active" : "tab"} href="/costings?tab=products">Product Costing Sheets</Link>
    </nav>
  );
}

export default async function CostingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const params = searchParams ? await searchParams : {};
  const tab: Tab = firstParam(params.tab) === "products" ? "products" : "materials";
  const result = await listCostings();

  return (
    <MissionControlShell
      section="costings"
      pageTitle="Costings"
      pageSubtitle="Source-backed supplier prices, materials, services, freight, labour, and reusable product costing sheets. Unknown values are left blank until evidence exists."
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.errors.join(" | ") || undefined}
      maxWidth={1320}
      pageTitleAccessory={<Tabs active={tab} />}
    >
      <style>{`
        .tabs{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap}
        .tab{display:inline-flex;align-items:center;min-height:36px;padding:0 13px;border-radius:999px;border:1px solid ${DT.border};background:${DT.cardBg};color:${DT.textSecondary};font-family:${DT.sans};font-size:12px;font-weight:850;text-decoration:none}
        .tab-active{background:${DT.textPrimary};color:#fff;border-color:${DT.textPrimary}}
        .costings-panel{display:grid;gap:12px}
        .notice{background:#fff8eb;border:1px solid rgba(210,174,109,.28);color:#79541d;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.45}
        .costings-card{background:${DT.cardBg};border:1px solid ${DT.border};border-radius:14px;box-shadow:${DT.shadow};padding:15px}
        .costings-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
        .costings-card h2{margin:0 0 4px;color:${DT.textPrimary};font-family:${DT.serif};font-size:22px;line-height:1.15;letter-spacing:0}
        .costings-card p{margin:0;color:${DT.textMuted};font-size:12px;line-height:1.4}
        .costings-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0}
        .costings-field{background:#f8f5ef;border:1px solid rgba(44,37,32,.06);border-radius:10px;padding:9px;min-width:0}
        .costings-field dt{margin:0 0 5px;color:${DT.textFaint};font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:850}
        .costings-field dd{margin:0;color:${DT.textPrimary};font-size:12px;line-height:1.35;overflow-wrap:anywhere}
        .source-link{display:inline-flex;align-items:center;gap:6px;color:${DT.teal};font-weight:800;text-decoration:none}
        .blocker{display:grid;gap:3px}.blocker strong{color:#8f3f24}.blocker span,.unknown{color:${DT.textMuted}}
        .chip-stack{display:flex;gap:6px;align-items:flex-start;justify-content:flex-end;flex-wrap:wrap}
        .empty-state{background:${DT.cardBg};border:1px dashed rgba(44,37,32,.22);border-radius:14px;padding:24px;box-shadow:${DT.shadow}}
        .empty-state h2{margin:0 0 8px;color:${DT.textPrimary};font-family:${DT.serif};font-size:24px;letter-spacing:0}
        .empty-state p{margin:0;max-width:820px;color:${DT.textSecondary};font-size:13px;line-height:1.55}
        @media(max-width:980px){.costings-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tabs{justify-content:flex-start}}
        @media(max-width:620px){.costings-card-top{display:grid}.costings-grid{grid-template-columns:1fr}.tab{flex:1 1 auto;justify-content:center}}
      `}</style>
      <section className="costings-panel" aria-label="Costings source-backed data">
        {result.errors.length ? <div className="notice">{result.errors.join(" ")}</div> : null}
        {tab === "materials" ? (
          result.materials.length ? result.materials.map((row) => <MaterialCard key={row.id} row={row} />) : <EmptyState tab="materials" />
        ) : (
          result.products.length ? result.products.map((row) => <ProductCard key={row.id} row={row} />) : <EmptyState tab="products" />
        )}
      </section>
    </MissionControlShell>
  );
}
