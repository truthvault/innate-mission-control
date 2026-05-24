import PlanClient from "./PlanClient";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";
import { getPlanWithFallback } from "@/lib/monday/fetch-plan";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
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
