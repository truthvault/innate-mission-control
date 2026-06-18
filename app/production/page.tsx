import PlanClient from "./plan/PlanClient";
import { getOrderCostingContext } from "@/lib/costings/fetch-order-costing-context";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";
import { getPlanWithFallback } from "@/lib/monday/fetch-plan";

export default async function ProductionPage() {
  const [result, orders] = await Promise.all([
    getPlanWithFallback(),
    getOrdersWithFallback(),
  ]);
  const orderCostings = await getOrderCostingContext(orders.items);
  return (
    <PlanClient
      rows={result.rows}
      orders={orders.items}
      orderCostings={orderCostings}
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.mondayError}
    />
  );
}
