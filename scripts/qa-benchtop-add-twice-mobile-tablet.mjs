import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const OUT = path.join('/Users/mack-mini/innate-mission-control/reference/evidence', new Date().toISOString().slice(0,10), `benchtop-add-twice-${stamp}`);
const BASE = process.env.BENCHTOP_QA_URL || 'https://innatefurniture.co.nz/pages/timber-panels';
const vps = [
  {name:'mobile-390x844', width:390, height:844, isMobile:true},
  {name:'tablet-768x900', width:768, height:900, isMobile:false},
  {name:'tablet-wide-1024x900', width:1024, height:900, isMobile:false},
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(page, vp, label){ const p=path.join(OUT,'screenshots',`${vp.name}-${label}.png`); await page.screenshot({path:p, fullPage:false}); return p; }
async function countState(page,label){ return page.evaluate((label)=>{
  const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
  const txt=el=>(el?.innerText||el?.textContent||'').replace(/\s+/g,' ').trim();
  const box=el=>{ if(!el) return null; const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; };
  return {label, pieceCountText:(document.body.innerText.match(/\b\d+\s+PIECES?\b/i)||[''])[0], rows:qa('.panel-row').map((el,i)=>({i,text:txt(el),cls:el.className?.toString?.()||'',box:box(el)})), panels:qa('.slab-preview svg .innate-panel-is-active, .slab-preview svg g, .slab-preview svg rect').map((el,i)=>({i,cls:el.getAttribute('class')||'',box:box(el)})).filter(x=>x.box&&x.box.w>20&&x.box.h>20), overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth, addButtons:qa('button').filter(b=>/add another|add piece|add benchtop/i.test(txt(b)||b.getAttribute('aria-label')||'')).map((b,i)=>({i,text:txt(b)||b.getAttribute('aria-label'),box:box(b),visible:!!(b.offsetWidth||b.offsetHeight||b.getClientRects().length)})), rotateVisible:!!q('.innate-selected-rotate__button')};
}, label); }
async function clickAdd(page){
  const locs=[page.getByRole('button',{name:/add another benchtop piece|add another piece|add piece/i}), page.locator('button').filter({hasText:/add/i})];
  for (const loc of locs){ const n=await loc.count().catch(()=>0); for(let i=0;i<n;i++){ const el=loc.nth(i); if(await el.isVisible().catch(()=>false)){ await el.scrollIntoViewIfNeeded().catch(()=>{}); await el.click({timeout:10000}); return true; } } }
  return false;
}
async function run(vp,browser){
 const context=await browser.newContext({viewport:{width:vp.width,height:vp.height},isMobile:vp.isMobile,deviceScaleFactor:1});
 const page=await context.newPage(); const failures=[]; const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(['error'].includes(m.type()))errors.push(m.text())}); page.on('response',r=>{if(r.status()>=400&&!/google|clarity|facebook|doubleclick|shop.app/i.test(r.url()))failures.push({status:r.status(),url:r.url()})});
 const u=new URL(BASE); u.searchParams.set('qa',`add-twice-${stamp}-${vp.name}`); u.searchParams.set('_fd','0'); u.searchParams.set('_sc','1');
 await page.goto(u.toString(),{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForSelector('#innate-benchtop-configurator',{timeout:40000}); await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{}); await page.locator('#innate-benchtop-configurator').scrollIntoViewIfNeeded(); await sleep(700);
 const initial=await countState(page,'initial'); const initialShot=await shot(page,vp,'initial');
 const add1=await clickAdd(page); await sleep(900); const afterAdd1=await countState(page,'after-add-1'); const add1Shot=await shot(page,vp,'after-add-1');
 const add2=await clickAdd(page); await sleep(900); const afterAdd2=await countState(page,'after-add-2'); const add2Shot=await shot(page,vp,'after-add-2');
 await context.close(); return {viewport:vp, add1, add2, initial, afterAdd1, afterAdd2, shots:{initialShot,add1Shot,add2Shot}, failures, errors};
}
await fs.mkdir(path.join(OUT,'screenshots'),{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[]; try{ for(const vp of vps) results.push(await run(vp,browser)); } finally { await browser.close(); }
const evaluated=results.map(r=>({viewport:r.viewport.name, add1:r.add1, add2:r.add2, rowsInitial:r.initial.rows.length, rowsAfterAdd1:r.afterAdd1.rows.length, rowsAfterAdd2:r.afterAdd2.rows.length, pieceCountText:r.afterAdd2.pieceCountText, overflow:r.afterAdd2.overflow, pass:r.add1&&r.add2&&r.afterAdd2.rows.length>=3&&r.afterAdd2.overflow===0, errors:r.errors.length, failures:r.failures.length, screenshots:r.shots}));
await fs.writeFile(path.join(OUT,'results.json'),JSON.stringify({checkedAt:new Date().toISOString(),out:OUT,evaluated,results},null,2));
const md=['# Benchtop add-twice mobile/tablet proof','']; for(const e of evaluated){ md.push(`## ${e.viewport}`,`- pass: ${e.pass}`,`- add1/add2: ${e.add1}/${e.add2}`,`- rows initial/add1/add2: ${e.rowsInitial}/${e.rowsAfterAdd1}/${e.rowsAfterAdd2}`,`- piece count text: ${e.pieceCountText}`,`- overflow: ${e.overflow}`,`- screenshots: ${Object.values(e.screenshots).map(p=>path.relative(OUT,p)).join(', ')}`,''); }
await fs.writeFile(path.join(OUT,'report.md'),md.join('\n'));
console.log(JSON.stringify({out:OUT,evaluated},null,2));
