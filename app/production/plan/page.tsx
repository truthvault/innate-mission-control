import PlanClient from "./PlanClient";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";
import { getPlanWithFallback } from "@/lib/monday/fetch-plan";
import { productionPlanFixtureAllowed, productionPlanFixtureData } from "@/lib/production/plan-fixture";
import { isMissingBlobToken, readPlanTaskLinksState } from "@/lib/tuesday/plan-task-links-store";

export const dynamic = "force-dynamic";

async function getInitialPlanTaskLinkState() {
  try {
    return { ...(await readPlanTaskLinksState()), disabledReason: undefined };
  } catch (err) {
    const disabledReason = isMissingBlobToken(err)
      ? "Plan task link storage is not connected yet."
      : err instanceof Error
        ? err.message
        : "Plan task links unavailable";
    return { state: undefined, storage: "blob" as const, disabledReason };
  }
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const useFixture = query.fixture === "qa" && productionPlanFixtureAllowed();
  const initialPlanViewMode = query.mode === "schedule" ? "schedule" : "orderRows";
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
        initialUtilityView={query.view === "process-templates" ? "processTemplates" : null}
        initialPlanViewMode={initialPlanViewMode}
        qaFixtureMode
      />
    );
  }

  const [result, orders, planTaskLinks] = await Promise.all([
    getPlanWithFallback(),
    getOrdersWithFallback(),
    getInitialPlanTaskLinkState(),
  ]);
  return (
    <PlanClient
      rows={result.rows}
      orders={orders.items}
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.mondayError}
      delightEnabled={query.delight !== "off"}
      initialUtilityView={query.view === "process-templates" ? "processTemplates" : null}
      initialPlanViewMode={initialPlanViewMode}
      initialPlanTaskLinkState={planTaskLinks.state}
      initialPlanTaskLinksStorage={planTaskLinks.storage}
      initialPlanTaskLinksDisabledReason={planTaskLinks.disabledReason}
    />
  );
}
