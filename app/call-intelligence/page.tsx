import CallIntelligenceClient from "./CallIntelligenceClient";
import { listCallIntelligence } from "@/lib/call-intelligence/fetch-call-intelligence";

export const dynamic = "force-dynamic";

export default async function CallIntelligencePage() {
  const result = await listCallIntelligence();
  return <CallIntelligenceClient result={result} />;
}
