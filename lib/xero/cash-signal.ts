import "server-only";

import { getXeroCashSummary, getXeroReadiness, type XeroCashSummary } from "./read-only";
import type { SourceHealthState } from "@/lib/tuesday/daily-brief";

export type CashSignalSource = SourceHealthState;

export type CashSignal = XeroCashSummary & {
  source: CashSignalSource;
  label: string;
  detail: string;
  error?: string;
};

function safeXeroError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Xero cash signal failed";
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9._~+/-]+=*/gi, "Basic [REDACTED]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[REDACTED]")
    .slice(0, 400);
}

export async function getReadOnlyXeroCashSignal(now = new Date().toISOString()): Promise<CashSignal> {
  const readiness = await getXeroReadiness();
  if (!readiness.configured) {
    return {
      source: "missing",
      label: "Xero cash source missing",
      detail: readiness.reason || "Xero read-only credentials are not configured locally, so /today cannot verify live receivables or bills.",
      syncedAt: now,
      riskStatus: "yellow",
      overdueReceivables: { count: 0, amountDue: 0, invoices: [] },
      payableBuckets: [],
      tenantName: null,
    };
  }

  try {
    const summary = await getXeroCashSummary({ now });
    return {
      ...summary,
      source: "live",
      label: "Xero cash signal live",
      detail: `${summary.overdueReceivables.count} overdue receivable(s), ${summary.payableBuckets.find((bucket) => bucket.label === "30 days")?.count ?? 0} bill(s) due in 30 days.`,
    };
  } catch (error) {
    return {
      source: "unverified",
      label: "Xero cash signal needs verification",
      detail: safeXeroError(error),
      error: safeXeroError(error),
      syncedAt: now,
      riskStatus: "yellow",
      overdueReceivables: { count: 0, amountDue: 0, invoices: [] },
      payableBuckets: [],
      tenantName: null,
    };
  }
}
