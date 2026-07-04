"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Chip, DT, OpenHint, type ChipTone } from "@/components/mission-control-ui";
import type {
  CostingMaterialRow,
  CostingsResult,
  ProductCostingLineRow,
  ProductCostingSheetRow,
} from "@/lib/costings/fetch-costings";
import { useRealtimeRefresh } from "@/lib/supabase/use-realtime-refresh";

export type CostingsTab = "materials" | "products";

type CostingFilter = "all" | "attention" | "review" | "blocked" | "noApproved" | "sourceBacked" | "marginWatch";
type CostingSort = "status" | "name" | "priceHigh" | "recent";
type CostingItem =
  | { kind: "material"; id: string; row: CostingMaterialRow }
  | { kind: "product"; id: string; row: ProductCostingSheetRow };
type EditableKind = "supplier" | "material" | "observation" | "currentPrice" | "sourceLink" | "productSheet" | "productVersion" | "productLine";
type SaveState = { key: string | null; status: "idle" | "saving" | "saved" | "error"; message: string };
type SaveField = (params: { kind: EditableKind; id: string | null | undefined; field: string; value: string | number | boolean | null }) => void;

const SOURCE_TYPE_OPTIONS = ["xero_bill", "xero_invoice", "drive_sheet", "supplier_pdf", "gmail", "manual_note", "calculator", "supabase", "other"];
const CONFIDENCE_OPTIONS = ["high", "medium", "low", "unknown"];
const PRICE_STATUS_OPTIONS = ["fresh", "stale", "needs_review", "conflict", "missing_source", "approved", "rejected"];
const LINE_FRESHNESS_OPTIONS = ["fresh", "stale", "needs_review", "conflict", "missing_source"];
const SUPPLIER_TYPE_OPTIONS = ["supplier", "freight_carrier", "labour", "finish", "hardware", "steel", "timber", "service", "other"];
const MATERIAL_CATEGORY_OPTIONS = ["timber", "sheet_material", "finish", "hardware", "steel_base", "freight", "labour", "machining", "packaging", "power", "service", "other", "uncategorised"];
const CURRENT_PRICE_STATUS_OPTIONS = ["approved", "superseded", "rejected"];
const PRODUCT_STATUS_OPTIONS = ["active", "draft", "needs_review", "archived"];
const READY_STATUS_OPTIONS = ["ready", "blocked", "needs_review"];
const APPROVAL_STATUS_OPTIONS = ["unapproved", "approved", "superseded", "rejected"];
const LINE_TYPE_OPTIONS = ["material", "labour", "freight", "finish", "hardware", "steel", "machining", "service", "other"];

function useIsNarrow(breakpoint = 760) {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth <= breakpoint);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [breakpoint]);
  return isNarrow;
}

const MONEY = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 2 });

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function titleize(value: string | null | undefined, fallback = "Needs source") {
  if (!value) return fallback;
  return value.replace(/_/g, " ");
}

function inputValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function localDateTimeValue(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function saveKey(kind: EditableKind, id: string | null | undefined, field: string) {
  return `${kind}:${id || "missing"}:${field}`;
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
  if (materialNoApproved(row)) return "Approve a price from the latest supplier invoice";
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
    if (materialBlocked(item.row)) return DT.clay;
    if (materialNeedsReview(item.row) || materialNoApproved(item.row)) return "#b45309";
    return DT.green;
  }
  if (productBlocked(item.row)) return DT.clay;
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
        { label: "Needs review / blocked", value: materialAttention, filter: materialAttention ? "attention" : "all", color: materialAttention ? DT.clay : DT.green },
        { label: "No approved current price", value: result.materials.filter(materialNoApproved).length, filter: "noApproved", color: result.materials.some(materialNoApproved) ? "#b45309" : DT.green },
        { label: "Source backed", value: result.materials.filter(sourceBacked).length, filter: "sourceBacked", color: DT.teal },
        { label: "Current price approved", value: result.materials.filter((row) => !materialNoApproved(row)).length, filter: "all", color: DT.green },
      ]
    : [
        { label: "Product sheets", value: result.products.length, filter: "all", color: DT.textPrimary },
        { label: "Needs review / blocked", value: productAttention, filter: productAttention ? "attention" : "all", color: productAttention ? DT.clay : DT.green },
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
  isNarrow = false,
  expanded = false,
  onExpand,
}: {
  tab: CostingsTab;
  items: CostingItem[];
  selectedId: string | null;
  filter: CostingFilter;
  onFilterChange: (filter: CostingFilter) => void;
  onSelect: (id: string) => void;
  isNarrow?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
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
  const visibleItems = isNarrow && !expanded ? filteredItems.slice(0, 12) : filteredItems;

  return (
    <aside className="costings-rail" aria-label={tab === "materials" ? "Supplier and material costings" : "Product costing sheets"}>
      <div className="costings-rail-head">
        <div>
          <span>{tab === "materials" ? "Suppliers and materials" : "Product sheets"}</span>
          <strong>{isNarrow && visibleItems.length < filteredItems.length ? `${visibleItems.length} of ${filteredItems.length}` : `${filteredItems.length} in view`}</strong>
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
        {visibleItems.map((item) => (
          <RailItem key={`${item.kind}-${item.id}`} item={item} selected={selectedId === item.id} onSelect={onSelect} />
        ))}
        {filteredItems.length === 0 ? <div className="costings-empty-rail">No rows match that view.</div> : null}
        {visibleItems.length < filteredItems.length && onExpand ? (
          <button type="button" className="costings-show-all" onClick={onExpand}>Show all {filteredItems.length} rows</button>
        ) : null}
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
        <Chip label={itemStatusLabel(item)} tone={color === DT.clay ? "red" : color === "#b45309" ? "amber" : "green"} />
        <small>{itemLastSource(item)}</small>
      </div>
    </button>
  );
}


function firstLetter(value: string) {
  const clean = value.trim().replace(/^[^A-Za-z0-9]+/, "");
  if (!clean) return "#";
  const letter = clean[0]?.toUpperCase() || "#";
  return /[A-Z]/.test(letter) ? letter : "#";
}

