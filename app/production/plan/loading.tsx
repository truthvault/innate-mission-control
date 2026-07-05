import { MissionControlShell } from "@/components/mission-control-shell";
import { DT } from "@/components/mission-control-ui";

// Instant skeleton for the Orders board. Next renders this the moment the route
// is requested, so the header + a shimmer board appear immediately instead of a
// blank wait while Monday data loads and the large PlanClient hydrates.
function Bar({ w, h = 14 }: { w: string | number; h?: number }) {
  return <span className="mc-skel" style={{ display: "block", width: w, height: h, borderRadius: 6 }} />;
}

export default function Loading() {
  return (
    <MissionControlShell section="plan" pageTitle="Orders" pageSubtitle="Loading the latest board…" syncedAt={new Date().toISOString()} source="cache">
      <style>{`@keyframes mcpulse{0%{opacity:.55}50%{opacity:1}100%{opacity:.55}}.mc-skel{background:rgba(0,0,0,0.07);animation:mcpulse 1.1s ease-in-out infinite}`}</style>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[110, 90, 130, 80].map((w, i) => <Bar key={i} w={w} h={30} />)}
        </div>
        {[0, 1, 2, 3, 4, 5].map((r) => (
          <div key={r} style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, padding: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <Bar w={r % 2 ? 220 : 180} h={16} />
              <Bar w={64} h={16} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
              {[0, 1, 2, 3, 4].map((c) => <Bar key={c} w="100%" h={28} />)}
            </div>
          </div>
        ))}
      </div>
    </MissionControlShell>
  );
}
