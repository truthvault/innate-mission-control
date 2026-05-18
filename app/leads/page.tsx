import LeadsClient from "./LeadsClient";
import { listLeads } from "@/lib/leads/fetch-leads";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const result = await listLeads();
  return <LeadsClient result={result} />;
}
