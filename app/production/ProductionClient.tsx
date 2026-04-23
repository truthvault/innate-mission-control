'use client';

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UiOrder } from "@/lib/monday/mapping";

const DT = {
  pageBg:"#f5f3ee",cardBg:"#ffffff",headerBg:"#1a1a1a",
  teal:"#0c7c7a",tealSoft:"rgba(12,124,122,0.08)",
  gold:"#c8a96e",goldSoft:"rgba(200,169,110,0.06)",
  textPrimary:"#22201a",textSecondary:"#5a5549",
  textMuted:"#7c746b",textFaint:"#9a9088",
  green:"#15803d",greenBg:"rgba(21,128,61,0.08)",
  border:"rgba(0,0,0,0.06)",
  shadow:"0 1px 3px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.02)",
  shadowHover:"0 2px 6px rgba(0,0,0,0.05), 0 6px 20px rgba(0,0,0,0.03)",
  radius:14,radiusSm:8,
  sans:"'DM Sans', -apple-system, sans-serif",
  serif:"'Fraunces', Georgia, serif",
};

// ── PRODUCTION STEPS BY PRODUCT TYPE ──────────────────────────
type Step = { key: string; label: string; who: string | null; wait: boolean; waitLabel?: string };

const TABLE_STEPS: Step[] = [
  {key:"confirmed",label:"Order Confirmed",who:"Nick",wait:false},
  {key:"pos",label:"POs Sent",who:"Nick",wait:false},
  {key:"timber",label:"Timber Pulled",who:"Dylan",wait:false},
  {key:"matWait",label:"Materials Wait",who:null,wait:true,waitLabel:"~2 weeks"},
  {key:"received",label:"Materials Received",who:"Dylan",wait:false},
  {key:"stress",label:"Stress Cuts",who:"Dylan",wait:false},
  {key:"sand",label:"Sand",who:"Dylan",wait:false},
  {key:"coat1",label:"1st Coat",who:"Dylan",wait:false},
  {key:"coat2",label:"2nd Coat",who:"Dylan",wait:false},
  {key:"cure",label:"Curing",who:null,wait:true,waitLabel:"~1 week"},
  {key:"qc",label:"QC + Photos",who:"Dylan",wait:false},
  {key:"assemble",label:"Assemble / Box",who:"Dylan",wait:false},
  {key:"freight",label:"Book Freight",who:"Dylan",wait:false},
];

const PANEL_STEPS: Step[] = [
  {key:"confirmed",label:"Order Confirmed",who:"Nick",wait:false},
  {key:"pos",label:"POs Sent",who:"Nick",wait:false},
  {key:"matWait",label:"Materials Wait",who:null,wait:true,waitLabel:"~2 weeks"},
  {key:"received",label:"Materials Received",who:"Dylan",wait:false},
  {key:"cut",label:"CNC / Cut",who:"Dylan",wait:false},
  {key:"sand",label:"Sand",who:"Dylan",wait:false},
  {key:"coat1",label:"1st Coat",who:"Dylan",wait:false},
  {key:"coat2",label:"2nd Coat",who:"Dylan",wait:false},
  {key:"cure",label:"Curing",who:null,wait:true,waitLabel:"~1 week"},
  {key:"qc",label:"QC",who:"Dylan",wait:false},
  {key:"wrap",label:"Wrap + Ship",who:"Dylan",wait:false},
];

const STEPS_BY_KEY: Record<string, Step[]> = {
  TABLE_STEPS,
  PANEL_STEPS,
};

// Resolve a UiOrder to a shape with steps[] array ready for the UI.
// Also derives `repair` (display-only) from the raw Top/Panel enum.
type DisplayOrder = UiOrder & {
  steps: Step[];
  repair: boolean;
};

function toDisplayOrder(o: UiOrder): DisplayOrder {
  const steps = o.stepsKey ? STEPS_BY_KEY[o.stepsKey] ?? [] : [];
  return {
    ...o,
    steps,
    repair: o.rawMondayTopPanel === "Repair",
  };
}

