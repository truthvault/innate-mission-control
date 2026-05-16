import TestJobClient from "./TestJobClient";

export default function TestJobPage() {
  return <TestJobClient syncedAt={new Date().toISOString()} />;
}