function MaterialDirectory({
  materials,
  filter,
  onFilterChange,
  onSave,
  saveState,
}: {
  materials: CostingMaterialRow[];
  filter: CostingFilter;
  onFilterChange: (filter: CostingFilter) => void;
  onSave: SaveField;
  saveState: SaveState;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const q = normalize(query);
  const categories = useMemo(() => {
    const names = Array.from(new Set(materials.map((row) => row.category).filter((value): value is string => Boolean(value))));
    return names.sort((a, b) => titleize(a, a).localeCompare(titleize(b, b)));
  }, [materials]);
  const filtered = useMemo(() => materials
    .filter((row) => passesFilter({ kind: "material", id: row.id, row }, filter))
    .filter((row) => category === "all" || row.category === category)
    .filter((row) => !q || itemSearchText({ kind: "material", id: row.id, row }).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name)), [category, filter, materials, q]);
  const letters = useMemo(() => Array.from(new Set(filtered.map((row) => firstLetter(row.name)))), [filtered]);
  const materialFilters: Array<{ id: CostingFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "attention", label: "Needs attention" },
    { id: "review", label: "Review" },
    { id: "blocked", label: "Blocked" },
    { id: "noApproved", label: "No approved" },
    { id: "sourceBacked", label: "Source backed" },
  ];
  const jumpToLetter = (letter: string) => {
    const target = document.getElementById(`costings-letter-${letter}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <section className="costings-directory" aria-label="Alphabetical material directory">
      <aside className="costings-alpha-rail" aria-label="Material alphabet jump rail">
        {["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")].map((letter) => {
          const enabled = letters.includes(letter);
          return (
            <button
              type="button"
              key={letter}
              disabled={!enabled}
              onMouseEnter={() => enabled && jumpToLetter(letter)}
              onClick={() => enabled && jumpToLetter(letter)}
              aria-label={`Jump to ${letter}`}
            >
              {letter}
            </button>
          );
        })}
      </aside>
      <div className="costings-directory-main">
        <div className="costings-directory-toolbar">
          <div>
            <span>Material directory</span>
            <strong>{filtered.length.toLocaleString("en-NZ")} of {materials.length.toLocaleString("en-NZ")}</strong>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search material, supplier, code, source" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by material type">
            <option value="all">All material types</option>
            {categories.map((name) => <option key={name} value={name}>{titleize(name, name)}</option>)}
          </select>
        </div>
        <div className="costings-directory-filters">
          {materialFilters.map((option) => (
            <button type="button" key={option.id} aria-pressed={filter === option.id} onClick={() => onFilterChange(option.id)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="costings-material-list">
          {filtered.length === 0 ? <div className="costings-empty-state"><h2>No materials match that view</h2><p>Clear search, type, or attention filters to see the full material directory.</p></div> : null}
          {filtered.map((row, index) => {
            const letter = firstLetter(row.name);
            const showLetter = index === 0 || firstLetter(filtered[index - 1].name) !== letter;
            const expanded = expandedId === row.id;
            const tone = materialBlocked(row) ? "red" : materialNeedsReview(row) || materialNoApproved(row) ? "amber" : "green";
            return (
              <div key={row.id} className="costings-material-group">
                {showLetter ? <div id={`costings-letter-${letter}`} className="costings-letter-heading">{letter}</div> : null}
                <article className="costings-material-row" data-expanded={expanded ? "true" : "false"}>
                  <button type="button" className="costings-material-summary" onClick={() => setExpandedId(expanded ? null : row.id)}>
                    <span className="costings-material-name">
                      <strong>{row.name}</strong>
                      <em>{[row.supplierName, titleize(row.category, "Uncategorised"), row.unit].filter(Boolean).join(" / ") || "Supplier, type, or unit not recorded"}</em>
                    </span>
                    <span className="costings-material-price">
                      <strong>{money(row.currentApprovedUnitCostExGst, money(row.latestObservedUnitCostExGst, "No approved price"))}</strong>
                      <small>{dateValue(row.lastCheckedAt, row.sourceLabel || "Needs source")}</small>
                    </span>
                    <span className="costings-material-proof">
                      <Chip label={itemStatusLabel({ kind: "material", id: row.id, row })} tone={tone} />
                      <small>{materialAction(row)}</small>
                    </span>
                    <span className="costings-material-expand">{expanded ? "Close" : "Open"}</span>
                  </button>
                  {expanded ? <div className="costings-material-expanded"><MaterialDetail row={row} onSave={onSave} saveState={saveState} /></div> : null}
                </article>
              </div>
            );
          })}
        </div>
      </div>
    </section>
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

function FieldState({ stateKey, saveState }: { stateKey: string; saveState: SaveState }) {
  if (saveState.key !== stateKey || saveState.status === "idle") return null;
  const label = saveState.status === "saving" ? "Saving" : saveState.status === "saved" ? "Saved" : "Could not save";
  return <small data-state={saveState.status}>{saveState.message || label}</small>;
}

function EditableField({
  label,
  kind,
  id,
  field,
  value,
  onSave,
  saveState,
  type = "text",
  multiline = false,
  suffix,
  disabledReason,
}: {
  label: string;
  kind: EditableKind;
  id: string | null | undefined;
  field: string;
  value: string | number | null | undefined;
  onSave: SaveField;
  saveState: SaveState;
  type?: "text" | "number" | "date" | "datetime-local";
  multiline?: boolean;
  suffix?: string;
  disabledReason?: string;
}) {
  const key = saveKey(kind, id, field);
  const renderedValue = type === "datetime-local" ? localDateTimeValue(value as string | null | undefined) : inputValue(value);
  const disabled = !id || Boolean(disabledReason);
  const commit = (draft: string) => {
    if (disabled) return;
    const original = type === "datetime-local" ? localDateTimeValue(value as string | null | undefined) : inputValue(value);
    if (draft === original) return;
    const nextValue = type === "number" ? (draft.trim() === "" ? null : Number(draft)) : draft.trim() === "" ? null : draft;
    onSave({ kind, id, field, value: nextValue });
  };
  const control = multiline ? (
    <textarea key={`${key}:${renderedValue}`} defaultValue={renderedValue} disabled={disabled} onBlur={(event) => commit(event.currentTarget.value)} rows={3} />
  ) : (
    <input
      key={`${key}:${renderedValue}`}
      defaultValue={renderedValue}
      type={type}
      disabled={disabled}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") event.currentTarget.value = renderedValue;
      }}
    />
  );
  return (
    <label className="costings-edit-field" data-disabled={disabled ? "true" : "false"}>
      <span>{label}{suffix ? <em>{suffix}</em> : null}</span>
      {control}
      {disabledReason ? <small>{disabledReason}</small> : <FieldState stateKey={key} saveState={saveState} />}
    </label>
  );
}

function EditableSelect({
  label,
  kind,
  id,
  field,
  value,
  options,
  onSave,
  saveState,
  allowBlank = false,
  disabledReason,
}: {
  label: string;
  kind: EditableKind;
  id: string | null | undefined;
  field: string;
  value: string | null | undefined;
  options: string[];
  onSave: SaveField;
  saveState: SaveState;
  allowBlank?: boolean;
  disabledReason?: string;
}) {
  const key = saveKey(kind, id, field);
  const disabled = !id || Boolean(disabledReason);
  return (
    <label className="costings-edit-field" data-disabled={disabled ? "true" : "false"}>
      <span>{label}</span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onSave({ kind, id, field, value: event.target.value || null })}
      >
        {allowBlank ? <option value="">Blank</option> : null}
        {!allowBlank && !value ? <option value="" disabled>Select</option> : null}
        {options.map((option) => <option key={option} value={option}>{titleize(option, option)}</option>)}
      </select>
      {disabledReason ? <small>{disabledReason}</small> : <FieldState stateKey={key} saveState={saveState} />}
    </label>
  );
}

function EditableToggle({
  label,
  kind,
  id,
  field,
  value,
  onSave,
  saveState,
}: {
  label: string;
  kind: EditableKind;
  id: string | null | undefined;
  field: string;
  value: boolean;
  onSave: SaveField;
  saveState: SaveState;
}) {
  const key = saveKey(kind, id, field);
  return (
    <label className="costings-toggle">
      <input type="checkbox" checked={value} disabled={!id} onChange={(event) => onSave({ kind, id, field, value: event.target.checked })} />
      <span>{label}</span>
      <FieldState stateKey={key} saveState={saveState} />
    </label>
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

function MaterialDetail({ row, onSave, saveState }: { row: CostingMaterialRow; onSave: SaveField; saveState: SaveState }) {
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
      <DetailSection title="Editable material record">
        <div className="costings-edit-grid">
          <EditableField label="Material name" kind="material" id={row.id} field="name" value={row.name} onSave={onSave} saveState={saveState} />
          <EditableField label="Internal code" kind="material" id={row.id} field="internalCode" value={row.internalCode} onSave={onSave} saveState={saveState} />
          <EditableField label="Supplier code" kind="material" id={row.id} field="supplierCode" value={row.supplierCode} onSave={onSave} saveState={saveState} />
          <EditableSelect label="Category" kind="material" id={row.id} field="category" value={row.category} options={MATERIAL_CATEGORY_OPTIONS} onSave={onSave} saveState={saveState} />
          <EditableField label="Unit" kind="material" id={row.id} field="unit" value={row.unit} onSave={onSave} saveState={saveState} />
          <EditableToggle label="Active material" kind="material" id={row.id} field="isActive" value={row.isActive} onSave={onSave} saveState={saveState} />
          <EditableField label="Material notes" kind="material" id={row.id} field="notes" value={row.materialNotes ?? row.notes} onSave={onSave} saveState={saveState} multiline />
        </div>
      </DetailSection>
      <DetailSection title="Editable supplier">
        <div className="costings-edit-grid">
          <EditableField label="Supplier name" kind="supplier" id={row.supplierId} field="name" value={row.supplierName} onSave={onSave} saveState={saveState} disabledReason={!row.supplierId ? "No linked supplier row" : undefined} />
          <EditableSelect label="Supplier type" kind="supplier" id={row.supplierId} field="supplierType" value={row.supplierType} options={SUPPLIER_TYPE_OPTIONS} onSave={onSave} saveState={saveState} disabledReason={!row.supplierId ? "No linked supplier row" : undefined} />
          <EditableField label="Xero contact/reference" kind="supplier" id={row.supplierId} field="xeroContactId" value={row.supplierXeroContactId} onSave={onSave} saveState={saveState} disabledReason={!row.supplierId ? "No linked supplier row" : undefined} />
          <EditableField label="Website URL" kind="supplier" id={row.supplierId} field="websiteUrl" value={row.supplierWebsiteUrl} onSave={onSave} saveState={saveState} disabledReason={!row.supplierId ? "No linked supplier row" : undefined} />
          <EditableField label="Supplier notes" kind="supplier" id={row.supplierId} field="notes" value={row.supplierNotes} onSave={onSave} saveState={saveState} multiline disabledReason={!row.supplierId ? "No linked supplier row" : undefined} />
        </div>
      </DetailSection>
      <DetailSection title="Editable latest observation">
        <div className="costings-edit-grid">
          <EditableField label="Observed at" kind="observation" id={row.latestObservationId} field="observedAt" value={row.latestObservedAt} type="datetime-local" onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableSelect label="Source type" kind="observation" id={row.latestObservationId} field="sourceType" value={row.sourceType} options={SOURCE_TYPE_OPTIONS} onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="Source label" kind="observation" id={row.latestObservationId} field="sourceLabel" value={row.sourceLabel} onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="Source URL" kind="observation" id={row.latestObservationId} field="sourceUrl" value={row.sourceUrl} onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="Supplier item label" kind="observation" id={row.latestObservationId} field="supplierItemLabel" value={row.latestObservedSupplierItemLabel} onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="Quantity" kind="observation" id={row.latestObservationId} field="quantity" value={row.latestObservedQuantity} type="number" onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="Unit cost" suffix="ex GST" kind="observation" id={row.latestObservationId} field="unitCostExGst" value={row.latestObservedUnitCostExGst} type="number" onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="Line cost" suffix="ex GST" kind="observation" id={row.latestObservationId} field="lineCostExGst" value={row.latestObservedLineCostExGst} type="number" onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="GST amount" kind="observation" id={row.latestObservationId} field="gstAmount" value={row.latestObservedGstAmount} type="number" onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="Currency" kind="observation" id={row.latestObservationId} field="currency" value={row.latestObservedCurrency || "NZD"} onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableSelect label="Confidence" kind="observation" id={row.latestObservationId} field="confidence" value={row.confidence} options={CONFIDENCE_OPTIONS} onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableSelect label="Review status" kind="observation" id={row.latestObservationId} field="reviewStatus" value={row.priceStatus} options={PRICE_STATUS_OPTIONS} onSave={onSave} saveState={saveState} disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="Observation notes" kind="observation" id={row.latestObservationId} field="notes" value={row.notes} onSave={onSave} saveState={saveState} multiline disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
          <EditableField label="Blocker" kind="observation" id={row.latestObservationId} field="blocker" value={row.blocker} onSave={onSave} saveState={saveState} multiline disabledReason={!row.latestObservationId ? "No observation row yet" : undefined} />
        </div>
      </DetailSection>
      <DetailSection title="Approved current price">
        <div className="costings-readonly-note">These fields edit the explicit approved current-price row only. If no approved row exists, leave this blank rather than inventing a price.</div>
        <div className="costings-edit-grid">
          <EditableField label="Approved unit cost" suffix="ex GST" kind="currentPrice" id={row.currentPriceId} field="approvedUnitCostExGst" value={row.currentApprovedUnitCostExGst} type="number" onSave={onSave} saveState={saveState} disabledReason={!row.currentPriceId ? "No approved current price row" : undefined} />
          <EditableField label="Approved unit" kind="currentPrice" id={row.currentPriceId} field="unit" value={row.unit} onSave={onSave} saveState={saveState} disabledReason={!row.currentPriceId ? "No approved current price row" : undefined} />
          <EditableField label="Approved at" kind="currentPrice" id={row.currentPriceId} field="approvedAt" value={row.currentApprovedAt} type="datetime-local" onSave={onSave} saveState={saveState} disabledReason={!row.currentPriceId ? "No approved current price row" : undefined} />
          <EditableField label="Approved by" kind="currentPrice" id={row.currentPriceId} field="approvedBy" value={row.currentApprovedBy} onSave={onSave} saveState={saveState} disabledReason={!row.currentPriceId ? "No approved current price row" : undefined} />
          <EditableSelect label="Approval status" kind="currentPrice" id={row.currentPriceId} field="status" value={row.currentPriceStatus || "approved"} options={CURRENT_PRICE_STATUS_OPTIONS} onSave={onSave} saveState={saveState} disabledReason={!row.currentPriceId ? "No approved current price row" : undefined} />
          <EditableField label="Approval note" kind="currentPrice" id={row.currentPriceId} field="approvalNote" value={row.currentApprovalNote} onSave={onSave} saveState={saveState} multiline disabledReason={!row.currentPriceId ? "No approved current price row" : undefined} />
        </div>
      </DetailSection>
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
          <div><strong>Source proof row</strong><span>{row.sourceLinkId ? `Source link ${row.sourceLinkId}` : "No linked source proof row"}{row.sourceExternalId ? ` / ${row.sourceExternalId}` : ""}{row.sourceCapturedBy ? ` / captured by ${row.sourceCapturedBy}` : ""}</span></div>
          <div><strong>Read-only evidence</strong><span>Raw payloads, generated source hashes, and imported evidence blobs are not directly editable here so the proof trail stays intact.</span></div>
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

function ProductLines({ lines, onSave, saveState }: { lines: ProductCostingLineRow[]; onSave: SaveField; saveState: SaveState }) {
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
          <div className="costings-line-edit">
            <EditableSelect label="Type" kind="productLine" id={line.id} field="lineType" value={line.lineType} options={LINE_TYPE_OPTIONS} onSave={onSave} saveState={saveState} />
            <EditableField label="Label" kind="productLine" id={line.id} field="lineLabel" value={line.lineLabel} onSave={onSave} saveState={saveState} />
            <EditableField label="Quantity" kind="productLine" id={line.id} field="quantity" value={line.quantity} type="number" onSave={onSave} saveState={saveState} />
            <EditableField label="Unit" kind="productLine" id={line.id} field="unit" value={line.unit} onSave={onSave} saveState={saveState} />
            <EditableField label="Unit cost" suffix="ex GST" kind="productLine" id={line.id} field="unitCostExGst" value={line.unitCostExGst} type="number" onSave={onSave} saveState={saveState} />
            <EditableField label="Total cost" suffix="ex GST" kind="productLine" id={line.id} field="totalCostExGst" value={line.totalCostExGst} type="number" onSave={onSave} saveState={saveState} />
            <EditableField label="Source line ref" kind="productLine" id={line.id} field="sourceLineReference" value={line.sourceLineReference} onSave={onSave} saveState={saveState} />
            <EditableSelect label="Freshness" kind="productLine" id={line.id} field="freshnessStatus" value={line.freshnessStatus} options={LINE_FRESHNESS_OPTIONS} onSave={onSave} saveState={saveState} />
            <EditableSelect label="Confidence" kind="productLine" id={line.id} field="confidence" value={line.confidence} options={CONFIDENCE_OPTIONS} onSave={onSave} saveState={saveState} />
            <EditableField label="Notes" kind="productLine" id={line.id} field="notes" value={line.notes} onSave={onSave} saveState={saveState} multiline />
            <EditableField label="Blocker" kind="productLine" id={line.id} field="blocker" value={line.blocker} onSave={onSave} saveState={saveState} multiline />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductDetail({ row, onSave, saveState }: { row: ProductCostingSheetRow; onSave: SaveField; saveState: SaveState }) {
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
      <DetailSection title="Editable sheet record">
        <div className="costings-edit-grid">
          <EditableField label="Product title" kind="productSheet" id={row.id} field="productName" value={row.productName} onSave={onSave} saveState={saveState} />
          <EditableField label="Product code" kind="productSheet" id={row.id} field="productCode" value={row.productCode} onSave={onSave} saveState={saveState} />
          <EditableField label="Family" kind="productSheet" id={row.id} field="productFamily" value={row.productFamily} onSave={onSave} saveState={saveState} />
          <EditableField label="Variant" kind="productSheet" id={row.id} field="defaultVariant" value={row.defaultVariant} onSave={onSave} saveState={saveState} />
          <EditableSelect label="Sheet status" kind="productSheet" id={row.id} field="status" value={row.status} options={PRODUCT_STATUS_OPTIONS} onSave={onSave} saveState={saveState} />
          <EditableSelect label="Source type" kind="productSheet" id={row.id} field="sourceType" value={row.sourceType} options={SOURCE_TYPE_OPTIONS} allowBlank onSave={onSave} saveState={saveState} />
          <EditableField label="Source label" kind="productSheet" id={row.id} field="sourceLabel" value={row.sourceLabel} onSave={onSave} saveState={saveState} />
          <EditableField label="Source URL" kind="productSheet" id={row.id} field="sourceUrl" value={row.sourceUrl} onSave={onSave} saveState={saveState} />
          <EditableField label="Sheet notes" kind="productSheet" id={row.id} field="notes" value={row.sheetNotes ?? row.notes} onSave={onSave} saveState={saveState} multiline />
          <EditableField label="Sheet blocker" kind="productSheet" id={row.id} field="blocker" value={row.blocker} onSave={onSave} saveState={saveState} multiline />
        </div>
      </DetailSection>
      <DetailSection title="Editable latest version">
        <div className="costings-readonly-note">Line edits recompute the latest-version material, labour, other, total cost, gross profit, margin, and markup fields. Source hashes and raw payloads remain read-only evidence.</div>
        <div className="costings-edit-grid">
          <EditableField label="Version label" kind="productVersion" id={row.latestVersionId} field="versionLabel" value={row.versionLabel} onSave={onSave} saveState={saveState} disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
          <EditableField label="Imported at" kind="productVersion" id={row.latestVersionId} field="importedAt" value={row.lastImportedAt} type="datetime-local" onSave={onSave} saveState={saveState} disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
          <EditableField label="Imported by" kind="productVersion" id={row.latestVersionId} field="importedBy" value={row.importedBy} onSave={onSave} saveState={saveState} disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
          <EditableSelect label="Ready to quote" kind="productVersion" id={row.latestVersionId} field="readyToQuoteStatus" value={row.readyToQuoteStatus} options={READY_STATUS_OPTIONS} onSave={onSave} saveState={saveState} disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
          <EditableSelect label="Approval status" kind="productVersion" id={row.latestVersionId} field="approvalStatus" value={row.approvalStatus || "unapproved"} options={APPROVAL_STATUS_OPTIONS} onSave={onSave} saveState={saveState} disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
          <EditableField label="Stale source lines" kind="productVersion" id={row.latestVersionId} field="staleSourceLineCount" value={row.staleSourceLineCount} type="number" onSave={onSave} saveState={saveState} disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
          <EditableField label="Sell price" suffix="ex GST" kind="productVersion" id={row.latestVersionId} field="sellPriceExGst" value={row.sellPriceExGst} type="number" onSave={onSave} saveState={saveState} disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
          <EditableField label="Sell price" suffix="incl GST" kind="productVersion" id={row.latestVersionId} field="sellPriceInclGst" value={row.sellPriceInclGst} type="number" onSave={onSave} saveState={saveState} disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
          <EditableField label="Version notes" kind="productVersion" id={row.latestVersionId} field="notes" value={row.notes} onSave={onSave} saveState={saveState} multiline disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
          <EditableField label="Version blocker" kind="productVersion" id={row.latestVersionId} field="blocker" value={row.blocker} onSave={onSave} saveState={saveState} multiline disabledReason={!row.latestVersionId ? "No version row yet" : undefined} />
        </div>
      </DetailSection>
      <DetailSection title="Cost ladder">
        <CostLadder row={row} />
      </DetailSection>
      <DetailSection title="Latest version lines">
        <ProductLines lines={row.lines} onSave={onSave} saveState={saveState} />
      </DetailSection>
      <DetailSection title="Notes">
        <div className="costings-proof-list">
          <div><strong>Blocker</strong><span>{row.blocker || "No blocker recorded"}</span></div>
          <div><strong>Notes</strong><span>{row.notes || "No notes recorded"}</span></div>
          <div><strong>Read-only evidence</strong><span>Source hashes, raw payloads, and imported proof blobs are not directly editable here so the source trail remains auditable.</span></div>
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
  const router = useRouter();
  const [localResult, setLocalResult] = useState<CostingsResult | null>(null);
  const [filterByTab, setFilterByTab] = useState<Partial<Record<CostingsTab, CostingFilter>>>({});
  const [selectedByTab, setSelectedByTab] = useState<Partial<Record<CostingsTab, string>>>({});
  const [railExpandedKey, setRailExpandedKey] = useState<string | null>(null);
  const isNarrow = useIsNarrow(760);
  const [saveState, setSaveState] = useState<SaveState>({ key: null, status: "idle", message: "" });
  const effectiveResult = localResult && localResult.syncedAt >= result.syncedAt ? localResult : result;
  const mergeSavedRows = useCallback((data: { material?: CostingMaterialRow | null; product?: ProductCostingSheetRow | null }) => {
    setLocalResult((current) => ({
      ...(current ?? result),
      syncedAt: new Date().toISOString(),
      materials: data.material ? (current ?? result).materials.map((row) => row.id === data.material?.id ? data.material : row) : (current ?? result).materials,
      products: data.product ? (current ?? result).products.map((row) => row.id === data.product?.id ? data.product : row) : (current ?? result).products,
    }));
  }, [result]);
  const refreshFromRealtime = useCallback(() => {
    router.refresh();
  }, [router]);
  useRealtimeRefresh({ channelName: "costings-materials-live", table: "costing_materials", refreshOnChange: false, onChange: refreshFromRealtime });
  useRealtimeRefresh({ channelName: "costings-suppliers-live", table: "costing_suppliers", refreshOnChange: false, onChange: refreshFromRealtime });
  useRealtimeRefresh({ channelName: "costings-observations-live", table: "costing_price_observations", refreshOnChange: false, onChange: refreshFromRealtime });
  useRealtimeRefresh({ channelName: "costings-current-prices-live", table: "costing_current_prices", refreshOnChange: false, onChange: refreshFromRealtime });
  useRealtimeRefresh({ channelName: "costings-product-sheets-live", table: "product_costing_sheets", refreshOnChange: false, onChange: refreshFromRealtime });
  useRealtimeRefresh({ channelName: "costings-product-versions-live", table: "product_costing_versions", refreshOnChange: false, onChange: refreshFromRealtime });
  useRealtimeRefresh({ channelName: "costings-product-lines-live", table: "product_costing_lines", refreshOnChange: false, onChange: refreshFromRealtime });
  const saveField = useCallback<SaveField>(({ kind, id, field, value }) => {
    const key = saveKey(kind, id, field);
    if (!id) {
      setSaveState({ key, status: "error", message: "Could not save: no linked row" });
      return;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      setSaveState({ key, status: "error", message: "Could not save: enter a valid number" });
      return;
    }
    setSaveState({ key, status: "saving", message: "Saving" });
    fetch("/api/costings/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, fields: { [field]: value } }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Could not save"))))
      .then((data: { material?: CostingMaterialRow | null; product?: ProductCostingSheetRow | null }) => {
        mergeSavedRows(data);
        setSaveState({ key, status: "saved", message: "Saved" });
        window.setTimeout(() => {
          setSaveState((current) => current.key === key && current.status === "saved" ? { key: null, status: "idle", message: "" } : current);
        }, 1800);
      })
      .catch((err) => {
        setSaveState({ key, status: "error", message: err instanceof Error ? err.message : "Could not save" });
      });
  }, [mergeSavedRows]);
  const filter = filterByTab[activeTab] || "all";
  const items = useMemo<CostingItem[]>(() => {
    if (activeTab === "materials") return effectiveResult.materials.map((row) => ({ kind: "material", id: row.id, row }));
    return effectiveResult.products.map((row) => ({ kind: "product", id: row.id, row }));
  }, [activeTab, effectiveResult.materials, effectiveResult.products]);
  const selectedId = selectedByTab[activeTab] || null;
  const firstMatchingFilter = items.find((item) => passesFilter(item, filter)) || null;
  const selected = (selectedId ? items.find((item) => item.id === selectedId && passesFilter(item, filter)) : null) || firstMatchingFilter || (filter === "all" ? items[0] || null : null);
  const setActiveFilter = (nextFilter: CostingFilter) => {
    setFilterByTab((current) => ({ ...current, [activeTab]: nextFilter }));
  };
  const setActiveSelectedId = (nextId: string) => {
    setSelectedByTab((current) => ({ ...current, [activeTab]: nextId }));
  };
  const railContextKey = `${activeTab}:${filter}`;
  const railExpanded = railExpandedKey === railContextKey;
  const selectedDetail = selected?.kind === "material" ? <MaterialDetail row={selected.row} onSave={saveField} saveState={saveState} /> : selected?.kind === "product" ? <ProductDetail row={selected.row} onSave={saveField} saveState={saveState} /> : <EmptyState tab={activeTab} />;
  const rail = <CostingsRail tab={activeTab} items={items} selectedId={selected?.id || null} filter={filter} onFilterChange={setActiveFilter} onSelect={setActiveSelectedId} isNarrow={isNarrow} expanded={railExpanded} onExpand={() => setRailExpandedKey(railContextKey)} />;

  return (
    <section className="costings-command" aria-label="Costings command view">
      <style>{`
        .costings-command{display:grid;gap:10px}
        .costings-notice{background:#f7f5ef;border:1px solid rgba(200,169,110,.30);color:#8a5b1f;border-radius:10px;padding:10px 12px;font-family:${DT.sans};font-size:12px;line-height:1.4}
        .costings-health{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px}
        .costings-health button{min-width:0;min-height:64px;border:1px solid ${DT.border};background:rgba(255,255,255,.78);border-radius:10px;padding:7px 8px;text-align:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.025)}
        .costings-health button[aria-pressed="true"]{background:${DT.tealSoft};border-color:rgba(79,95,168,.28);box-shadow:0 0 0 2px rgba(79,95,168,.07)}
        .costings-health span{display:block;overflow:visible;text-overflow:clip;white-space:normal;color:${DT.textFaint};font-family:${DT.sans};font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;line-height:1.15}
        .costings-health strong{display:block;margin-top:3px;color:${DT.textPrimary};font-family:${DT.serif};font-size:20px;line-height:1}
        .costings-workspace{display:grid;grid-template-columns:334px minmax(0,1fr);gap:12px;align-items:start}
        .costings-directory{display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px;align-items:start}
        .costings-alpha-rail{position:sticky;top:86px;display:grid;gap:2px;padding:8px 5px;background:#fffdf9;border:1px solid rgba(39,34,27,.16);border-radius:999px;box-shadow:0 18px 42px rgba(39,34,27,.11);backdrop-filter:blur(12px)}
        .costings-alpha-rail button{width:30px;height:20px;border:0;border-radius:999px;background:transparent;color:${DT.textSecondary};font-family:${DT.sans};font-size:10px;font-weight:900;cursor:pointer;transition:background 140ms ease,color 140ms ease,transform 140ms ease}.costings-alpha-rail button:hover:not(:disabled){background:${DT.headerBg};color:#ffffff;transform:scale(1.08)}.costings-alpha-rail button:disabled{opacity:.26;cursor:default}
        .costings-directory-main{display:grid;gap:10px;min-width:0}.costings-directory-toolbar{position:sticky;top:73px;z-index:20;display:grid;grid-template-columns:minmax(170px,1fr) minmax(240px,1.4fr) 190px;gap:8px;align-items:center;padding:11px;background:#f8e9e6;border:1px solid rgba(39,34,27,.14);border-radius:16px;box-shadow:0 12px 30px rgba(39,34,27,.13);backdrop-filter:blur(14px)}
        .costings-directory-toolbar span{display:block;color:${DT.textSecondary};font-family:${DT.sans};font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.costings-directory-toolbar strong{display:block;color:${DT.textPrimary};font-family:${DT.serif};font-size:21px;line-height:1.05}.costings-directory-toolbar input,.costings-directory-toolbar select{min-width:0;height:44px;border:1px solid rgba(39,34,27,.18);border-radius:999px;background:#ffffff;color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;font-weight:900;padding:0 14px;outline:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.8),0 1px 2px rgba(39,34,27,.04)}
        .costings-directory-filters{display:flex;gap:6px;flex-wrap:wrap}.costings-directory-filters button{min-height:40px;border:1px solid rgba(39,34,27,.14);border-radius:999px;background:#fffdf9;color:${DT.textSecondary};font-family:${DT.sans};font-size:11px;font-weight:900;padding:0 12px;cursor:pointer;touch-action:manipulation;box-shadow:0 1px 2px rgba(39,34,27,.035)}.costings-directory-filters button[aria-pressed="true"]{background:${DT.headerBg};border-color:${DT.headerBg};color:#ffffff;box-shadow:0 8px 20px rgba(39,34,27,.18)}
        .costings-material-list{display:grid;gap:9px}.costings-letter-heading{position:sticky;top:146px;z-index:10;width:max-content;margin:11px 0 3px;padding:4px 11px;border-radius:999px;background:${DT.headerBg};color:#ffffff;font-family:${DT.serif};font-size:19px;line-height:1;box-shadow:0 10px 20px rgba(39,34,27,.18)}
        .costings-material-row{overflow:hidden;border:1px solid rgba(39,34,27,.14);border-radius:16px;background:#fffdf9;box-shadow:0 2px 7px rgba(39,34,27,.055);transition:box-shadow 160ms ease,border-color 160ms ease,transform 160ms ease}.costings-material-row:hover{border-color:rgba(12,124,122,.34);box-shadow:0 15px 38px rgba(39,34,27,.12);transform:translateY(-1px)}.costings-material-row[data-expanded="true"]{border-color:rgba(12,124,122,.38);box-shadow:0 22px 48px rgba(39,34,27,.14)}
        .costings-material-summary{width:100%;display:grid;grid-template-columns:minmax(260px,1.5fr) minmax(150px,.45fr) minmax(170px,.62fr) 72px;gap:12px;align-items:center;padding:15px 16px;border:0;background:transparent;text-align:left;cursor:pointer}.costings-material-summary span{min-width:0}.costings-material-name strong{display:block;color:${DT.textPrimary};font-family:${DT.sans};font-size:15.5px;font-weight:900;line-height:1.25;overflow-wrap:anywhere}.costings-material-name em{display:block;margin-top:4px;color:${DT.textSecondary};font-family:${DT.sans};font-size:11.5px;font-style:normal;font-weight:900}.costings-material-price{padding:8px 10px;border-radius:12px;background:#f8e9e6;border:1px solid rgba(39,34,27,.08)}.costings-material-price strong{display:block;color:${DT.textPrimary};font-family:${DT.serif};font-size:18.5px;line-height:1}.costings-material-price small,.costings-material-proof small{display:block;margin-top:4px;color:${DT.textMuted};font-family:${DT.sans};font-size:10.5px;font-weight:900;line-height:1.25}.costings-material-proof{display:grid;justify-items:start;gap:4px}.costings-material-expand{justify-self:end;display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;border-radius:999px;background:rgba(39,34,27,.075);color:${DT.textPrimary};font-family:${DT.sans};font-size:11px;font-weight:900}.costings-material-row[data-expanded="true"] .costings-material-expand{background:${DT.headerBg};color:#ffffff}
        .costings-material-expanded{padding:0 12px 12px}.costings-material-expanded .costings-detail-card{box-shadow:none;border-radius:12px;background:#fffdf9;border-color:rgba(39,34,27,.14)}.costings-material-expanded .costings-detail-hero h2{font-size:22px}.costings-material-expanded .costings-detail-hero{display:none}
        .costings-rail,.costings-detail-card,.costings-empty-state{background:rgba(255,255,255,.84);border:1px solid ${DT.border};border-radius:${DT.radius}px;box-shadow:${DT.shadow}}
        .costings-rail{overflow:hidden}
        .costings-rail-head{padding:12px;border-bottom:1px solid ${DT.border};display:flex;justify-content:space-between;gap:10px}
        .costings-rail-head span{display:block;color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
        .costings-rail-head strong{display:block;margin-top:2px;color:${DT.textPrimary};font-family:${DT.serif};font-size:18px;line-height:1}
        .costings-rail-controls{padding:10px;display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:6px}
        .costings-rail-controls input,.costings-rail-controls select{min-width:0;min-height:40px;border:1px solid ${DT.border};border-radius:9px;background:${DT.cardBg};color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;padding:8px 9px;outline:none;box-sizing:border-box}
        .costings-rail-controls select{font-size:11px;font-weight:900;color:${DT.textMuted}}
        .costings-quick-filters{display:flex;gap:4px;padding:0 10px 10px;flex-wrap:nowrap}
        .costings-quick-filters button{flex:1 1 0;min-width:44px;min-height:40px;border:1px solid ${DT.border};background:rgba(255,255,255,.72);color:${DT.textMuted};border-radius:999px;padding:6px 5px;font-family:${DT.sans};font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap;touch-action:manipulation}
        .costings-quick-filters button[aria-pressed="true"]{background:${DT.tealSoft};border-color:rgba(79,95,168,.32);color:${DT.teal}}
        .costings-rail-list{display:flex;flex-direction:column;gap:8px;padding:0 10px 10px}
        .costings-rail-item{width:100%;border-width:1px 1px 1px 4px;border-style:solid;border-color:${DT.border};background:${DT.cardBg};border-radius:10px;padding:10px;text-align:left;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;box-shadow:0 1px 4px rgba(0,0,0,.025);transition:transform 160ms ease,box-shadow 160ms ease}
        .costings-rail-item:hover{transform:translateX(-2px);box-shadow:0 8px 18px rgba(0,0,0,.06)}
        .costings-rail-item[data-selected="true"]{background:linear-gradient(135deg,${DT.cardBg},rgba(79,95,168,.07));box-shadow:0 0 0 2px rgba(79,95,168,.08)}
        .costings-rail-main{min-width:0}.costings-rail-main strong{display:block;color:${DT.textPrimary};font-family:${DT.sans};font-size:13px;font-weight:900;line-height:1.2;overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere}.costings-rail-main span{display:block;margin-top:4px;color:${DT.textMuted};font-family:${DT.sans};font-size:10px;font-weight:800;overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere}.costings-rail-main em{display:block;margin-top:5px;color:${DT.textSecondary};font-family:${DT.sans};font-size:10px;font-style:normal;font-weight:900;line-height:1.25}
        .costings-rail-side{text-align:right;display:grid;gap:4px;justify-items:end;align-content:start}.costings-rail-side>span{color:${DT.textPrimary};font-family:${DT.sans};font-size:11px;font-weight:900;white-space:nowrap}.costings-rail-side small{color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:900;white-space:nowrap}
        .costings-detail-card{padding:14px}
        .costings-detail-hero{display:flex;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:1px solid ${DT.border}}
        .costings-detail-hero span{display:block;color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.costings-detail-hero h2{margin:3px 0 4px;color:${DT.textPrimary};font-family:${DT.serif};font-size:27px;line-height:1.06;letter-spacing:0}.costings-detail-hero p{margin:0;color:${DT.textMuted};font-family:${DT.sans};font-size:12px;line-height:1.35}
        .costings-hero-price{text-align:right;display:grid;gap:7px;justify-items:end;align-content:start}.costings-hero-price strong{color:${DT.textPrimary};font-family:${DT.serif};font-size:23px;line-height:1}
        .costings-chip-stack{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
        .costings-action-line{margin-top:12px;border-radius:10px;padding:10px 11px;font-family:${DT.sans};font-size:13px;font-weight:900;line-height:1.25}
        .costings-action-line[data-tone="red"]{background:rgba(153,27,27,.08);border:1px solid rgba(153,27,27,.20);color:#9a3b2f}.costings-action-line[data-tone="amber"]{background:${DT.goldSoft};border:1px solid rgba(200,169,110,.28);color:#8a5b1f}.costings-action-line[data-tone="green"]{background:${DT.greenBg};border:1px solid rgba(79,127,89,.18);color:${DT.green}}
        .costings-fact-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0 0}
        .costings-fact,.costings-inline-facts .costings-fact{min-width:0;border:1px solid rgba(39,34,27,.06);background:#f7f5ef;border-radius:8px;padding:9px}
        .costings-fact dt{margin:0 0 5px;color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.costings-fact dd{margin:0;color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;font-weight:800;line-height:1.35;overflow-wrap:anywhere}
        .costings-detail-section{margin-top:14px}.costings-detail-section h3{margin:0 0 8px;color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.costings-inline-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0}
        .costings-edit-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .costings-edit-field{min-width:0;display:grid;gap:5px;border:1px solid rgba(39,34,27,.07);background:#f7f5ef;border-radius:8px;padding:8px;font-family:${DT.sans}}
        .costings-edit-field>span{display:flex;align-items:center;justify-content:space-between;gap:8px;color:${DT.textFaint};font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
        .costings-edit-field>span em{font-style:normal;color:${DT.textMuted};font-size:8.5px;text-transform:none;letter-spacing:0}
        .costings-edit-field input,.costings-edit-field select,.costings-edit-field textarea{min-width:0;width:100%;min-height:40px;box-sizing:border-box;border:1px solid rgba(39,34,27,.10);background:#fffdf9;border-radius:7px;color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;font-weight:800;padding:8px 9px;outline:none}
        .costings-edit-field textarea{resize:vertical;line-height:1.35}
        .costings-edit-field input:disabled,.costings-edit-field select:disabled,.costings-edit-field textarea:disabled{background:rgba(39,34,27,.035);color:${DT.textFaint};cursor:not-allowed}
        .costings-edit-field small,.costings-toggle small{color:${DT.textFaint};font-size:9px;font-weight:900;line-height:1.25}
        .costings-edit-field small[data-state="saving"],.costings-toggle small[data-state="saving"]{color:#8a5b1f}.costings-edit-field small[data-state="saved"],.costings-toggle small[data-state="saved"]{color:${DT.green}}.costings-edit-field small[data-state="error"],.costings-toggle small[data-state="error"]{color:#9a3b2f}
        .costings-toggle{min-width:0;display:flex;align-items:center;gap:8px;border:1px solid rgba(39,34,27,.07);background:#f7f5ef;border-radius:8px;padding:8px;color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;font-weight:900}
        .costings-toggle{min-height:40px;align-items:center}
        .costings-toggle input{width:20px;height:20px;accent-color:${DT.teal}}
        .costings-readonly-note{margin-bottom:8px;border:1px solid rgba(79,95,168,.16);background:rgba(79,95,168,.07);border-radius:8px;padding:8px 9px;color:${DT.textMuted};font-family:${DT.sans};font-size:11px;font-weight:800;line-height:1.35}
        .costings-source-link{display:inline-flex;align-items:center;gap:6px;min-height:40px;max-width:100%;box-sizing:border-box;color:${DT.teal};font-weight:900;line-height:1.25;text-decoration:none;overflow-wrap:anywhere}
        .costings-source-link span:first-child{min-width:0;white-space:normal}
        .costings-proof-list{display:grid;gap:6px}.costings-proof-list div{display:grid;grid-template-columns:132px minmax(0,1fr);gap:10px;border-top:1px solid ${DT.border};padding-top:8px}.costings-proof-list strong{color:${DT.textMuted};font-family:${DT.sans};font-size:11px}.costings-proof-list span{color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;line-height:1.4;overflow-wrap:anywhere}
        .costings-ladder{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.costings-ladder div{border:1px solid ${DT.border};background:#f7f5ef;border-radius:8px;padding:9px;min-width:0}.costings-ladder div[data-final="true"]{background:rgba(79,95,168,.07);border-color:rgba(79,95,168,.16)}.costings-ladder span{display:block;color:${DT.textFaint};font-family:${DT.sans};font-size:9px;font-weight:900;text-transform:uppercase}.costings-ladder strong{display:block;margin-top:4px;color:${DT.textPrimary};font-family:${DT.sans};font-size:12px;font-weight:900;overflow-wrap:anywhere}
        .costings-lines{display:grid;gap:8px}.costings-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;border-width:1px 1px 1px 4px;border-style:solid;border-color:${DT.border} ${DT.border} ${DT.border} ${DT.sage};background:${DT.cardBg};border-radius:9px;padding:8px}.costings-line strong{color:${DT.textPrimary};font-family:${DT.sans};font-size:12px}.costings-line span{color:${DT.textMuted};font-family:${DT.sans};font-size:10px}.costings-line>div:first-child{min-width:0}.costings-line>div:first-child strong,.costings-line>div:first-child span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.costings-line>div:nth-child(2){display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.costings-line-edit{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;padding-top:8px;border-top:1px solid ${DT.border}}
        .costings-soft-empty,.costings-empty-rail{color:${DT.textMuted};font-family:${DT.sans};font-size:12px;line-height:1.4;padding:8px 2px}.costings-empty-state{padding:24px}.costings-empty-state h2{margin:0 0 8px;color:${DT.textPrimary};font-family:${DT.serif};font-size:24px}.costings-empty-state p{margin:0;color:${DT.textSecondary};font-family:${DT.sans};font-size:13px;line-height:1.5}
        .costings-show-all{width:100%;min-height:40px;border:1px solid ${DT.border};border-radius:999px;background:rgba(255,255,255,.78);color:${DT.textSecondary};font-family:${DT.sans};font-size:11px;font-weight:900;cursor:pointer;touch-action:manipulation}
        @media(max-width:1080px){.costings-workspace{grid-template-columns:1fr}.costings-directory{grid-template-columns:1fr}.costings-alpha-rail{position:static;display:flex;overflow-x:auto;border-radius:16px;padding:7px}.costings-alpha-rail button{flex:0 0 36px;width:36px;height:36px}.costings-directory-toolbar{position:static;grid-template-columns:1fr}.costings-material-summary{grid-template-columns:1fr;gap:8px}.costings-material-expand{justify-self:start}.costings-rail-controls{grid-template-columns:1fr 136px}.costings-health{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:1080px){.costings-edit-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.costings-line-edit{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:720px){.costings-health{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.costings-health button{min-height:52px;padding:6px}.costings-health strong{font-size:18px}.costings-workspace{gap:10px}.costings-rail-controls{grid-template-columns:1fr}.costings-quick-filters{overflow-x:auto}.costings-quick-filters button{flex:0 0 auto;padding:8px 11px}.costings-rail-item{grid-template-columns:1fr;padding:9px}.costings-rail-side{text-align:left;justify-items:start}.costings-detail-card{padding:12px}.costings-detail-hero{display:grid;gap:8px;padding-bottom:10px}.costings-detail-hero h2{font-size:23px}.costings-hero-price{text-align:left;justify-items:start}.costings-fact-grid,.costings-inline-facts,.costings-ladder,.costings-edit-grid,.costings-line-edit{grid-template-columns:1fr}.costings-proof-list div{grid-template-columns:1fr}.costings-line{grid-template-columns:1fr}.costings-line>div:first-child strong,.costings-line>div:first-child span{overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere}.costings-line>div:nth-child(2){justify-content:flex-start}}
      `}</style>
      {effectiveResult.errors.length ? <div className="costings-notice">{effectiveResult.errors.join(" ")}</div> : null}
      <HealthStrip result={effectiveResult} activeTab={activeTab} filter={filter} onFilterChange={setActiveFilter} />
      {items.length ? (
        activeTab === "materials" ? (
          <MaterialDirectory materials={effectiveResult.materials} filter={filter} onFilterChange={setActiveFilter} onSave={saveField} saveState={saveState} />
        ) : (
          <div className="costings-workspace">
            {rail}
            {selectedDetail}
          </div>
        )
      ) : (
        <EmptyState tab={activeTab} />
      )}
    </section>
  );
}