// ── JOB COLORS ────────────────────────────────────────────────
const JC: Record<string, {bg:string,border:string,text:string}> = {
  "Instinct Interiors":{bg:"#FEF3C7",border:"#F59E0B",text:"#92400e"},
  "Nordzco Joinery":{bg:"#DBEAFE",border:"#3B82F6",text:"#1e40af"},
  "Blair York":{bg:"#D1FAE5",border:"#10B981",text:"#065f46"},
  "Michael Kidd":{bg:"#FEF3C7",border:"#D97706",text:"#92400e"},
  "Aitkens & Co":{bg:"#E0E7FF",border:"#6366F1",text:"#3730a3"},
  "Michael Calder":{bg:"#F3E8FF",border:"#A855F7",text:"#6b21a8"},
  "Rebecca Tucker":{bg:"#FCE7F3",border:"#EC4899",text:"#9d174d"},
  "Trish Rowe":{bg:"#F1F5F9",border:"#94A3B8",text:"#475569"},
  "Peter & Rosemary Tennent":{bg:"#ECFDF5",border:"#34D399",text:"#047857"},
  "Xolo Ltd.":{bg:"#F0F9FF",border:"#38BDF8",text:"#0369a1"},
  "Distinct Studio":{bg:"#FFF7ED",border:"#FB923C",text:"#9a3412"},
};
function jc(c: string){return JC[c]||{bg:"#f5f5f5",border:"#ccc",text:"#666"};}

// ── Helpers ───────────────────────────────────────────────────
// Week boundaries computed from real today (Mon of this week + next week).
function weekBoundaries() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const monOffset = day === 0 ? -6 : 1 - day;
  const thisMon = new Date(now);
  thisMon.setHours(0, 0, 0, 0);
  thisMon.setDate(thisMon.getDate() + monOffset);
  const nextMon = new Date(thisMon);
  nextMon.setDate(nextMon.getDate() + 7);
  const twoMon = new Date(thisMon);
  twoMon.setDate(twoMon.getDate() + 14);
  return { thisMon, nextMon, twoMon };
}

function shipInfo(d: string | null){
  if(!d) return{text:"No date set",level:"none" as const,badge:null};
  const ship=new Date(d);
  const { thisMon, nextMon, twoMon } = weekBoundaries();
  const today = new Date(); today.setHours(0,0,0,0);
  const diff=Math.ceil((ship.getTime()-today.getTime())/864e5);
  if(ship>=thisMon&&ship<nextMon) return{text:fmtDate(d),level:"thisWeek" as const,badge:"This week"};
  if(ship>=nextMon&&ship<twoMon) return{text:fmtDate(d),level:"nextWeek" as const,badge:"Next week"};
  if(diff<0) return{text:fmtDate(d),level:"past" as const,badge:null};
  if(diff<=30) return{text:fmtDate(d),level:"ok" as const,badge:`${diff}d`};
  return{text:fmtDate(d),level:"plenty" as const,badge:`${diff}d`};
}
function fmtDate(d: string | null){return d?new Date(d).toLocaleDateString("en-NZ",{day:"numeric",month:"short"}):"—";}
function fmtCurrency(v: number | null){return v==null?"—":"$"+v.toLocaleString("en-NZ");}
function isComplete(o: DisplayOrder){return["Collected","Finished","Shipped"].includes(o.status);}
function progressPct(o: DisplayOrder){
  if (o.steps.length === 0) return 0;
  return Math.min(100,Math.round((o.currentStep/Math.max(1,o.steps.length-1))*100));
}
function sortByShipDate(a: DisplayOrder,b: DisplayOrder){if(!a.shipDate&&!b.shipDate)return 0;if(!a.shipDate)return 1;if(!b.shipDate)return -1;return new Date(a.shipDate).getTime()-new Date(b.shipDate).getTime();}

