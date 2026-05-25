import PlanClient from "./PlanClient";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";
import { getPlanWithFallback } from "@/lib/monday/fetch-plan";
import { productionPlanFixtureAllowed, productionPlanFixtureData } from "@/lib/production/plan-fixture";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const useFixture = query.fixture === "qa" && productionPlanFixtureAllowed();
  if (useFixture) {
    const fixture = productionPlanFixtureData();
    return (
      <PlanClient
        rows={fixture.rows}
        orders={fixture.orders}
        syncedAt={fixture.syncedAt}
        source="snapshot"
        mondayError="QA fixture mode: local browser-test data only"
        delightEnabled={query.delight !== "off"}
        qaFixtureMode
      />
    );
  }

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
      delightEnabled={query.delight !== "off"}
    />
  );
}
