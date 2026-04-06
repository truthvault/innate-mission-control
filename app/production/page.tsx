'use client';

import { useState } from "react";
import Link from "next/link";

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
const TABLE_STEPS = [
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

const PANEL_STEPS = [
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

// ── ORDER DATA ────────────────────────────────────────────────
// currentStep = index into the steps array for this product type
const ORDERS = [
  {id:1,customer:"Instinct Interiors",product:"Table",value:4925,status:"In Production",
    steps:TABLE_STEPS,currentStep:11,stepNote:"Assemble top + legs",
    shipDate:"2026-04-06",xero:"https://in.xero.com/6tVZYdMnxC3Jj8Q9r3HtOP7ieYiMcbFOx2DnofjD",
    notes:"Trade client. Top final coat done, legs received. Assembling this week."},

  {id:2,customer:"Nordzco Joinery",product:"Panel",value:1173,status:"In Production",
    steps:PANEL_STEPS,currentStep:6,stepNote:"1st coat applied",
    shipDate:"2026-04-28",xero:"https://in.xero.com/Xa7Jtn2WwBeu927U038Ghb8SfeiMTIzGZVKCr6WG",
    notes:"Trade order. 1st coat on, 2nd coat this week."},

  {id:3,customer:"Blair York",product:"Table",value:4699,status:"In Production",
    steps:TABLE_STEPS,currentStep:6,stepNote:"Repair — hand sand p180",repair:true,
    shipDate:"2026-06-01",xero:"https://in.xero.com/jSSiOmrpXDNMQUHMGS1AEqXJMByE8rChOFBNwHkT",
    notes:"Table repair in progress. Local delivery Sumner."},

  {id:4,customer:"Aitkens & Co",product:"Panel",value:304,status:"In Production",
    steps:PANEL_STEPS,currentStep:10,stepNote:"Ready to wrap + ship",
    shipDate:"2026-04-20",xero:"https://in.xero.com/qkt4W5LbHOSNTECpu1jt4uof3Dtjj7k3whkxIRY7",
    notes:"CNC panel done. Book freight this week."},

  {id:5,customer:"Michael Calder",product:"Panel",value:3914,status:"In Production",
    steps:PANEL_STEPS,currentStep:3,stepNote:"Materials received — needs scheduling",
    shipDate:null,xero:"https://in.xero.com/soHDGjgdL3Kyf2fVwSRIde4IOmJowXoVompneVDW",
    notes:"Materials in. Ready to start when scheduled."},

  {id:6,customer:"Michael Kidd",product:"Table",value:9390,status:"Not Started",
    steps:TABLE_STEPS,currentStep:0,stepNote:"Materials to order",
    shipDate:"2026-06-30",xero:"https://in.xero.com/3scP33bDIq9jMlGHPqPnemKCrRCEgIKOThToSAnV",
    notes:"Large order. POs needed. Ship Jun 30."},

  {id:7,customer:"Rebecca Tucker",product:"Table",value:4933,status:"Shipped",
    steps:TABLE_STEPS,currentStep:13,stepNote:"Dispatched",
    shipDate:"2026-03-30",xero:"https://in.xero.com/Z8JJVuaLVtU9kiePoMpvMjMU6CzRVaJ7RFL2upMF"},

  {id:8,customer:"Trish Rowe",product:"Table",value:3900,status:"Collected",
    steps:TABLE_STEPS,currentStep:13,stepNote:"Collected",
    shipDate:"2026-03-30",xero:"https://in.xero.com/ItJx9IbtPuTdObDSvTS91F2cx7GEKIkwkW2XsLZj"},

  {id:9,customer:"Peter & Rosemary Tennent",product:"Table",value:5090,status:"Finished",
    steps:TABLE_STEPS,currentStep:12,stepNote:"Complete — freight to book",
    shipDate:"2026-05-01",xero:"https://in.xero.com/kgQVvSAdYiiLbj50v4h7VSzF5Kkc2v4ebbug5tsu"},

  {id:10,customer:"Xolo Ltd.",product:"Custom",value:3367,status:"Collected",
    steps:TABLE_STEPS,currentStep:13,stepNote:"Collected",
    shipDate:"2026-04-13",xero:"https://in.xero.com/wmUeBUQ4z7N14YigzHfk73zGSnpcAxsPPRaG6tTb"},

  {id:11,customer:"Distinct Studio",product:"Panel",value:2162,status:"Collected",
    steps:PANEL_STEPS,currentStep:11,stepNote:"Collected",
    shipDate:"2026-03-30",xero:"https://in.xero.com/Tt17HkSYXneeeBeWrwnaUuXsEzdKQPbjWCxsDCym"},
];

// ── Planner Data ──────────────────────────────────────────────
let _id=0;
const TK=(t: string,c: string,h: number)=>({id:++_id,task:t,customer:c,h,type:"task" as const,done:false});
const CU=(l: string,c: string)=>({id:++_id,task:l,customer:c,h:0,type:"cure" as const,done:false});
const mkWeeks=()=>({"Apr 7–11":{Monday:{dylan:[TK("QC + photos","Instinct Interiors",1),TK("Sand","Aitkens & Co",0.5)],nick:[]},Tuesday:{dylan:[TK("Assemble","Instinct Interiors",1)],nick:[TK("Review Kidd POs","Michael Kidd",0.5)]},Wednesday:{dylan:[TK("Book freight","Instinct Interiors",0.5),TK("1st coat","Nordzco Joinery",1)],nick:[]},Thursday:{dylan:[TK("2nd coat","Nordzco Joinery",1)],nick:[]},Friday:{dylan:[TK("Book freight","Aitkens & Co",0.5),TK("Start Calder panel","Michael Calder",1)],nick:[]}},"Apr 14–18":{Monday:{dylan:[CU("Curing until Apr 18","Nordzco Joinery")],nick:[]},Tuesday:{dylan:[],nick:[]},Wednesday:{dylan:[TK("QC + photos","Nordzco Joinery",1)],nick:[]},Thursday:{dylan:[TK("Book freight","Nordzco Joinery",0.5),TK("Blair York repair","Blair York",1)],nick:[]},Friday:{dylan:[TK("Sand","Blair York",1)],nick:[]}},"Apr 21–25":{Monday:{dylan:[TK("1st coat","Blair York",1)],nick:[]},Tuesday:{dylan:[TK("2nd coat","Blair York",1)],nick:[]},Wednesday:{dylan:[CU("Curing until May 2","Blair York")],nick:[]},Thursday:{dylan:[TK("Michael Calder panel","Michael Calder",1)],nick:[]},Friday:{dylan:[],nick:[]}}});

// ── Helpers ───────────────────────────────────────────────────
const TODAY=new Date("2026-04-07");
const DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday"] as const;
const DS=["Mon","Tue","Wed","Thu","Fri"];
const DATES: Record<string, number[]>={"Apr 7–11":[7,8,9,10,11],"Apr 14–18":[14,15,16,17,18],"Apr 21–25":[21,22,23,24,25]};
const WK_START=new Date("2026-04-06"),WK_END=new Date("2026-04-13");
const NWK_START=new Date("2026-04-13"),NWK_END=new Date("2026-04-20");

function shipInfo(d: string | null){
  if(!d) return{text:"No date set",level:"none",badge:null};
  const ship=new Date(d),diff=Math.ceil((ship.getTime()-TODAY.getTime())/864e5);
  if(ship>=WK_START&&ship<WK_END) return{text:fmtDate(d),level:"thisWeek",badge:"This week"};
  if(ship>=NWK_START&&ship<NWK_END) return{text:fmtDate(d),level:"nextWeek",badge:"Next week"};
  if(diff<0) return{text:fmtDate(d),level:"past",badge:null};
  if(diff<=30) return{text:fmtDate(d),level:"ok",badge:`${diff}d`};
  return{text:fmtDate(d),level:"plenty",badge:`${diff}d`};
}
function fmtDate(d: string | null){return d?new Date(d).toLocaleDateString("en-NZ",{day:"numeric",month:"short"}):"—";}
function fmtCurrency(v: number){return "$"+v.toLocaleString("en-NZ");}
function fmtH(h: number){return h<1?`${Math.round(h*60)}m`:`${h}h`;}
function isComplete(o: typeof ORDERS[number]){return["Collected","Finished","Shipped"].includes(o.status);}
function progressPct(o: typeof ORDERS[number]){return Math.min(100,Math.round((o.currentStep/Math.max(1,o.steps.length-1))*100));}
function sortByShipDate(a: typeof ORDERS[number],b: typeof ORDERS[number]){if(!a.shipDate&&!b.shipDate)return 0;if(!a.shipDate)return 1;if(!b.shipDate)return -1;return new Date(a.shipDate).getTime()-new Date(b.shipDate).getTime();}


// ━━━ VERTICAL STEP TIMELINE ("Where's my table?") ━━━━━━━━━━━
function StepTimeline({steps,currentStep,repair}: {steps: typeof TABLE_STEPS, currentStep: number, repair?: boolean}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {steps.map((step,i)=>{
        const done=i<currentStep;
        const active=i===currentStep;
        const isRepair=repair&&active;
        const fill=isRepair?"#d97706":DT.teal;

        return(
          <div key={step.key} style={{display:"flex",alignItems:"stretch",gap:12}}>
            {/* Vertical line + dot */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:20,flexShrink:0}}>
              {/* Connector top */}
              {i>0&&<div style={{width:2,flex:"1 1 0",minHeight:4,background:done||active?fill:"rgba(0,0,0,0.06)"}}/>}
              {i===0&&<div style={{flex:"1 1 0"}}/>}
              {/* Dot */}
              {step.wait?(
                <div style={{width:14,height:14,borderRadius:3,background:done?fill+"18":active?"rgba(200,169,110,0.12)":"rgba(0,0,0,0.03)",border:`1.5px dashed ${done?fill:active?DT.gold:"rgba(0,0,0,0.10)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:7}}>{done?"✓":"⏳"}</span>
                </div>
              ):(
                <div style={{width:done?10:active?14:10,height:done?10:active?14:10,borderRadius:"50%",background:done?fill:active?fill:"transparent",border:done||active?`2px solid ${fill}`:`2px solid rgba(0,0,0,0.08)`,boxShadow:active?`0 0 0 3px ${fill}18`:"none",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {done&&<span style={{color:"#fff",fontSize:7,lineHeight:1}}>✓</span>}
                </div>
              )}
              {/* Connector bottom */}
              {i<steps.length-1&&<div style={{width:2,flex:"1 1 0",minHeight:4,background:done?fill:"rgba(0,0,0,0.06)"}}/>}
              {i===steps.length-1&&<div style={{flex:"1 1 0"}}/>}
            </div>

            {/* Label */}
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

function ProductTag({product}: {product: string}){
  return <span style={{padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:600,background:"rgba(0,0,0,0.03)",color:DT.textMuted,fontFamily:DT.sans,border:"1px solid rgba(0,0,0,0.04)",textTransform:"uppercase",letterSpacing:"0.04em"}}>{product}</span>;
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
function OrderCard({order,onViewPlanner}: {order: typeof ORDERS[number], onViewPlanner?: (customer: string) => void}){
  const [open,setOpen]=useState(false);
  const comp=isComplete(order);
  const pct=progressPct(order);
  const colors=jc(order.customer);
  const borderColor=comp?"rgba(0,0,0,0.08)":colors.border;
  const barColor=comp?DT.green:DT.teal;
  const cardBg=comp?DT.cardBg:`linear-gradient(135deg, ${colors.bg}44 0%, ${DT.cardBg} 60%)`;
  const currentStepLabel=order.steps[Math.min(order.currentStep,order.steps.length-1)]?.label;

  return(
    <div onClick={()=>setOpen(!open)}
      style={{background:cardBg,border:`1px solid ${DT.border}`,borderLeft:`4px solid ${borderColor}`,borderRadius:DT.radius,padding:"16px 20px",cursor:"pointer",boxShadow:DT.shadow,transition:"box-shadow 0.2s",opacity:comp?0.5:1}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow=DT.shadowHover;}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow=DT.shadow;}}>

      {/* Row 1: Name + product tag + status + ship badge */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:borderColor,flexShrink:0}}/>
            <span style={{fontSize:15,fontWeight:600,color:DT.textPrimary,fontFamily:DT.sans}}>{order.customer}</span>
            <ProductTag product={order.product}/>
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

      {/* Row 2: Progress bar */}
      <div style={{margin:"10px 0 0",paddingLeft:15}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,height:4,background:"rgba(0,0,0,0.04)",borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:2,transition:"width 0.6s ease"}}/>
          </div>
          <span style={{fontSize:11,color:DT.textFaint,fontFamily:DT.sans,fontWeight:500,minWidth:28,textAlign:"right"}}>{pct}%</span>
        </div>
      </div>

      {/* Row 3: Current step + value */}
      <div style={{marginTop:6,paddingLeft:15,fontSize:13,color:DT.textSecondary,fontFamily:DT.sans,display:"flex",alignItems:"center",gap:6}}>
        {!comp&&(
          <>
            <span style={{fontSize:7,color:DT.teal,opacity:0.6}}>●</span>
            <span style={{color:(order as any).repair?"#d97706":DT.teal,fontWeight:500}}>{order.stepNote||currentStepLabel}</span>
            <span style={{color:DT.textFaint}}>·</span>
          </>
        )}
        <span style={{color:DT.textMuted}}>{fmtCurrency(order.value)}</span>
        <span style={{fontSize:14,color:DT.textFaint,transition:"transform 0.2s",transform:open?"rotate(180deg)":"rotate(0deg)",lineHeight:1,marginLeft:"auto"}}>▾</span>
      </div>

      {/* EXPANDED: Where's my table? */}
      <div style={{maxHeight:open?600:0,overflow:"hidden",transition:"max-height 0.35s ease, opacity 0.2s",opacity:open?1:0}}>
        <div style={{marginTop:16,paddingTop:16,paddingLeft:15,borderTop:`1px solid ${DT.border}`}}>

          {/* Step timeline */}
          {!comp&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:DT.textFaint,fontFamily:DT.sans,marginBottom:10}}>
                Production Progress — {order.currentStep} of {order.steps.length} steps
              </div>
              <StepTimeline steps={order.steps} currentStep={order.currentStep} repair={(order as any).repair}/>
            </div>
          )}

          {/* Notes */}
          {order.notes&&<p style={{fontSize:13,color:DT.textSecondary,lineHeight:1.6,margin:"0 0 14px",fontFamily:DT.sans,padding:"8px 12px",background:"rgba(0,0,0,0.015)",borderRadius:8,border:`1px solid ${DT.border}`}}>{order.notes}</p>}

          {/* Actions */}
          {!comp&&onViewPlanner&&(
            <button onClick={e=>{e.stopPropagation();onViewPlanner(order.customer);}}
              style={{padding:"8px 18px",borderRadius:DT.radiusSm,border:"none",background:DT.headerBg,color:"#fff",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:DT.sans}}>
              View on Planner →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ━━━ KPIs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function KpiStrip({orders}: {orders: typeof ORDERS}){
  const active=orders.filter(o=>!isComplete(o));
  const dueThis=active.filter(o=>{if(!o.shipDate)return false;const d=new Date(o.shipDate);return d>=WK_START&&d<WK_END;}).length;
  const dueNext=active.filter(o=>{if(!o.shipDate)return false;const d=new Date(o.shipDate);return d>=NWK_START&&d<NWK_END;}).length;
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:10,marginBottom:4}}>
      {[{l:"Active Orders",v:active.length},{l:"Due This Week",v:dueThis},{l:"Due Next Week",v:dueNext},{l:"Overdue",v:0}].map(k=>(
        <div key={k.l} style={{padding:"14px 16px",background:DT.cardBg,borderRadius:DT.radius,border:`1px solid ${DT.border}`,boxShadow:DT.shadow}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:DT.textFaint,fontFamily:DT.sans}}>{k.l}</div>
          <div style={{fontSize:22,fontWeight:700,color:DT.textPrimary,fontFamily:DT.serif,marginTop:2,lineHeight:1.1}}>{k.v}</div>
        </div>
      ))}
    </div>
  );
}


// ━━━ PLANNER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function WeeklyPlanner({highlightJob,onClear}: {highlightJob: string | null, onClear: () => void}){
  const [weeks,setWeeks]=useState(mkWeeks);const [selected,setSelected]=useState<{wk:string,day:string,p:string,idx:number}|null>(null);
  const tapTask=(wk: string,day: string,p: string,idx: number)=>{const t=(weeks as any)[wk]?.[day]?.[p]?.[idx];if(!t||t.type!=="task")return;if(selected&&selected.wk===wk&&selected.day===day&&selected.p===p&&selected.idx===idx){setSelected(null);return;}if(selected){moveTask(wk,day,p);return;}setSelected({wk,day,p,idx});};
  const tapSlot=(wk: string,day: string,p: string)=>{if(selected)moveTask(wk,day,p);};
  const moveTask=(tw: string,td: string,tp: string)=>{if(!selected)return;const{wk,day,p,idx}=selected;if(wk===tw&&day===td&&p===tp){setSelected(null);return;}setWeeks((pv: any)=>{const n=JSON.parse(JSON.stringify(pv));const s=n[wk]?.[day]?.[p];if(!s||!s[idx])return pv;const[t]=s.splice(idx,1);if(!n[tw]?.[td]?.[tp])return pv;n[tw][td][tp].push(t);return n;});setSelected(null);};
  const toggleDone=(wk: string,day: string,p: string,idx: number,e: React.MouseEvent)=>{e.stopPropagation();setWeeks((pv: any)=>{const n=JSON.parse(JSON.stringify(pv));const t=n[wk]?.[day]?.[p]?.[idx];if(t&&t.type==="task")t.done=!t.done;return n;});};
  const isSel=(wk: string,day: string,p: string,idx: number)=>selected&&selected.wk===wk&&selected.day===day&&selected.p===p&&selected.idx===idx;
  const allJobs=new Set<string>();Object.values(weeks).forEach((days: any)=>(DAYS as readonly string[]).forEach(d=>{[...(days[d]?.dylan||[]),...(days[d]?.nick||[])].forEach((t: any)=>{if(t.type==="task")allJobs.add(t.customer);});}));
  return(
    <div>
      {selected&&<div style={{position:"sticky",top:57,zIndex:20,background:DT.headerBg,color:"#fff",padding:"8px 14px",borderRadius:DT.radiusSm,marginBottom:10,fontSize:12,fontFamily:DT.sans,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>Tap a cell to move task</span><button onClick={()=>setSelected(null)} style={{background:DT.gold,color:DT.headerBg,border:"none",borderRadius:6,padding:"4px 12px",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:DT.sans}}>Cancel</button></div>}
      {highlightJob&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",background:jc(highlightJob).bg,border:`1px solid ${jc(highlightJob).border}33`,borderRadius:DT.radiusSm,marginBottom:12,fontSize:12,fontFamily:DT.sans}}><span style={{color:jc(highlightJob).text,fontWeight:600}}>Showing: {highlightJob}</span><button onClick={onClear} style={{background:"none",border:"none",color:jc(highlightJob).text,fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:DT.sans,textDecoration:"underline"}}>Show all</button></div>}
      {Object.entries(weeks).map(([wk,days])=>{
        const dH=DAYS.reduce((s,d)=>((days as any)[d]?.dylan||[]).reduce((a: number,t: any)=>a+(t.type==="task"&&!t.done?t.h:0),s),0);
        const nH=DAYS.reduce((s,d)=>((days as any)[d]?.nick||[]).reduce((a: number,t: any)=>a+(t.type==="task"&&!t.done?t.h:0),s),0);
        const dates=DATES[wk]||[0,0,0,0,0];
        return(<div key={wk} style={{marginBottom:24}}>
          <div style={{position:"sticky",top:selected?97:57,background:DT.pageBg,paddingBottom:4,zIndex:10}}>
            <div style={{fontSize:14,fontWeight:700,color:DT.textPrimary,fontFamily:DT.serif,marginBottom:2}}>{wk}</div>
            <div style={{fontSize:10,color:DT.textFaint,fontFamily:DT.sans}}>Dylan {fmtH(dH)} · Nick {fmtH(nH)}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"44px 1fr 1fr",gap:3,marginBottom:2,marginTop:4}}>
            <div/><div style={{fontSize:9,fontWeight:700,color:DT.textFaint,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:DT.sans}}>Dylan</div>
            <div style={{fontSize:9,fontWeight:700,color:DT.textFaint,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:DT.sans}}>Nick</div>
          </div>
          {DAYS.map((day,di)=>{const dyT=(days as any)[day]?.dylan||[],nkT=(days as any)[day]?.nick||[];
            return(<div key={day} style={{display:"grid",gridTemplateColumns:"44px 1fr 1fr",gap:3,marginBottom:2}}>
              <div style={{paddingTop:4}}><div style={{fontSize:11,fontWeight:600,color:DT.textMuted,fontFamily:DT.sans}}>{DS[di]}</div><div style={{fontSize:10,color:DT.textFaint,fontFamily:DT.sans}}>{dates[di]}</div></div>
              {["dylan","nick"].map(p=>{const tasks=p==="dylan"?dyT:nkT;const ph=tasks.reduce((a: number,t: any)=>a+(t.type==="task"&&!t.done?t.h:0),0);
                return(<div key={p} onClick={()=>{if(selected&&tasks.length===0)tapSlot(wk,day,p);}} style={{background:selected&&tasks.length===0?"rgba(200,169,110,0.08)":DT.cardBg,borderRadius:6,border:`1px solid ${DT.border}`,padding:2,display:"flex",flexDirection:"column",gap:1,cursor:selected?"pointer":"default",minHeight:24}}>
                  {tasks.map((t: any,ti: number)=>{const c=jc(t.customer),sel=isSel(wk,day,p,ti),dim=highlightJob&&t.customer!==highlightJob;
                    if(t.type==="cure")return(<div key={t.id} style={{background:`repeating-linear-gradient(135deg,${c.bg},${c.bg} 4px,transparent 4px,transparent 8px)`,borderLeft:`3px solid ${c.border}`,borderRadius:4,padding:"3px 6px",opacity:dim?0.2:0.6}}><div style={{fontSize:9,fontWeight:600,color:c.text,fontFamily:DT.sans}}>{"\uD83D\uDD50"} {t.task}</div></div>);
                    return(<div key={t.id} onClick={e=>{e.stopPropagation();tapTask(wk,day,p,ti);}} style={{background:sel?DT.headerBg:t.done?"#f9f9f9":c.bg,borderLeft:`3px solid ${sel?DT.gold:t.done?"#ccc":c.border}`,borderRadius:4,padding:"3px 6px",cursor:"pointer",transition:"all 0.15s",opacity:t.done?0.4:dim?0.2:1,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:4}}>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,color:sel?"#fff":t.done?"#999":c.text,fontFamily:DT.sans,lineHeight:1.2,textDecoration:t.done?"line-through":"none"}}><span style={{fontWeight:600}}>{t.task}</span>{" "}<span style={{fontWeight:400,opacity:0.6}}>{fmtH(t.h)}</span></div><div style={{fontSize:9,color:sel?DT.gold:t.done?"#bbb":c.text,opacity:sel?1:0.5,fontWeight:400}}>{t.customer}</div></div>
                      <div onClick={e=>toggleDone(wk,day,p,ti,e)} style={{width:16,height:16,borderRadius:4,border:t.done?"none":`2px solid ${c.border}44`,background:t.done?"#2e7d32":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,marginTop:1}}>{t.done&&<span style={{color:"#fff",fontSize:10,lineHeight:1}}>✓</span>}</div>
                    </div>);
                  })}
                  {ph>0&&<div style={{textAlign:"center",fontSize:9,fontWeight:600,color:ph>=5?"#c62828":ph>=4?"#d97706":DT.textFaint,fontFamily:DT.sans,paddingTop:1,paddingBottom:1}}>{fmtH(ph)}</div>}
                </div>);
              })}
            </div>);
          })}
        </div>);
      })}
      <div style={{display:"flex",flexDirection:"column",gap:4,padding:"8px 0",borderTop:`1px solid ${DT.border}`}}>
        {[...allJobs].map(cust=>{const c=jc(cust),o=ORDERS.find(x=>x.customer===cust);return(<div key={cust} style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:10,fontFamily:DT.sans}}><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:3,background:c.border}}/><strong style={{color:DT.textSecondary}}>{cust}</strong></div>{o&&o.shipDate&&<span style={{color:DT.textFaint}}>Ships {fmtDate(o.shipDate)}</span>}</div>);})}
      </div>
      <div style={{marginTop:8,padding:"8px 10px",background:DT.cardBg,borderRadius:6,border:`1px solid ${DT.border}`,fontSize:9,color:DT.textFaint,fontFamily:DT.sans,lineHeight:1.7}}><strong style={{color:DT.textMuted}}>Flow:</strong> POs → Pull timber → <em>2wk wait</em> → Receipt → Stress cuts → Sand → 1st coat → 2nd coat → <em>1wk cure</em> → QC → Assemble/Box → Freight</div>
      <div style={{marginTop:4,padding:"6px 10px",background:DT.goldSoft,borderRadius:6,border:"1px solid rgba(200,169,110,0.12)",fontSize:10,color:"#8a6d3b",fontFamily:DT.sans}}>Tap task → tap cell to move · Tap ✓ to complete</div>
    </div>
  );
}


// ━━━ MAIN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function ProductionPage(){
  const [subView,setSubView]=useState("orders");
  const [highlightJob,setHighlightJob]=useState<string|null>(null);
  const [showComplete,setShowComplete]=useState(false);
  const viewOnPlanner=(c: string)=>{setHighlightJob(c);setSubView("planner");};

  const active=ORDERS.filter(o=>!isComplete(o));
  const inProd=active.filter(o=>o.status==="In Production").sort(sortByShipDate);
  const notStarted=active.filter(o=>o.status==="Not Started").sort(sortByShipDate);
  const complete=ORDERS.filter(o=>isComplete(o)).sort(sortByShipDate);

  return(
    <div style={{minHeight:"100vh",background:DT.pageBg,fontFamily:DT.sans}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet"/>
      <header style={{position:"sticky",top:0,zIndex:100}}>
        <div style={{background:DT.headerBg,padding:"0 24px",height:56,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:18,fontWeight:700,color:"#fff",fontFamily:DT.serif,lineHeight:1.2}}>Command Centre</div><div style={{fontSize:11,color:DT.gold,fontFamily:DT.sans,marginTop:1}}>{active.length} active orders</div></div>
          <nav style={{display:"flex",gap:2}}>{[{id:"mission",label:"Mission Control",href:"/"},{id:"production",label:"Production",href:"/production"}].map(n=>(<Link key={n.id} href={n.href} style={{padding:"6px 16px",borderRadius:6,background:n.id==="production"?DT.gold:"transparent",color:n.id==="production"?DT.headerBg:"#6b635a",fontWeight:n.id==="production"?700:500,fontSize:12,textDecoration:"none",fontFamily:DT.sans,letterSpacing:"0.02em"}}>{n.label}</Link>))}</nav>
        </div>
        <div style={{height:1,background:`linear-gradient(90deg, transparent 0%, ${DT.gold} 30%, ${DT.gold} 70%, transparent 100%)`,opacity:0.35}}/>
      </header>
      <main style={{maxWidth:1200,margin:"0 auto",padding:"20px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:20}}>
          {[{id:"orders",label:"Orders",icon:"☰"},{id:"planner",label:"Weekly Planner",icon:"▦"}].map(t=>(
            <button key={t.id} onClick={()=>{setSubView(t.id);if(t.id==="orders")setHighlightJob(null);}}
              style={{padding:"8px 18px",borderRadius:DT.radiusSm,border:subView===t.id?"none":`1px solid ${DT.border}`,background:subView===t.id?DT.headerBg:DT.cardBg,color:subView===t.id?"#fff":DT.textMuted,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:DT.sans,boxShadow:subView===t.id?"none":DT.shadow,transition:"all 0.15s",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:14}}>{t.icon}</span>{t.label}
            </button>
          ))}
          <div style={{flex:1}}/><span style={{fontSize:11,color:DT.textFaint,fontFamily:DT.sans}}>{subView==="orders"?"Where is each job?":"What's happening each day?"}</span>
        </div>
        {subView==="orders"&&(<>
          <KpiStrip orders={ORDERS}/>
          {inProd.length>0&&(<><SectionHeader icon="◉" label="In Production"/><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))",gap:10}}>{inProd.map(o=><OrderCard key={o.id} order={o} onViewPlanner={viewOnPlanner}/>)}</div></>)}
          {notStarted.length>0&&(<><SectionHeader icon="○" label="Not Started"/><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))",gap:10}}>{notStarted.map(o=><OrderCard key={o.id} order={o} onViewPlanner={viewOnPlanner}/>)}</div></>)}
          {complete.length>0&&(<div style={{marginTop:24}}>
            <button onClick={()=>setShowComplete(!showComplete)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",padding:0,width:"100%"}}>
              <span style={{fontSize:12,opacity:0.5}}>✓</span><span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:DT.textFaint,fontFamily:DT.sans}}>{complete.length} completed</span><div style={{flex:1,height:1,background:"rgba(0,0,0,0.04)"}}/><span style={{fontSize:11,color:DT.textFaint,fontFamily:DT.sans,fontWeight:500}}>{showComplete?"Hide":"Show"}</span><span style={{fontSize:12,color:DT.textFaint,transition:"transform 0.2s",transform:showComplete?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
            </button>
            {showComplete&&<div style={{marginTop:10,display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))",gap:10}}>{complete.map(o=><OrderCard key={o.id} order={o}/>)}</div>}
          </div>)}
        </>)}
        {subView==="planner"&&<WeeklyPlanner highlightJob={highlightJob} onClear={()=>setHighlightJob(null)}/>}
      </main>
      <footer style={{textAlign:"center",padding:"20px",fontSize:10,color:"#ccc",fontFamily:DT.sans}}>Innate Command Centre · Monday.com data</footer>
    </div>
  );
}