// ━━━ VERTICAL STEP TIMELINE ("Where's my table?") ━━━━━━━━━━━
function StepTimeline({steps,currentStep,repair}: {steps: Step[], currentStep: number, repair?: boolean}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {steps.map((step,i)=>{
        const done=i<currentStep;
        const active=i===currentStep;
        const isRepair=repair&&active;
        const fill=isRepair?"#d97706":DT.teal;
        return(
          <div key={step.key} style={{display:"flex",alignItems:"stretch",gap:12}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:20,flexShrink:0}}>
              {i>0&&<div style={{width:2,flex:"1 1 0",minHeight:4,background:done||active?fill:"rgba(0,0,0,0.06)"}}/>}
              {i===0&&<div style={{flex:"1 1 0"}}/>}
              {step.wait?(
                <div style={{width:14,height:14,borderRadius:3,background:done?fill+"18":active?"rgba(200,169,110,0.12)":"rgba(0,0,0,0.03)",border:`1.5px dashed ${done?fill:active?DT.gold:"rgba(0,0,0,0.10)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:7}}>{done?"✓":"⏳"}</span>
                </div>
              ):(
                <div style={{width:done?10:active?14:10,height:done?10:active?14:10,borderRadius:"50%",background:done?fill:active?fill:"transparent",border:done||active?`2px solid ${fill}`:`2px solid rgba(0,0,0,0.08)`,boxShadow:active?`0 0 0 3px ${fill}18`:"none",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {done&&<span style={{color:"#fff",fontSize:7,lineHeight:1}}>✓</span>}
                </div>
              )}
              {i<steps.length-1&&<div style={{width:2,flex:"1 1 0",minHeight:4,background:done?fill:"rgba(0,0,0,0.06)"}}/>}
              {i===steps.length-1&&<div style={{flex:"1 1 0"}}/>}
            </div>
            <div style={{padding:"4px 0",flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{
                  fontSize:12,fontFamily:DT.sans,
                  fontWeight:active?700:done?500:400,
                  color:active?fill:done?DT.textSecondary:DT.textFaint,
                  textDecoration:done&&!active?"line-through":"none",
                  textDecorationColor:done?"rgba(0,0,0,0.12)":"none",
                }}>
                  {step.label}
                </span>
                {step.who&&!done&&(
                  <span style={{fontSize:9,color:DT.textFaint,fontFamily:DT.sans,fontWeight:400}}>{step.who}</span>
                )}
                {step.wait&&!done&&(
                  <span style={{fontSize:9,color:DT.gold,fontFamily:DT.sans,fontWeight:500,fontStyle:"italic"}}>{step.waitLabel}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ━━━ SHARED COMPONENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function StatusPill({status}: {status: string}){
  const m: Record<string, {bg:string,c:string}>={"In Production":{bg:DT.tealSoft,c:DT.teal},"Not Started":{bg:DT.goldSoft,c:"#8a6d3b"},"Finished":{bg:DT.greenBg,c:DT.green},"Shipped":{bg:DT.greenBg,c:DT.green},"Collected":{bg:"rgba(0,0,0,0.04)",c:DT.textMuted}};
  const s=m[status]||{bg:"rgba(0,0,0,0.04)",c:DT.textMuted};
  return <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:s.bg,color:s.c,fontFamily:DT.sans,whiteSpace:"nowrap"}}>{status}</span>;
}

function ProductTag({product, raw}: {product: string, raw: string | null}){
  const label = raw ?? product;
  return <span style={{padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:600,background:"rgba(0,0,0,0.03)",color:DT.textMuted,fontFamily:DT.sans,border:"1px solid rgba(0,0,0,0.04)",textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</span>;
}

function ShipBadge({shipDate}: {shipDate: string | null}){
  const si=shipInfo(shipDate);
  if(si.level==="none") return <span style={{fontSize:10,color:DT.textFaint,fontFamily:DT.sans,fontStyle:"italic"}}>No date</span>;
  if(si.level==="past") return <span style={{fontSize:10,color:DT.textFaint,fontFamily:DT.sans}}>{si.text}</span>;
  const bc: Record<string, {bg:string,text:string,bdr:string}>={thisWeek:{bg:"rgba(12,124,122,0.08)",text:DT.teal,bdr:"rgba(12,124,122,0.15)"},nextWeek:{bg:"rgba(200,169,110,0.08)",text:"#8a6d3b",bdr:"rgba(200,169,110,0.15)"},ok:{bg:"rgba(0,0,0,0.03)",text:DT.textMuted,bdr:"rgba(0,0,0,0.06)"},plenty:{bg:"rgba(0,0,0,0.02)",text:DT.textFaint,bdr:"rgba(0,0,0,0.04)"}};
  const c=bc[si.level]||bc.ok;
  return(<div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1}}>
    <span style={{fontSize:11,fontWeight:600,color:c.text,fontFamily:DT.sans}}>{si.text}</span>
    {si.badge&&<span style={{fontSize:9,fontWeight:600,color:c.text,padding:"1px 6px",borderRadius:4,background:c.bg,border:`1px solid ${c.bdr}`,fontFamily:DT.sans}}>{si.badge}</span>}
  </div>);
}

function SectionHeader({icon,label}: {icon?: string, label: string}){
  return(<div style={{display:"flex",alignItems:"center",gap:8,margin:"24px 0 10px"}}>{icon&&<span style={{fontSize:12,opacity:0.5}}>{icon}</span>}<span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:DT.textFaint,fontFamily:DT.sans,whiteSpace:"nowrap"}}>{label}</span><div style={{flex:1,height:1,background:"rgba(0,0,0,0.04)"}}/></div>);
}

// ━━━ ORDER CARD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OrderCard({order}: {order: DisplayOrder}){
  const [open,setOpen]=useState(false);
  const comp=isComplete(order);
  const pct=progressPct(order);
  const colors=jc(order.customer);
  const borderColor=comp?"rgba(0,0,0,0.08)":colors.border;
  const barColor=comp?DT.green:DT.teal;
  const cardBg=comp?DT.cardBg:`linear-gradient(135deg, ${colors.bg}44 0%, ${DT.cardBg} 60%)`;
  const currentStepLabel=order.steps[Math.min(order.currentStep,order.steps.length-1)]?.label;
  const rawTooltip = `Monday raw: Status=${order.rawMondayStatus ?? "—"}, Top/Panel=${order.rawMondayTopPanel ?? "—"}, Legs=${order.rawMondayLegs ?? "—"}`;

  return(
    <div onClick={()=>setOpen(!open)}
      style={{background:cardBg,border:`1px solid ${DT.border}`,borderLeft:`4px solid ${borderColor}`,borderRadius:DT.radius,padding:"16px 20px",cursor:"pointer",boxShadow:DT.shadow,transition:"box-shadow 0.2s",opacity:comp?0.5:1}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow=DT.shadowHover;}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow=DT.shadow;}}>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:borderColor,flexShrink:0}}/>
            <span style={{fontSize:15,fontWeight:600,color:DT.textPrimary,fontFamily:DT.sans}}>{order.customer}</span>
            <ProductTag product={order.product} raw={order.rawMondayItem}/>
            <StatusPill status={order.status}/>
          </div>
        </div>
        <div style={{flexShrink:0,display:"flex",alignItems:"flex-start",gap:8}}>
          {order.xero&&(
            <a href={order.xero} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
              style={{fontSize:11,color:DT.teal,fontFamily:DT.sans,fontWeight:600,textDecoration:"none",padding:"2px 8px",borderRadius:4,background:DT.tealSoft,border:"1px solid rgba(12,124,122,0.10)",whiteSpace:"nowrap",lineHeight:"18px"}}>
              Xero
            </a>
          )}
          <ShipBadge shipDate={order.shipDate}/>
        </div>
      </div>

      {order.steps.length > 0 && (
        <div style={{margin:"10px 0 0",paddingLeft:15}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,height:4,background:"rgba(0,0,0,0.04)",borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:2,transition:"width 0.6s ease"}}/>
            </div>
            <span style={{fontSize:11,color:DT.textFaint,fontFamily:DT.sans,fontWeight:500,minWidth:28,textAlign:"right"}}>{pct}%</span>
          </div>
        </div>
      )}

      <div title={rawTooltip} style={{marginTop:6,paddingLeft:15,fontSize:13,color:DT.textSecondary,fontFamily:DT.sans,display:"flex",alignItems:"center",gap:6}}>
        {!comp&&order.steps.length>0&&(
          <>
            <span style={{fontSize:7,color:DT.teal,opacity:0.6}}>●</span>
            <span style={{color:order.repair?"#d97706":DT.teal,fontWeight:500}}>{order.stepNote||currentStepLabel}</span>
            <span style={{color:DT.textFaint}}>·</span>
          </>
        )}
        <span style={{color:DT.textMuted}}>{fmtCurrency(order.value)}</span>
        <span style={{fontSize:14,color:DT.textFaint,transition:"transform 0.2s",transform:open?"rotate(180deg)":"rotate(0deg)",lineHeight:1,marginLeft:"auto"}}>▾</span>
      </div>

      <div style={{maxHeight:open?600:0,overflow:"hidden",transition:"max-height 0.35s ease, opacity 0.2s",opacity:open?1:0}}>
        <div style={{marginTop:16,paddingTop:16,paddingLeft:15,borderTop:`1px solid ${DT.border}`}}>
          {!comp&&order.steps.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:DT.textFaint,fontFamily:DT.sans,marginBottom:10}}>
                Production Progress — step {Math.min(order.currentStep+1, order.steps.length)} of {order.steps.length}
              </div>
              <StepTimeline steps={order.steps} currentStep={order.currentStep} repair={order.repair}/>
            </div>
          )}
          {order.notes&&<p style={{fontSize:13,color:DT.textSecondary,lineHeight:1.6,margin:"0 0 14px",fontFamily:DT.sans,padding:"8px 12px",background:"rgba(0,0,0,0.015)",borderRadius:8,border:`1px solid ${DT.border}`}}>{order.notes}</p>}
          <div style={{fontSize:10,color:DT.textFaint,fontFamily:DT.sans,padding:"6px 10px",background:"rgba(0,0,0,0.02)",borderRadius:6,lineHeight:1.5}}>
            <strong style={{color:DT.textMuted}}>Monday raw:</strong> Item={order.rawMondayItem ?? "—"} · Status={order.rawMondayStatus ?? "—"} · Top/Panel={order.rawMondayTopPanel ?? "—"} · Legs={order.rawMondayLegs ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━ KPIs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function KpiStrip({orders}: {orders: DisplayOrder[]}){
  const active=orders.filter(o=>!isComplete(o));
  const { thisMon, nextMon, twoMon } = weekBoundaries();
  const today = new Date(); today.setHours(0,0,0,0);
  const dueThis=active.filter(o=>{if(!o.shipDate)return false;const d=new Date(o.shipDate);return d>=thisMon&&d<nextMon;}).length;
  const dueNext=active.filter(o=>{if(!o.shipDate)return false;const d=new Date(o.shipDate);return d>=nextMon&&d<twoMon;}).length;
  const overdue=active.filter(o=>{if(!o.shipDate)return false;return new Date(o.shipDate)<today;}).length;
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:10,marginBottom:4}}>
      {[{l:"Active Orders",v:active.length},{l:"Due This Week",v:dueThis},{l:"Due Next Week",v:dueNext},{l:"Overdue",v:overdue}].map(k=>(
        <div key={k.l} style={{padding:"14px 16px",background:DT.cardBg,borderRadius:DT.radius,border:`1px solid ${DT.border}`,boxShadow:DT.shadow}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:DT.textFaint,fontFamily:DT.sans}}>{k.l}</div>
          <div style={{fontSize:22,fontWeight:700,color:DT.textPrimary,fontFamily:DT.serif,marginTop:2,lineHeight:1.1}}>{k.v}</div>
        </div>
      ))}
    </div>
  );
}

// ━━━ READ-ONLY BADGE + REFRESH BUTTON ━━━━━━━━━━━━━━━━━━━━━━
function relativeAge(syncedAt: string): string {
  const ms = Date.now() - new Date(syncedAt).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function SourceIndicator({ syncedAt, source, mondayError }: { syncedAt: string; source: string; mondayError?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  // tick is used to force re-render for age refresh
  void tick;
  const age = relativeAge(syncedAt);
  const stale = source === "snapshot";
  return (
    <div title={mondayError ? `Monday error: ${mondayError}` : `Synced at ${syncedAt}`}
      style={{fontSize:10,color:stale?"#d97706":DT.gold,fontFamily:DT.sans,marginTop:1,lineHeight:1.3}}>
      Read-only mirror · Source: Monday.com · {stale ? "⚠ Stale — " : "Synced "}{age}
    </div>
  );
}

function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const onClick = async () => {
    setErr(null);
    try {
      const res = await fetch("/api/monday/refresh", { method: "POST", credentials: "include" });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || "Refresh failed");
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      {err && <span style={{fontSize:10,color:"#fca5a5",fontFamily:DT.sans}} title={err}>Refresh error</span>}
      <button onClick={onClick} disabled={isPending}
        style={{padding:"5px 12px",borderRadius:6,background:DT.gold,color:DT.headerBg,border:"none",fontWeight:700,fontSize:11,cursor:isPending?"wait":"pointer",fontFamily:DT.sans,letterSpacing:"0.02em",opacity:isPending?0.6:1}}>
        {isPending ? "Refreshing…" : "Refresh from Monday"}
      </button>
    </div>
  );
}

// ━━━ MAIN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type ProductionClientProps = {
  orders: UiOrder[];
  syncedAt: string;
  source: "fresh" | "cache" | "snapshot" | "none";
  mondayError?: string;
};

export default function ProductionClient({ orders, syncedAt, source, mondayError }: ProductionClientProps) {
  const [showComplete, setShowComplete] = useState(false);

  const display = orders.map(toDisplayOrder);
  // Single active list sorted by soonest ship date. Status (In Production /
  // Not Started) is still visible per card via the StatusPill, but order is
  // driven purely by urgency so the most urgent job is always at the top.
  const active = display.filter((o) => !isComplete(o)).sort(sortByShipDate);
  const complete = display.filter(isComplete).sort(sortByShipDate);

  return (
    <div style={{minHeight:"100vh",background:DT.pageBg,fontFamily:DT.sans}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet"/>
      <header style={{position:"sticky",top:0,zIndex:100}}>
        <div style={{background:DT.headerBg,padding:"0 24px",height:64,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:"#fff",fontFamily:DT.serif,lineHeight:1.2}}>Production Command Centre</div>
            <div style={{fontSize:11,color:DT.gold,fontFamily:DT.sans,marginTop:1}}>{active.length} active orders</div>
            <SourceIndicator syncedAt={syncedAt} source={source} mondayError={mondayError}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <Link href="/production/plan" style={{fontSize:11,color:"rgba(255,255,255,0.6)",textDecoration:"none",fontFamily:DT.sans,fontWeight:500}}>Plan →</Link>
            <RefreshButton/>
          </div>
        </div>
        <div style={{height:1,background:`linear-gradient(90deg, transparent 0%, ${DT.gold} 30%, ${DT.gold} 70%, transparent 100%)`,opacity:0.35}}/>
      </header>
      <main style={{maxWidth:1200,margin:"0 auto",padding:"20px 20px"}}>
        <KpiStrip orders={display}/>
        {active.length>0&&(<><SectionHeader icon="◉" label="Active · sorted by soonest ship date"/><div style={{display:"flex",flexDirection:"column",gap:10}}>{active.map(o=><OrderCard key={o.id} order={o}/>)}</div></>)}
        {complete.length>0&&(<div style={{marginTop:24}}>
          <button onClick={()=>setShowComplete(!showComplete)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",padding:0,width:"100%"}}>
            <span style={{fontSize:12,opacity:0.5}}>✓</span><span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:DT.textFaint,fontFamily:DT.sans}}>{complete.length} completed</span><div style={{flex:1,height:1,background:"rgba(0,0,0,0.04)"}}/><span style={{fontSize:11,color:DT.textFaint,fontFamily:DT.sans,fontWeight:500}}>{showComplete?"Hide":"Show"}</span><span style={{fontSize:12,color:DT.textFaint,transition:"transform 0.2s",transform:showComplete?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
          </button>
          {showComplete&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:10}}>{complete.map(o=><OrderCard key={o.id} order={o}/>)}</div>}
        </div>)}
        {display.length===0&&<div style={{padding:"60px 20px",textAlign:"center",fontSize:13,color:DT.textFaint,fontFamily:DT.sans}}>No orders available. {mondayError && `(${mondayError})`}</div>}
      </main>
      <footer style={{textAlign:"center",padding:"20px",fontSize:10,color:"#ccc",fontFamily:DT.sans}}>Innate Production Command Centre · Monday.com data</footer>
    </div>
  );
}
