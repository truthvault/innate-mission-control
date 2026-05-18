import { getLeadsOverview } from "@/lib/leads/fetch-leads";
import LeadsClient from "./LeadsClient";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const result = await getLeadsOverview();
  return <LeadsClient result={result} />;
}
