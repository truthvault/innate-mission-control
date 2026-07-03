import { chromium, expect } from 'playwright/test';
import fs from 'node:fs/promises';
const LIVE='https://innatefurniture.co.nz/pages/timber-panels?_ab=0&_fd=0&_sc=1';
const PREVIEW='https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141408796731&_ab=0&_fd=0&_sc=1';
const out='reference/evidence/2026-06-26-preview-parity-strict'; await fs.mkdir(out,{recursive:true});
async function collect(name,url,viewport={width:1440,height:1000}){
 const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport});
 const errors=[]; page.on('console',m=>{if(['error','warning'].includes(m.type())) errors.push(`${m.type()}: ${m.text()}`)}); page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
 await page.route('**/api/send-quote', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
 await page.addInitScript(()=>{localStorage.removeItem('innate.benchtop.v4');localStorage.removeItem('innate.benchtop.v3')});
 await page.goto(url+'&qa='+Date.now(),{waitUntil:'domcontentloaded', timeout:45000}); await page.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});
 await page.locator('.innate-bench-widget').waitFor({timeout:30000}); await page.locator('#innate-benchtop-configurator,.atelier-configurator-mount').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(1000);
 async function state(label){
  const data=await page.evaluate(()=>{
   const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
   const visible=el=>{const r=el.getBoundingClientRect(), cs=getComputedStyle(el);return r.width>2&&r.height>2&&cs.display!=='none'&&cs.visibility!=='hidden'};
   const rect=el=>{if(!el)return null; const r=el.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),left:+r.left.toFixed(1),top:+r.top.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1),cx:+(r.left+r.width/2).toFixed(1),cy:+(r.top+r.height/2).toFixed(1)}};
   const panels=qa('[data-panel-move="true"]').filter(visible).map((el,i)=>({i,id:el.getAttribute('data-panel-id'),label:el.getAttribute('data-panel-label'),box:rect(el),attrs:Object.fromEntries(['x','y','width','height'].map(k=>[k,el.getAttribute(k)])),active:!!el.closest('g')?.classList.contains('innate-panel-is-active')}));
   const rows=qa('.panel-row').map((row,i)=>({i:i+1,active:row.classList.contains('innate-panel-card-is-active'),orientation:((row.textContent||'').match(/horizontal|vertical/i)||[''])[0].toLowerCase(),text:(row.textContent||'').replace(/\s+/g,' ').trim(),inputs:[...row.querySelectorAll('input')].map(x=>x.value),box:rect(row)}));
   const dots=qa('.panel-resize__dot').filter(el=>el.getBoundingClientRect().width>0).map(el=>({r:+el.getAttribute('r'),cls:el.getAttribute('class'),box:rect(el)}));
   const labels=qa('.slab-preview svg text').filter(t=>t.getBoundingClientRect().width||t.getBoundingClientRect().height).map(t=>({txt:t.textContent,box:rect(t)}));
   return {url:location.href, overflowX:document.documentElement.scrollWidth>document.documentElement.clientWidth+2, proofText:(document.body.innerText||'').includes('geometry proof only'), viewBox:q('.slab-preview svg')?.getAttribute('viewBox'), preview:rect(q('.slab-preview')), panels, rows, dots, labels};
  });
  await page.screenshot({path:`${out}/${name}-${label}.png`, fullPage:false}); return data;
 }
 const states={initial:await state('initial')};
 for(let i=0;i<3;i++){await page.evaluate(()=>{const vis=b=>{const r=b.getBoundingClientRect(), cs=getComputedStyle(b);return r.width>2&&r.height>2&&cs.display!=='none'&&cs.visibility!=='hidden'}; const bs=[...document.querySelectorAll('button')]; const b=bs.find(b=>vis(b)&&b.classList.contains('panel-editor__add')&&/add another benchtop piece/i.test(b.textContent||''))||bs.find(b=>vis(b)&&/add another benchtop piece/i.test(b.textContent||'')); if(!b) throw Error('no add button'); b.click();}); await page.waitForTimeout(500);}
 states.add4=await state('add4');
 await page.locator('.panel-row').nth(1).click({position:{x:24,y:24}}); await page.waitForTimeout(300); states.selectRow2=await state('select-row2');
 await page.locator('button[aria-label="Rotate selected panel 90 degrees"]').first().click(); await page.waitForTimeout(700); states.rotateSurface=await state('rotate-surface');
 // rotate row 3 via row button too
 await page.locator('.panel-row').nth(2).click({position:{x:24,y:24}}); await page.waitForTimeout(200); await page.locator('.panel-row').nth(2).locator('button[aria-label*="Rotate"], .panel-row__rotate').first().click(); await page.waitForTimeout(700); states.rotateRow3=await state('rotate-row3');
 await browser.close(); return {name,url,errors,states};
}
function summarise(r){return {name:r.name, errors:r.errors.length, initialDots:r.states.initial.dots.slice(0,4), initialViewBox:r.states.initial.viewBox, finalViewBox:r.states.rotateRow3.viewBox, afterSurfaceRows:r.states.rotateSurface.rows.map(x=>({i:x.i,active:x.active,orientation:x.orientation})), afterRow3Rows:r.states.rotateRow3.rows.map(x=>({i:x.i,active:x.active,orientation:x.orientation})), overflow:Object.fromEntries(Object.entries(r.states).map(([k,s])=>[k,s.overflowX])), proof:Object.fromEntries(Object.entries(r.states).map(([k,s])=>[k,s.proofText]))}}
const live=await collect('live',LIVE); const preview=await collect('preview',PREVIEW);
const report={live,preview,summary:[summarise(live),summarise(preview)]};
// Invariants: only selected rotates; handles same as live; no viewBox divergence except dimension-label intended code does not need viewBox changes.
const ld=live.states.initial.dots[0].box.w, pd=preview.states.initial.dots[0].box.w;
const problems=[];
if(Math.abs(ld-pd)>1.5) problems.push(`handle visible size differs live=${ld} preview=${pd}`);
if(live.states.initial.viewBox!==preview.states.initial.viewBox) problems.push(`initial viewBox differs live=${live.states.initial.viewBox} preview=${preview.states.initial.viewBox}`);
const surface=preview.states.rotateSurface.rows.map(r=>r.orientation).join(',');
if(surface!=='horizontal,vertical,horizontal,horizontal') problems.push(`surface rotate orientations wrong: ${surface}`);
const row3=preview.states.rotateRow3.rows.map(r=>r.orientation).join(',');
if(row3!=='horizontal,vertical,vertical,horizontal') problems.push(`row rotate orientations wrong: ${row3}`);
for(const [k,s] of Object.entries(preview.states)){ if(s.overflowX) problems.push(`overflow ${k}`); if(s.proofText) problems.push(`proof text ${k}`); }
await fs.writeFile(`${out}/strict-parity-report.json`, JSON.stringify({...report, problems},null,2));
console.log(JSON.stringify({summary:report.summary, problems},null,2));
if(problems.length) process.exit(2);
