import { chromium } from 'playwright';
const URL = process.env.URL;
const viewport = { width: Number(process.env.W || 1440), height: Number(process.env.H || 1000) };
const mobile = process.env.MOBILE === '1';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const visible = `(el)=>{const r=el.getBoundingClientRect();const cs=getComputedStyle(el);return r.width>2&&r.height>2&&cs.display!=='none'&&cs.visibility!=='hidden'&&cs.opacity!=='0';}`;
async function state(page,label){
  return await page.evaluate((label)=>{
    const q=s=>document.querySelector(s); const qa=s=>[...document.querySelectorAll(s)];
    const vis=el=>{if(!el)return false; const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return r.width>2&&r.height>2&&cs.display!=='none'&&cs.visibility!=='hidden'&&cs.opacity!=='0'};
    const rect=el=>{if(!el)return null; const r=el.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),cx:+(r.left+r.width/2).toFixed(1),cy:+(r.top+r.height/2).toFixed(1)}};
    const num=s=>{const m=String(s||'').match(/piece\s*([1-9])/i); return m?+m[1]:null};
    const panels=qa('[data-panel-move="true"]').filter(vis).map((el,i)=>{const g=el.closest('g'); const txt=el.getAttribute('data-panel-label')||el.getAttribute('aria-label')||g?.getAttribute('aria-label')||''; const r=rect(el); return {i:i+1,n:num(txt)||i+1,id:el.getAttribute('data-panel-id'),label:txt,active:g?.classList.contains('innate-panel-is-active') || el.classList.contains('innate-panel-is-active'),rect:r,style:{cursor:getComputedStyle(el).cursor,pointerEvents:getComputedStyle(el).pointerEvents},attrs:{x:el.getAttribute('x'),y:el.getAttribute('y'),width:el.getAttribute('width'),height:el.getAttribute('height'),transform:g?.getAttribute('transform')||el.getAttribute('transform')},hits:r?document.elementsFromPoint(r.cx,r.cy).slice(0,8).map(h=>({tag:h.tagName,cls:String(h.getAttribute('class')||h.className||''),id:h.getAttribute('data-panel-id'),label:h.getAttribute('data-panel-label')||h.getAttribute('aria-label')||'',pe:getComputedStyle(h).pointerEvents,cursor:getComputedStyle(h).cursor})):[]}});
    const rows=qa('.panel-row').filter(vis).map((el,i)=>({i:i+1,n:num(el.textContent)||i+1,active:el.classList.contains('innate-panel-card-is-active'),text:el.textContent.replace(/\s+/g,' ').trim().slice(0,180),rect:rect(el)}));
    return {label,href:location.href,bodyHasProof:/geometry proof only|Rotate 90°/.test(document.body.innerText),panels,rows,activePanel:panels.find(p=>p.active),activeRow:rows.find(r=>r.active)};
  },label);
}
async function load(page){
  await page.addInitScript(()=>{localStorage.removeItem('innate.benchtop.v4');localStorage.removeItem('innate.benchtop.v3')});
  const sep=URL.includes('?')?'&':'?';
  await page.goto(URL+sep+'focusedDragQa='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});
  await page.locator('.innate-bench-widget, #innate-benchtop-configurator, .atelier-configurator-mount').first().waitFor({timeout:30000});
  await page.locator('.slab-preview, .stage__preview, .stage__visual').first().scrollIntoViewIfNeeded();
  await sleep(800);
}
async function addPieces(page,n=4){
  for(let i=1;i<n;i++){
    await page.evaluate(()=>{const vis=el=>{const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return r.width>2&&r.height>2&&cs.display!=='none'&&cs.visibility!=='hidden'}; const b=[...document.querySelectorAll('button')].find(b=>vis(b)&&/add another benchtop piece/i.test(b.textContent||'')); if(!b) throw new Error('no add'); b.click();});
    await sleep(350);
  }
}
async function selectByPanelClick(page,n){
 const s=await state(page,'before-click-panel'); const p=s.panels.find(p=>p.n===n); if(!p) throw new Error('no panel '+n); await page.mouse.click(p.rect.cx,p.rect.cy); await sleep(400); return {clicked:p,before:s,after:await state(page,'after-click-panel')};
}
async function selectRow(page,n){
 await page.evaluate(n=>{const vis=el=>{const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return r.width>2&&r.height>2&&cs.display!=='none'&&cs.visibility!=='hidden'}; const rows=[...document.querySelectorAll('.panel-row')].filter(vis); const row=rows[n-1]; if(!row) throw new Error('no row'); row.scrollIntoView({block:'center',inline:'center'}); row.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:row.getBoundingClientRect().left+24,clientY:row.getBoundingClientRect().top+24}));},n); await sleep(400);
}
async function dragActive(page,dx,dy){
 const before=await state(page,'before-drag'); const p=before.activePanel; if(!p) return {error:'no active panel', before}; await page.mouse.move(p.rect.cx,p.rect.cy); await page.mouse.down(); for(let i=1;i<=20;i++){await page.mouse.move(p.rect.cx+dx*i/20,p.rect.cy+dy*i/20); await sleep(15)} await page.mouse.up(); await sleep(600); const after=await state(page,'after-drag'); const moves=after.panels.map(ap=>{const bp=before.panels.find(x=>x.n===ap.n); return {n:ap.n,active:ap.active,dx:bp?+(ap.rect.cx-bp.rect.cx).toFixed(1):null,dy:bp?+(ap.rect.cy-bp.rect.cy).toFixed(1):null,before:bp?.rect,after:ap.rect}}); return {target:p,moves,before,after};
}
async function setDimsRotate(page){
 await page.evaluate(()=>{const rows=[...document.querySelectorAll('.panel-row')]; const row=rows[0]; const inputs=[...row.querySelectorAll('input')]; const set=(i,v)=>{inputs[i].value=v; inputs[i].dispatchEvent(new Event('input',{bubbles:true})); inputs[i].dispatchEvent(new Event('change',{bubbles:true}))}; set(1,'1630'); set(2,'470');});
 await sleep(500);
 await page.click('button[aria-label="Rotate selected panel 90 degrees"]'); await sleep(500);
}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport,isMobile:mobile});
const page=await context.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(['error','warning'].includes(m.type())) errors.push(m.type()+': '+m.text().slice(0,160));});
try{
 await load(page);
 const initial=await state(page,'initial');
 await addPieces(page,4);
 const added=await state(page,'after-add4');
 const click2=await selectByPanelClick(page,2);
 const drag2panel=await dragActive(page,80,50);
 await selectRow(page,3);
 const drag3row=await dragActive(page,-60,40);
 // reload and test user-like single rotated custom size
 await load(page); await setDimsRotate(page); const rotated=await state(page,'rotated-1630x470'); const dragRot=await dragActive(page,70,35);
 console.log(JSON.stringify({url:URL,viewport,mobile,errors,initial,added,click2:{clicked:click2.clicked,activeAfter:click2.after.activePanel,rows:click2.after.rows},drag2panel:{target:drag2panel.target,moves:drag2panel.moves},drag3row:{target:drag3row.target,moves:drag3row.moves},rotated,dragRot:{target:dragRot.target,moves:dragRot.moves}},null,2));
} catch(e){ console.error(e.stack||e.message); process.exitCode=1; }
await browser.close();
