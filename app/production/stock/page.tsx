import { MissionControlShell } from "@/components/mission-control-shell";
import { fetchStockDashboard } from "@/lib/stock/fetch-stock-dashboard";
import StockClient from "./StockClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StockPage() {
  const result = await fetchStockDashboard();
  return (
    <MissionControlShell
      section="stock"
      pageTitle="Stock"
      pageSubtitle="Read-only stock foundation: balances, exceptions, and mapping rules. No imports or Xero writes from this screen."
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.errors.join(" | ") || undefined}
      maxWidth={1320}
    >
      <StockClient result={result} />
    </MissionControlShell>
  );
}
