import { chromium } from 'playwright';
const url='https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141408796731&_ab=0&_fd=0&_sc=1&probe='+Date.now();
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});
await page.locator('#innate-benchtop-configurator .innate-bench-widget').waitFor({timeout:30000});
await page.locator('#innate-benchtop-configurator').scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);
async function state(label){
 const s=await page.evaluate((label)=>{
  const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
  const rect=el=>{if(!el)return null; const r=el.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),left:+r.left.toFixed(1),top:+r.top.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1)}};
  const svg=q('.slab-preview svg');
  const move=q('[data-panel-move="true"]');
  const group=move?.closest('g');
  const image=group?.querySelector('image');
  const dots=qa('.panel-resize__dot').map(d=>({r:d.getAttribute('r'), cls:d.getAttribute('class'), fill:getComputedStyle(d).fill, box:rect(d)}));
  return {label, url:location.href, svgBox:rect(svg), viewBox:svg?.getAttribute('viewBox'), preview:rect(q('.slab-preview')), moveBox:rect(move), groupTransform:group?.getAttribute('transform'), imageAttrs:image?Object.fromEntries(['x','y','width','height','preserveAspectRatio'].map(k=>[k,image.getAttribute(k)])):null, moveAttrs:move?Object.fromEntries(['x','y','width','height'].map(k=>[k,move.getAttribute(k)])):null, dots:dots.slice(0,8), text:document.body.innerText.match(/\d+ × \d+ · (horizontal|vertical)/i)?.[0]||null};
 }, label);
 console.log(JSON.stringify(s,null,2));
 await page.screenshot({path:`reference/evidence/2026-06-26-preview-current-${label}.png`, fullPage:false});
}
await state('before');
await page.locator('button[aria-label="Rotate selected panel 90 degrees"]').first().click();
await page.waitForTimeout(500);
await state('after-rotate');
await browser.close();
