"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Chip, DT, OpenHint, type ChipTone } from "@/components/mission-control-ui";
import type {
  CostingMaterialRow,
  CostingsResult,
  ProductCostingLineRow,
  ProductCostingSheetRow,
} from "@/lib/costings/fetch-costings";

export type CostingsTab = "materials" | "products";

type CostingFilter = "all" | "attention" | "review" | "blocked" | "noApproved" | "sourceBacked" | "marginWatch";
type CostingSort = "status" | "name" | "priceHigh" | "recent";
type CostingItem =
  | { kind: "material"; id: string; row: CostingMaterialRow }
  | { kind: "product"; id: string; row: ProductCostingSheetRow };

const MONEY = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 2 });

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function titleize(value: string | null | undefined, fallback = "Needs source") {
  if (!value) return fallback;
  return value.replace(/_/g, " ");
}

function money(value: number | null | undefined, fallback = "Needs source", suffix = " ex GST") {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return `${MONEY.format(value)}${suffix}`;
}

function numberValue(value: number | null | undefined, suffix = "", fallback = "Needs source") {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return `${value.toLocaleString("en-NZ", { maximumFractionDigits: 2 })}${suffix}`;
}

function dateValue(iso: string | null | undefined, fallback = "Needs source") {
  if (!iso) return fallback;
  try {
    return new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusTone(status: string | null | undefined): ChipTone {
  if (status === "fresh" || status === "approved" || status === "ready") return "green";
  if (status === "stale" || status === "needs_review" || status === "draft" || status === "unapproved") return "amber";
  if (status === "conflict" || status === "missing_source" || status === "blocked") return "red";
  return "grey";
}

function sourceBacked(row: { sourceLabel: string | null; sourceUrl: string | null; sourceType: string | null }) {
  return Boolean(row.sourceLabel || row.sourceUrl || row.sourceType);
}

function materialNeedsReview(row: CostingMaterialRow) {
  return row.priceStatus === "needs_review" || row.priceStatus === "stale" || row.priceStatus === "conflict" || row.confidence === "low" || row.confidence === "unknown";
}

function materialBlocked(row: CostingMaterialRow) {
  return Boolean(row.blocker) || row.priceStatus === "missing_source" || row.priceStatus === "conflict";
}

function materialNoApproved(row: CostingMaterialRow) {
  return row.currentApprovedUnitCostExGst === null;
}

function materialAction(row: CostingMaterialRow) {
  if (row.blocker) return row.blocker;
  if (materialNoApproved(row)) return "No approved current price";
  if (!sourceBacked(row)) return "Needs source";
  if (materialNeedsReview(row)) return "Needs review before quote";
  return "Approved price is available";
}

function productNeedsReview(row: ProductCostingSheetRow) {
  return row.readyToQuoteStatus === "needs_review" || row.status === "needs_review" || Boolean(row.staleSourceLineCount && row.staleSourceLineCount > 0);
}

function productBlocked(row: ProductCostingSheetRow) {
  return Boolean(row.blocker) || row.readyToQuoteStatus === "blocked";
}

function productMarginWatch(row: ProductCostingSheetRow) {
  return typeof row.grossMarginPercent === "number" && Number.isFinite(row.grossMarginPercent) && row.grossMarginPercent < 30;
}

function productAction(row: ProductCostingSheetRow) {
  if (row.blocker) return row.blocker;
  if (row.readyToQuoteStatus === "blocked") return "Blocked before quote use";
  if (productNeedsReview(row)) return "Needs review before quote";
  if (!sourceBacked(row)) return "Needs source";
  if (row.readyToQuoteStatus === "ready") return "Ready to quote";
  return "Source-backed costing sheet";
}

function itemLabel(item: CostingItem) {
  return item.kind === "material" ? item.row.name : item.row.productName;
}

function itemMeta(item: CostingItem) {
  if (item.kind === "material") return [item.row.supplierName, item.row.category, item.row.unit].filter(Boolean).join(" / ") || "Supplier or category not recorded";
  return [item.row.productFamily, item.row.defaultVariant, item.row.productCode].filter(Boolean).join(" / ") || "Family or variant not recorded";
}

function itemSearchText(item: CostingItem) {
  if (item.kind === "material") {
    const row = item.row;
    return normalize([row.name, row.internalCode, row.supplierCode, row.category, row.supplierName, row.unit, row.sourceLabel].filter(Boolean).join(" "));
  }
  const row = item.row;
  return normalize([row.productName, row.productCode, row.productFamily, row.defaultVariant, row.sourceLabel].filter(Boolean).join(" "));
}

function itemStatusColor(item: CostingItem) {
  if (item.kind === "material") {
    if (materialBlocked(item.row)) return "#991b1b";
    if (materialNeedsReview(item.row) || materialNoApproved(item.row)) return "#b45309";
    return DT.green;
  }
  if (productBlocked(item.row)) return "#991b1b";
  if (productNeedsReview(item.row) || productMarginWatch(item.row)) return "#b45309";
  return DT.green;
}

function itemStatusLabel(item: CostingItem) {
  if (item.kind === "material") {
    if (materialBlocked(item.row)) return "Blocked";
    if (materialNoApproved(item.row)) return "No approved price";
    if (materialNeedsReview(item.row)) return "Needs review";
    return "Usable";
  }
  if (productBlocked(item.row)) return "Blocked";
  if (productNeedsReview(item.row)) return "Needs review";
  if (productMarginWatch(item.row)) return "Margin watch";
  return item.row.readyToQuoteStatus === "ready" ? "Ready" : "Source-backed";
}

function itemPrice(item: CostingItem) {
  if (item.kind === "material") return money(item.row.currentApprovedUnitCostExGst, money(item.row.latestObservedUnitCostExGst, "No approved price"));
  return money(item.row.totalCostExGst, "Total cost missing");
}

function itemLastSource(item: CostingItem) {
  if (item.kind === "material") return dateValue(item.row.lastCheckedAt, item.row.sourceLabel || "Needs source");
  return dateValue(item.row.lastImportedAt, item.row.sourceLabel || "Needs source");
}

function itemTimestamp(item: CostingItem) {
  const iso = item.kind === "material" ? item.row.lastCheckedAt : item.row.lastImportedAt;
  return iso ? new Date(iso).getTime() : 0;
}

function itemSortValue(item: CostingItem) {
  if (item.kind === "material") return item.row.currentApprovedUnitCostExGst ?? item.row.latestObservedUnitCostExGst ?? -1;
  return item.row.totalCostExGst ?? -1;
}

function passesFilter(item: CostingItem, filter: CostingFilter) {
  if (filter === "all") return true;
  if (item.kind === "material") {
    if (filter === "attention") return materialNeedsReview(item.row) || materialBlocked(item.row);
    if (filter === "review") return materialNeedsReview(item.row);
    if (filter === "blocked") return materialBlocked(item.row);
    if (filter === "noApproved") return materialNoApproved(item.row);
    if (filter === "sourceBacked") return sourceBacked(item.row);
    if (filter === "marginWatch") return false;
    return true;
  }
  if (filter === "attention") return productNeedsReview(item.row) || productBlocked(item.row);
  if (filter === "review") return productNeedsReview(item.row);
  if (filter === "blocked") return productBlocked(item.row);
  if (filter === "noApproved") return false;
  if (filter === "sourceBacked") return sourceBacked(item.row);
  if (filter === "marginWatch") return productMarginWatch(item.row);
  return true;
}

function SourceLink({ row }: { row: { sourceLabel: string | null; sourceUrl: string | null; sourceType: string | null } }) {
  const label = row.sourceLabel || titleize(row.sourceType, "Needs source");
  if (!row.sourceUrl) return <span>{label}</span>;
  return (
    <a className="costings-source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">
      <span>{label}</span>
      <OpenHint />
    </a>
  );
}

function HealthStrip({
  result,
  activeTab,
  filter,
  onFilterChange,
}: {
  result: CostingsResult;
  activeTab: CostingsTab;
  filter: CostingFilter;
  onFilterChange: (filter: CostingFilter) => void;
}) {
  const materialAttention = result.materials.filter((row) => materialNeedsReview(row) || materialBlocked(row)).length;
  const productAttention = result.products.filter((row) => productNeedsReview(row) || productBlocked(row)).length;
  const cards: Array<{ label: string; value: number; filter: CostingFilter; color: string }> = activeTab === "materials"
    ? [
        { label: "Materials observed", value: result.materials.length, filter: "all", color: DT.textPrimary },
        { label: "Needs review / blocked", value: materialAttention, filter: materialAttention ? "attention" : "all", color: materialAttention ? "#991b1b" : DT.green },
        { label: "No approved current price", value: result.materials.filter(materialNoApproved).length, filter: "noApproved", color: result.materials.some(materialNoApproved) ? "#b45309" : DT.green },
        { label: "Source backed", value: result.materials.filter(sourceBacked).length, filter: "sourceBacked", color: DT.teal },
        { label: "Current price approved", value: result.materials.filter((row) => !materialNoApproved(row)).length, filter: "all", color: DT.green },
      ]
    : [
        { label: "Product sheets", value: result.products.length, filter: "all", color: DT.textPrimary },
        { label: "Needs review / blocked", value: productAttention, filter: productAttention ? "attention" : "all", color: productAttention ? "#991b1b" : DT.green },
        { label: "Source backed", value: result.products.filter(sourceBacked).length, filter: "sourceBacked", color: DT.teal },
        { label: "Margin watch", value: result.products.filter(productMarginWatch).length, filter: "marginWatch", color: result.products.some(productMarginWatch) ? "#b45309" : DT.textMuted },
        { label: "Line breakdown", value: result.products.filter((row) => row.lines.length > 0).length, filter: "all", color: DT.textPrimary },
      ];
  return (
    <div className="costings-health" aria-label="Costings health filters">
      {cards.map((card) => {
        const selected = filter === card.filter && card.filter !== "all";
        return (
          <button type="button" key={card.label} aria-pressed={selected} onClick={() => onFilterChange(selected ? "all" : card.filter)}>
            <span>{card.label}</span>
            <strong style={{ color: card.color }}>{card.value}</strong>
          </button>
        );
      })}
    </div>
  );
}

function CostingsRail({
  tab,
  items,
  selectedId,
  filter,
  onFilterChange,
  onSelect,
}: {
  tab: CostingsTab;
  items: CostingItem[];
  selectedId: string | null;
  filter: CostingFilter;
  onFilterChange: (filter: CostingFilter) => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CostingSort>("status");
  const filteredItems = useMemo(() => {
    const q = normalize(query);
    const statusWeight = (item: CostingItem) => {
      if (item.kind === "material") {
        if (materialBlocked(item.row)) return 0;
        if (materialNoApproved(item.row) || materialNeedsReview(item.row)) return 1;
        return 2;
      }
      if (productBlocked(item.row)) return 0;
      if (productNeedsReview(item.row) || productMarginWatch(item.row)) return 1;
      return 2;
    };
    return items
      .filter((item) => passesFilter(item, filter))
      .filter((item) => !q || itemSearchText(item).includes(q))
      .sort((a, b) => {
        if (sort === "name") return itemLabel(a).localeCompare(itemLabel(b));
        if (sort === "priceHigh") return itemSortValue(b) - itemSortValue(a);
        if (sort === "recent") return itemTimestamp(b) - itemTimestamp(a);
        return statusWeight(a) - statusWeight(b) || itemLabel(a).localeCompare(itemLabel(b));
      });
  }, [filter, items, query, sort]);

  const filterOptions: Array<{ id: CostingFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "review", label: "Review" },
    { id: "blocked", label: "Blocked" },
    { id: "noApproved", label: "No approved" },
    { id: "sourceBacked", label: "Source" },
  ];
  if (tab === "products") filterOptions.push({ id: "marginWatch", label: "Margin" });

  return (
    <aside className="costings-rail" aria-label={tab === "materials" ? "Supplier and material costings" : "Product costing sheets"}>
      <div className="costings-rail-head">
        <div>
          <span>{tab === "materials" ? "Suppliers and materials" : "Product sheets"}</span>
          <strong>{filteredItems.length} in view</strong>
        </div>
      </div>
      <div className="costings-rail-controls">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "materials" ? "Search materials" : "Search products"} />
        <select value={sort} onChange={(event) => setSort(event.target.value as CostingSort)} aria-label="Sort costings">
          <option value="status">Needs attention</option>
          <option value="name">Name A-Z</option>
          <option value="priceHigh">Highest cost</option>
          <option value="recent">Recent source</option>
        </select>
      </div>
      <div className="costings-quick-filters">
        {filterOptions.map((option) => (
          <button type="button" key={option.id} aria-pressed={filter === option.id} onClick={() => onFilterChange(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="costings-rail-list">
        {filteredItems.map((item) => (
          <RailItem key={`${item.kind}-${item.id}`} item={item} selected={selectedId === item.id} onSelect={onSelect} />
        ))}
        {filteredItems.length === 0 ? <div className="costings-empty-rail">No rows match that view.</div> : null}
      </div>
    </aside>
  );
}

function RailItem({ item, selected, onSelect }: { item: CostingItem; selected: boolean; onSelect: (id: string) => void }) {
  const color = itemStatusColor(item);
  return (
    <button type="button" className="costings-rail-item" data-selected={selected ? "true" : "false"} style={{ borderLeftColor: color }} onClick={() => onSelect(item.id)}>
      <div className="costings-rail-main">
        <strong>{itemLabel(item)}</strong>
        <span>{itemMeta(item)}</span>
        <em>{item.kind === "material" ? materialAction(item.row) : productAction(item.row)}</em>
      </div>
      <div className="costings-rail-side">
        <span>{itemPrice(item)}</span>
        <Chip label={itemStatusLabel(item)} tone={color === "#991b1b" ? "red" : color === "#b45309" ? "amber" : "green"} />
        <small>{itemLastSource(item)}</small>
      </div>
    </button>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="costings-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="costings-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function MaterialDetail({ row }: { row: CostingMaterialRow }) {
  const state = itemStatusLabel({ kind: "material", id: row.id, row });
  return (
    <article className="costings-detail-card">
      <div className="costings-detail-hero">
        <div>
          <span>Material proof</span>
          <h2>{row.name}</h2>
          <p>{[row.supplierName, row.category, row.internalCode].filter(Boolean).join(" / ") || "Supplier, category, or code not recorded"}</p>
        </div>
        <div className="costings-hero-price">
          <strong>{money(row.currentApprovedUnitCostExGst, "No approved price")}</strong>
          <Chip label={state} tone={statusTone(row.priceStatus)} />
        </div>
      </div>
      <div className="costings-action-line" data-tone={materialBlocked(row) ? "red" : materialNeedsReview(row) || materialNoApproved(row) ? "amber" : "green"}>
        {materialAction(row)}
      </div>
      <dl className="costings-fact-grid">
        <Fact label="Supplier">{row.supplierName || "Needs source"}</Fact>
        <Fact label="Supplier ref">{row.supplierCode || "Needs source"}</Fact>
        <Fact label="Unit">{row.unit || "Needs source"}</Fact>
        <Fact label="Observed price">{money(row.latestObservedUnitCostExGst, "Needs source")}</Fact>
        <Fact label="Approved date">{dateValue(row.currentApprovedAt, row.currentApprovedUnitCostExGst === null ? "No approved price" : "Needs source")}</Fact>
        <Fact label="Last checked">{dateValue(row.lastCheckedAt)}</Fact>
        <Fact label="Confidence">{titleize(row.confidence, "Needs source")}</Fact>
        <Fact label="Source"><SourceLink row={row} /></Fact>
      </dl>
      <DetailSection title="Freight and delivery">
        <dl className="costings-inline-facts">
          <Fact label="Average inbound freight">{row.averageInboundFreightExGst === null ? "Needs source" : `${money(row.averageInboundFreightExGst)} from ${numberValue(row.averageInboundFreightSampleCount, " samples", "0 samples")}`}</Fact>
          <Fact label="Latest inbound freight">{money(row.latestInboundFreightExGst, "Needs source")}</Fact>
          <Fact label="Customer delivery charge">{money(row.customerDeliveryChargeExGst, "Needs source")}</Fact>
        </dl>
      </DetailSection>
      <DetailSection title="Xero and notes">
        <div className="costings-proof-list">
          <div><strong>Xero bill</strong><span>{[row.latestXeroBillNumber, dateValue(row.latestXeroBillDate, ""), row.latestXeroLineDescription].filter(Boolean).join(" / ") || "Needs source"}</span></div>
          <div><strong>Notes</strong><span>{row.notes || "No notes recorded"}</span></div>
        </div>
      </DetailSection>
    </article>
  );
}

function CostLadder({ row }: { row: ProductCostingSheetRow }) {
  const ladder = [
    { label: "Materials", value: row.totalMaterialsExGst },
    { label: "Labour", value: row.totalLabourCostExGst },
    { label: "Other", value: row.otherCostsExGst },
    { label: "Total", value: row.totalCostExGst },
    { label: "Sell", value: row.sellPriceExGst },
    { label: "Margin", value: row.grossMarginPercent, percent: true },
  ];
  return (
    <div className="costings-ladder">
      {ladder.map((step, index) => (
        <div key={step.label} data-final={index >= 3 ? "true" : "false"}>
          <span>{step.label}</span>
          <strong>{step.percent ? numberValue(step.value, "%", "Needs source") : money(step.value, "Needs source")}</strong>
        </div>
      ))}
    </div>
  );
}

function ProductLines({ lines }: { lines: ProductCostingLineRow[] }) {
  if (!lines.length) return <div className="costings-soft-empty">No line-level breakdown was returned for the latest version.</div>;
  return (
    <div className="costings-lines">
      {lines.map((line) => (
        <div className="costings-line" key={line.id}>
          <div>
            <strong>{line.lineLabel}</strong>
            <span>{[titleize(line.lineType, "Other"), line.sourceLineReference].filter(Boolean).join(" / ")}</span>
          </div>
          <div>
            <span>{numberValue(line.quantity, line.unit ? ` ${line.unit}` : "", "Qty missing")}</span>
            <span>{money(line.unitCostExGst, "Unit missing")}</span>
            <strong>{money(line.totalCostExGst, "Total missing")}</strong>
            <Chip label={titleize(line.freshnessStatus)} tone={statusTone(line.freshnessStatus)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductDetail({ row }: { row: ProductCostingSheetRow }) {
  const state = itemStatusLabel({ kind: "product", id: row.id, row });
  return (
    <article className="costings-detail-card">
      <div className="costings-detail-hero">
        <div>
          <span>Product costing sheet</span>
          <h2>{row.productName}</h2>
          <p>{[row.productFamily, row.defaultVariant, row.productCode].filter(Boolean).join(" / ") || "Family, variant, or code not recorded"}</p>
        </div>
        <div className="costings-hero-price">
          <strong>{money(row.totalCostExGst, "Total cost missing")}</strong>
          <div className="costings-chip-stack">
            <Chip label={state} tone={productBlocked(row) ? "red" : productNeedsReview(row) || productMarginWatch(row) ? "amber" : "green"} />
            <Chip label={titleize(row.readyToQuoteStatus)} tone={statusTone(row.readyToQuoteStatus)} />
          </div>
        </div>
      </div>
      <div className="costings-action-line" data-tone={productBlocked(row) ? "red" : productNeedsReview(row) || productMarginWatch(row) ? "amber" : "green"}>
        {productAction(row)}
      </div>
      <dl className="costings-fact-grid">
        <Fact label="Sell price ex GST">{money(row.sellPriceExGst, "Needs source")}</Fact>
        <Fact label="Sell price incl GST">{money(row.sellPriceInclGst, "Needs source", " incl GST")}</Fact>
        <Fact label="Gross profit">{money(row.grossProfitExGst, "Needs source")}</Fact>
        <Fact label="Gross margin">{numberValue(row.grossMarginPercent, "%", "Needs source")}</Fact>
        <Fact label="Labour hours">{numberValue(row.totalLabourHours, " h", "Needs source")}</Fact>
        <Fact label="Stale source lines">{numberValue(row.staleSourceLineCount, "", "0")}</Fact>
        <Fact label="Last imported">{dateValue(row.lastImportedAt)}</Fact>
        <Fact label="Source"><SourceLink row={row} /></Fact>
      </dl>
      <DetailSection title="Cost ladder">
        <CostLadder row={row} />
      </DetailSection>
      <DetailSection title="Latest version lines">
        <ProductLines lines={row.lines} />
      </DetailSection>
      <DetailSection title="Notes">
        <div className="costings-proof-list">
          <div><strong>Blocker</strong><span>{row.blocker || "No blocker recorded"}</span></div>
          <div><strong>Notes</strong><span>{row.notes || "No notes recorded"}</span></div>
        </div>
      </DetailSection>
    </article>
  );
}

function EmptyState({ tab }: { tab: CostingsTab }) {
  return (
    <section className="costings-empty-state">
      <h2>{tab === "materials" ? "No source-backed material rows yet" : "No source-backed product costing sheets yet"}</h2>
      <p>Tuesday can read the Costings tables, but this view has no rows. Costs stay blank until a source-backed observation, approval, or product sheet exists.</p>
    </section>
  );
}

export function CostingsClient({ result, activeTab }: { result: CostingsResult; activeTab: CostingsTab }) {
  const [filterByTab, setFilterByTab] = useState<Partial<Record<CostingsTab, CostingFilter>>>({});
  const [selectedByTab, setSelectedByTab] = useState<Partial<Record<CostingsTab, string>>>({});
  const filter = filterByTab[activeTab] || "all";
  const items = useMemo<CostingItem[]>(() => {
    if (activeTab === "materials") return result.materials.map((row) => ({ kind: "material", id: row.id, row }));
    return result.products.map((row) => ({ kind: "product", id: row.id, row }));
  }, [activeTab, result.materials, result.products]);
  const selectedId = selectedByTab[activeTab] || null;
  const firstMatchingFilter = items.find((item) => passesFilter(item, filter)) || null;
  const selected = (selectedId ? items.find((item) => item.id === selectedId && passesFilter(item, filter)) : null) || firstMatchingFilter || (filter === "all" ? items[0] || null : null);
  const setActiveFilter = (nextFilter: CostingFilter) => {
    setFilterByTab((current) => ({ ...current, [activeTab]: nextFilter }));
  };
  const setActiveSelectedId = (nextId: string) => {
    setSelectedByTab((current) => ({ ...current, [activeTab]: nextId }));
  };

  return (
    <section className="costings-command" aria-label="Costings command view">
      <style>{`
        .costings-command{display:grid;gap:10px}
        .costings-notice{background:#fff8eb;border:1px solid rgba(210,174,109,.30);color:#79541d;border-radius:10px;padding:10px 12px;font-family:${DT.sans};font-size:12px;line-height:1.4}
        .costings-health{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px}
        .costings-health button{min-width:0;min-height:58px;border:1px solid ${DT.border};background:rgba(255,255,255,.78);border-radius:10px;padding:7px 8px;text-align:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.025)}
        .costings-health button[aria-pressed="true"]{background:${DT.tealSoft};border-color:rgba(79,95,168,.28);box-shadow:0 0 0 2px rgba(79,95,168,.07)}
        .costings-health span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${DT.textFaint};font-family:${DT.sans};font-size:8.5px;font-weight:950;text-transform:uppercase;letter-spacing:.04em}
        .costings-health strong{display:block;margin-top:3px;color:${DT.textPrimary};font-family:${DT.serif};font-size:20px;line-height:1}
        .costings-workspace{display:grid;grid-template-columns:334px minmax(0,1fr);gap:12px;align-items:start}
        .costings-rail,.costings-detail-card,.costings-empty-state{background:rgba(255,255,255,.84);border:1px solid ${DT.border};border-radius:${DT.radius}px;box-shadow:${DT.shadow}}
        .costings-rail{overflow:hidden}
        .costings-rail-head{padding:12px;border-bottom:1px solid ${DT.border};display:flex;justify-content:space-between;gap:10px}
        .costings-rail-head span{display:block;color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
        .costings-rail-head strong{display:block;margin-top:2px;color:${DT.textPrimary};font-family:${DT.serif};font-size:18px;line-height:1}
        .costings-rail-controls{padding:10px;display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:6px}
        .costings-rail-controls input,.costings-rail-controls select{min-width:0;border:1px solid ${DT.border};border-radius:9px;background:${DT.cardBg};color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;padding:8px 9px;outline:none}
        .costings-rail-controls select{font-size:11px;font-weight:850;color:${DT.textMuted}}
        .costings-quick-filters{display:flex;gap:4px;padding:0 10px 10px;flex-wrap:nowrap}
        .costings-quick-filters button{flex:1 1 0;min-width:0;border:1px solid ${DT.border};background:rgba(255,255,255,.72);color:${DT.textMuted};border-radius:999px;padding:6px 5px;font-family:${DT.sans};font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}
        .costings-quick-filters button[aria-pressed="true"]{background:${DT.tealSoft};border-color:rgba(79,95,168,.32);color:${DT.teal}}
        .costings-rail-list{display:flex;flex-direction:column;gap:8px;padding:0 10px 10px}
        .costings-rail-item{width:100%;border-width:1px 1px 1px 4px;border-style:solid;border-color:${DT.border};background:${DT.cardBg};border-radius:10px;padding:10px;text-align:left;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;box-shadow:0 1px 4px rgba(0,0,0,.025);transition:transform 160ms ease,box-shadow 160ms ease}
        .costings-rail-item:hover{transform:translateX(-2px);box-shadow:0 8px 18px rgba(0,0,0,.06)}
        .costings-rail-item[data-selected="true"]{background:linear-gradient(135deg,${DT.cardBg},rgba(79,95,168,.07));box-shadow:0 0 0 2px rgba(79,95,168,.08)}
        .costings-rail-main{min-width:0}.costings-rail-main strong{display:block;color:${DT.textPrimary};font-family:${DT.sans};font-size:13px;font-weight:950;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.costings-rail-main span{display:block;margin-top:4px;color:${DT.textMuted};font-family:${DT.sans};font-size:10px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.costings-rail-main em{display:block;margin-top:5px;color:${DT.textSecondary};font-family:${DT.sans};font-size:10px;font-style:normal;font-weight:850;line-height:1.25}
        .costings-rail-side{text-align:right;display:grid;gap:4px;justify-items:end;align-content:start}.costings-rail-side>span{color:${DT.textPrimary};font-family:${DT.sans};font-size:11px;font-weight:950;white-space:nowrap}.costings-rail-side small{color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:850;white-space:nowrap}
        .costings-detail-card{padding:14px}
        .costings-detail-hero{display:flex;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:1px solid ${DT.border}}
        .costings-detail-hero span{display:block;color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.costings-detail-hero h2{margin:3px 0 4px;color:${DT.textPrimary};font-family:${DT.serif};font-size:27px;line-height:1.06;letter-spacing:0}.costings-detail-hero p{margin:0;color:${DT.textMuted};font-family:${DT.sans};font-size:12px;line-height:1.35}
        .costings-hero-price{text-align:right;display:grid;gap:7px;justify-items:end;align-content:start}.costings-hero-price strong{color:${DT.textPrimary};font-family:${DT.serif};font-size:23px;line-height:1}
        .costings-chip-stack{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
        .costings-action-line{margin-top:12px;border-radius:10px;padding:10px 11px;font-family:${DT.sans};font-size:13px;font-weight:900;line-height:1.25}
        .costings-action-line[data-tone="red"]{background:rgba(153,27,27,.08);border:1px solid rgba(153,27,27,.20);color:#991b1b}.costings-action-line[data-tone="amber"]{background:${DT.goldSoft};border:1px solid rgba(210,174,109,.28);color:#8a5b1f}.costings-action-line[data-tone="green"]{background:${DT.greenBg};border:1px solid rgba(79,127,89,.18);color:${DT.green}}
        .costings-fact-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0 0}
        .costings-fact,.costings-inline-facts .costings-fact{min-width:0;border:1px solid rgba(44,37,32,.06);background:#f8f5ef;border-radius:8px;padding:9px}
        .costings-fact dt{margin:0 0 5px;color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.07em}.costings-fact dd{margin:0;color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;font-weight:800;line-height:1.35;overflow-wrap:anywhere}
        .costings-detail-section{margin-top:14px}.costings-detail-section h3{margin:0 0 8px;color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.05em}.costings-inline-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0}
        .costings-source-link{display:inline-flex;align-items:center;gap:6px;color:${DT.teal};font-weight:900;text-decoration:none}
        .costings-proof-list{display:grid;gap:6px}.costings-proof-list div{display:grid;grid-template-columns:132px minmax(0,1fr);gap:10px;border-top:1px solid ${DT.border};padding-top:8px}.costings-proof-list strong{color:${DT.textMuted};font-family:${DT.sans};font-size:11px}.costings-proof-list span{color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;line-height:1.4;overflow-wrap:anywhere}
        .costings-ladder{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.costings-ladder div{border:1px solid ${DT.border};background:#f8f5ef;border-radius:8px;padding:9px;min-width:0}.costings-ladder div[data-final="true"]{background:rgba(79,95,168,.07);border-color:rgba(79,95,168,.16)}.costings-ladder span{display:block;color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:950;text-transform:uppercase}.costings-ladder strong{display:block;margin-top:4px;color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;font-weight:950;overflow-wrap:anywhere}
        .costings-lines{display:grid;gap:6px}.costings-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border-width:1px 1px 1px 4px;border-style:solid;border-color:${DT.border} ${DT.border} ${DT.border} ${DT.sage};background:${DT.cardBg};border-radius:9px;padding:8px}.costings-line strong{color:${DT.textPrimary};font-family:${DT.sans};font-size:12px}.costings-line span{color:${DT.textMuted};font-family:${DT.sans};font-size:10px}.costings-line>div:first-child{min-width:0}.costings-line>div:first-child strong,.costings-line>div:first-child span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.costings-line>div:last-child{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
        .costings-soft-empty,.costings-empty-rail{color:${DT.textMuted};font-family:${DT.sans};font-size:12px;line-height:1.4;padding:8px 2px}.costings-empty-state{padding:24px}.costings-empty-state h2{margin:0 0 8px;color:${DT.textPrimary};font-family:${DT.serif};font-size:24px}.costings-empty-state p{margin:0;color:${DT.textSecondary};font-family:${DT.sans};font-size:13px;line-height:1.5}
        @media(max-width:1080px){.costings-workspace{grid-template-columns:1fr}.costings-rail-controls{grid-template-columns:1fr 136px}.costings-health{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:720px){.costings-health{grid-template-columns:repeat(2,minmax(0,1fr))}.costings-workspace{gap:10px}.costings-rail-controls{grid-template-columns:1fr}.costings-quick-filters{overflow-x:auto}.costings-quick-filters button{flex:0 0 auto;padding:8px 11px}.costings-rail-item{grid-template-columns:1fr}.costings-rail-side{text-align:left;justify-items:start}.costings-detail-hero{display:grid}.costings-hero-price{text-align:left;justify-items:start}.costings-fact-grid,.costings-inline-facts,.costings-ladder{grid-template-columns:1fr}.costings-proof-list div{grid-template-columns:1fr}.costings-line{grid-template-columns:1fr}.costings-line>div:last-child{justify-content:flex-start}}
      `}</style>
      {result.errors.length ? <div className="costings-notice">{result.errors.join(" ")}</div> : null}
      <HealthStrip result={result} activeTab={activeTab} filter={filter} onFilterChange={setActiveFilter} />
      {items.length ? (
        <div className="costings-workspace">
          <CostingsRail tab={activeTab} items={items} selectedId={selected?.id || null} filter={filter} onFilterChange={setActiveFilter} onSelect={setActiveSelectedId} />
          {selected?.kind === "material" ? <MaterialDetail row={selected.row} /> : selected?.kind === "product" ? <ProductDetail row={selected.row} /> : <EmptyState tab={activeTab} />}
        </div>
      ) : (
        <EmptyState tab={activeTab} />
      )}
    </section>
  );
}
