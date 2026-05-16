import SampleStockClient from "./SampleStockClient";
import { getSampleStockWithFallback } from "@/lib/monday/fetch-sample-stock";

export default async function SampleStockPage() {
  const result = await getSampleStockWithFallback();
  return (
    <SampleStockClient
      board={result.board}
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.mondayError}
    />
  );
}
