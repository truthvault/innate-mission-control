import { chromium } from 'playwright';
const LIVE='https://innatefurniture.co.nz/pages/timber-panels?_ab=0&_fd=0&_sc=1';
const PREVIEW='https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141408796731&_ab=0&_fd=0&_sc=1';
const out='reference/evidence/2026-06-26-preview-parity-retest';
import fs from 'node:fs/promises'; await fs.mkdir(out,{recursive:true});
async function run(name,url){
 const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/api/send-quote', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
 await page.addInitScript(()=>{localStorage.removeItem('innate.benchtop.v4');localStorage.removeItem('innate.benchtop.v3')});
 await page.goto(url+'&qa='+Date.now(),{waitUntil:'domcontentloaded', timeout:45000}); await page.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});
 await page.locator('.innate-bench-widget').waitFor({timeout:30000}); await page.locator('#innate-benchtop-configurator,.atelier-configurator-mount').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(1000);
 async function snap(label){
  const data=await page.evaluate(()=>{
   const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
   const rect=el=>{if(!el)return null; const r=el.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),left:+r.left.toFixed(1),top:+r.top.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1)}};
   const panels=qa('[data-panel-move="true"]').filter(el=>{const r=el.getBoundingClientRect(); return r.width>2&&r.height>2}).map((el,i)=>({i,id:el.getAttribute('data-panel-id'),label:el.getAttribute('data-panel-label'),box:rect(el),attrs:Object.fromEntries(['x','y','width','height'].map(k=>[k,el.getAttribute(k)])),active:!!el.closest('g')?.classList.contains('innate-panel-is-active')}));
   const rows=qa('.panel-row').map((row,i)=>({i:i+1,active:row.classList.contains('innate-panel-card-is-active'),text:(row.textContent||'').replace(/\s+/g,' ').trim(),inputs:[...row.querySelectorAll('input')].map(x=>x.value)}));
   const dots=qa('.panel-resize__dot').filter(el=>{const r=el.getBoundingClientRect(); return r.width>0&&r.height>0}).map(el=>({r:el.getAttribute('r'),cls:el.getAttribute('class'),box:rect(el)}));
   const texts=qa('.slab-preview svg text').filter(t=>{const r=t.getBoundingClientRect(); return r.width||r.height}).map(t=>({txt:t.textContent,box:rect(t)}));
   return {url:location.href, viewBox:q('.slab-preview svg')?.getAttribute('viewBox'), panels, rows, dots, texts, rotateCount:qa('button[aria-label="Rotate selected panel 90 degrees"]').filter(b=>{const r=b.getBoundingClientRect();return r.width&&r.height}).length, body:(document.body.innerText||'').replace(/\s+/g,' ').trim().slice(0,1000)};
  });
  await page.screenshot({path:`${out}/${name}-${label}.png`, fullPage:false});
  return data;
 }
 const states=[]; states.push(['initial', await snap('initial')]);
 // Add three more pieces through visible add button.
 for(let i=0;i<3;i++){
  await page.evaluate(()=>{const vis=b=>{const r=b.getBoundingClientRect(), cs=getComputedStyle(b);return r.width>2&&r.height>2&&cs.display!=='none'&&cs.visibility!=='hidden'}; const buttons=[...document.querySelectorAll('button')]; const b=buttons.find(b=>vis(b)&&b.classList.contains('panel-editor__add')&&/add another benchtop piece/i.test(b.textContent||''))||buttons.find(b=>vis(b)&&/add another benchtop piece/i.test(b.textContent||'')); if(!b) throw new Error('no add button'); b.click();});
  await page.waitForTimeout(500);
 }
 states.push(['after-add4', await snap('after-add4')]);
 // Select row 2 then rotate via selected rotate button.
 await page.locator('.panel-row').nth(1).click({position:{x:24,y:24}}); await page.waitForTimeout(300);
 states.push(['after-select-row2', await snap('after-select-row2')]);
 await page.locator('button[aria-label="Rotate selected panel 90 degrees"]').first().click(); await page.waitForTimeout(700);
 states.push(['after-rotate-selected', await snap('after-rotate-selected')]);
 await browser.close(); return {name,url,states};
}
const results=[]; for (const [name,url] of [['live',LIVE],['preview',PREVIEW]]) results.push(await run(name,url));
await fs.writeFile(`${out}/live-vs-preview-selected-rotate.json`, JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({name:r.name, final:r.states.at(-1)[1].rows.map(row=>({i:row.i,active:row.active,text:row.text.match(/(horizontal|vertical)/i)?.[0]||'',inputs:row.inputs})), dots:r.states[0][1].dots.slice(0,4), viewBoxInitial:r.states[0][1].viewBox, viewBoxFinal:r.states.at(-1)[1].viewBox, panelsFinal:r.states.at(-1)[1].panels.map(p=>({i:p.i,id:p.id,active:p.active,box:p.box}))})),null,2));
