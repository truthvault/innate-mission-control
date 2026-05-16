import DispatchClient from "./DispatchClient";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";

export default async function DispatchPage() {
  const result = await getOrdersWithFallback();
  return (
    <DispatchClient
      orders={result.items}
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.mondayError}
    />
  );
}
