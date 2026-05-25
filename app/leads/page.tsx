import LeadsClient from "./LeadsClient";
import { listLeads } from "@/lib/leads/fetch-leads";
import { projectRefFromSupabaseUrl } from "@/lib/leads/supabase-studio.mjs";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const result = await listLeads();
  const supabaseProjectRef = process.env.SUPABASE_PROJECT_REF || projectRefFromSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  return <LeadsClient result={result} supabaseProjectRef={supabaseProjectRef} />;
}
