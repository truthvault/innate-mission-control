"use client";

import type { CSSProperties, ReactNode } from "react";
import { Chip, DT, KpiCard } from "@/components/mission-control-ui";
import type { StockDashboardResult } from "@/lib/stock/fetch-stock-dashboard";

type Props = { result: StockDashboardResult };

function formatNumber(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("en-NZ", { maximumFractionDigits });
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "n/a";
  return value.toLocaleString("en-NZ", { style: "currency", currency: "NZD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NZ", { day: "2-digit", month: "short", year: "numeric" });
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontFamily: DT.serif, color: DT.textPrimary, fontSize: 23, letterSpacing: "-0.035em" }}>{title}</h2>
      {children}
    </section>
  );
}

function EmptyFoundation() {
  return (
    <div style={{ border: `1px dashed rgba(200,169,110,0.45)`, borderRadius: DT.radius, padding: 18, background: DT.goldSoft, color: DT.textSecondary, fontFamily: DT.sans, fontSize: 13, lineHeight: 1.55 }}>
      <strong style={{ color: DT.textPrimary }}>Stock foundation is live, but opening stock has not been imported.</strong>
      <div style={{ marginTop: 6 }}>
        Start with the next physical stocktake, then approve Xero bill-line mapping rules supplier by supplier. Until then, this page is intentionally read-only and empty.
      </div>
    </div>
  );
}

function DataTable({ children }: { children: ReactNode }) {
  return <div style={{ overflowX: "auto", border: `1px solid ${DT.border}`, borderRadius: 14 }}>{children}</div>;
}

const thStyle: CSSProperties = { textAlign: "left", padding: "9px 10px", color: DT.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${DT.border}`, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "10px", borderBottom: `1px solid ${DT.border}`, fontSize: 12, color: DT.textSecondary, verticalAlign: "top" };

export default function StockClient({ result }: Props) {
  const emptyFoundation = result.summary.stockItems === 0 && result.summary.openExceptions === 0 && result.summary.activeMappingRules === 0;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "rgba(12,124,122,0.08)", border: "1px solid rgba(12,124,122,0.16)", borderRadius: DT.radius, padding: "11px 13px", color: DT.textSecondary, fontSize: 12 }}>
        <Chip label="Read-only" tone="teal" />
        <span>No import buttons, no Xero writes, no payments, no automatic stock movements.</span>
        {result.errors.length > 0 && <Chip label={`${result.errors.length} data warning${result.errors.length === 1 ? "" : "s"}`} tone="red" />}
      </div>

      {result.errors.length > 0 && (
        <div style={{ border: "1px solid rgba(180,107,70,0.22)", background: "rgba(180,107,70,0.09)", borderRadius: DT.radius, padding: 12, color: DT.clay, fontSize: 12 }}>
          {result.errors.map((error) => <div key={error}>{error}</div>)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <KpiCard label="Stock items" value={formatNumber(result.summary.stockItems, 0)} />
        <KpiCard label="Value ex GST" value={formatMoney(result.summary.stockValueExGst)} tone={result.summary.stockValueExGst > 0 ? "good" : "neutral"} />
        <KpiCard label="On hand qty" value={formatNumber(result.summary.quantityOnHand)} />
        <KpiCard label="Reserved qty" value={formatNumber(result.summary.quantityReserved)} tone={result.summary.quantityReserved > 0 ? "warn" : "neutral"} />
        <KpiCard label="Open exceptions" value={formatNumber(result.summary.openExceptions, 0)} tone={result.summary.openExceptions > 0 ? "warn" : "neutral"} />
        <KpiCard label="Mapping rules" value={formatNumber(result.summary.activeMappingRules, 0)} />
      </div>

      {emptyFoundation && <EmptyFoundation />}

      <Card title="Inventory balances">
        {result.balances.length === 0 ? (
          <p style={{ margin: 0, color: DT.textMuted, fontSize: 13 }}>No stock balances yet.</p>
        ) : (
          <DataTable>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr><th style={thStyle}>Item</th><th style={thStyle}>Category</th><th style={thStyle}>On hand</th><th style={thStyle}>Reserved</th><th style={thStyle}>Available</th><th style={thStyle}>Unit cost</th><th style={thStyle}>Value</th><th style={thStyle}>Last movement</th></tr>
              </thead>
              <tbody>
                {result.balances.map((row) => (
                  <tr key={row.stockItemId}>
                    <td style={tdStyle}><strong style={{ color: DT.textPrimary }}>{row.itemCode ? `${row.itemCode} · ` : ""}{row.name}</strong><div style={{ color: DT.textFaint }}>{[row.speciesOrMaterial, row.dimensions].filter(Boolean).join(" · ") || "—"}</div></td>
                    <td style={tdStyle}>{row.category || "—"}</td>
                    <td style={tdStyle}>{formatNumber(row.quantityOnHand)} {row.defaultUnit || ""}</td>
                    <td style={tdStyle}>{formatNumber(row.quantityReserved)} {row.defaultUnit || ""}</td>
                    <td style={tdStyle}>{formatNumber(row.quantityAvailable)} {row.defaultUnit || ""}</td>
                    <td style={tdStyle}>{formatMoney(row.approvedUnitCostExGst)}</td>
                    <td style={tdStyle}>{formatMoney(row.stockValueExGst)}</td>
                    <td style={tdStyle}>{formatDate(row.lastMovementAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
      </Card>

      <Card title="Exceptions queue">
        {result.exceptions.length === 0 ? (
          <p style={{ margin: 0, color: DT.textMuted, fontSize: 13 }}>No stock exceptions in Supabase yet. The scanner can now produce dry-run exception JSON for approval before anything is inserted.</p>
        ) : (
          <DataTable>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr><th style={thStyle}>Severity</th><th style={thStyle}>Type</th><th style={thStyle}>Title</th><th style={thStyle}>Status</th><th style={thStyle}>Created</th></tr></thead>
              <tbody>
                {result.exceptions.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}><Chip label={row.severity} tone={row.severity === "critical" || row.severity === "high" ? "red" : "amber"} /></td>
                    <td style={tdStyle}>{row.exceptionType.replaceAll("_", " ")}</td>
                    <td style={tdStyle}><strong style={{ color: DT.textPrimary }}>{row.title}</strong>{row.detail && <div style={{ color: DT.textFaint, marginTop: 3 }}>{row.detail}</div>}</td>
                    <td style={tdStyle}>{row.status.replaceAll("_", " ")}</td>
                    <td style={tdStyle}>{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
      </Card>

      <Card title="Mapping rules">
        {result.mappingRules.length === 0 ? (
          <p style={{ margin: 0, color: DT.textMuted, fontSize: 13 }}>No mapping rules yet. First rules should be approved from real Xero bill-line examples.</p>
        ) : (
          <DataTable>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr><th style={thStyle}>Rule</th><th style={thStyle}>Supplier</th><th style={thStyle}>Pattern</th><th style={thStyle}>Stock item</th><th style={thStyle}>Confidence</th><th style={thStyle}>Active</th></tr></thead>
              <tbody>
                {result.mappingRules.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{row.ruleType.replaceAll("_", " ")}</td>
                    <td style={tdStyle}>{row.supplierName || "Any supplier"}</td>
                    <td style={tdStyle}><code>{row.matchPattern}</code></td>
                    <td style={tdStyle}>{row.stockItemName || row.stockItemId}</td>
                    <td style={tdStyle}>{row.confidence}</td>
                    <td style={tdStyle}>{row.isActive ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
