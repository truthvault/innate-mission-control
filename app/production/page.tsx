import ProductionClient from "./ProductionClient";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";

export default async function ProductionPage() {
  const result = await getOrdersWithFallback();
  return (
    <ProductionClient
      orders={result.items}
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.mondayError}
    />
  );
}
