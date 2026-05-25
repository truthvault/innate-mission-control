import WorkboardClient from "./WorkboardClient";
import { listWorkboard } from "@/lib/workboard/fetch-workboard";

export const dynamic = "force-dynamic";

export default async function WorkboardPage() {
  const result = await listWorkboard();
  return <WorkboardClient result={result} />;
}
