import PlanClient from "./PlanClient";
import { getPlanWithFallback } from "@/lib/monday/fetch-plan";

export default async function PlanPage() {
  const result = await getPlanWithFallback();
  return (
    <PlanClient
      rows={result.rows}
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.mondayError}
    />
  );
}
