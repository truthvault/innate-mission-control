import LeadsClient from "./LeadsClient";
import { listLeads } from "@/lib/leads/fetch-leads";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const result = await listLeads();
  const writesEnabled = process.env.TUESDAY_LEADS_WRITES_ENABLED === "true";
  return <LeadsClient result={result} writesEnabled={writesEnabled} />;
}
