import PlanClient from "./plan/PlanClient";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";
import { getPlanWithFallback } from "@/lib/monday/fetch-plan";

export default async function ProductionPage() {
  const [result, orders] = await Promise.all([
    getPlanWithFallback(),
    getOrdersWithFallback(),
  ]);
  return (
    <PlanClient
      rows={result.rows}
      orders={orders.items}
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.mondayError}
    />
  );
}
