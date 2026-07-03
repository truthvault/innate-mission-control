import { chromium } from 'playwright';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const URL = 'https://innatefurniture.co.nz/pages/timber-panels?dogfood=focused-surface-20260624';
const OUT = '/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-24/dogfood-live-timber-panels-surface-focused';

const roundBox = b => b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), cx: Math.round(b.x + b.width/2), cy: Math.round(b.y + b.height/2) } : null;

async function state(page, label) {
  return await page.evaluate((label) => {
    const qa = sel => [...document.querySelectorAll(sel)];
    const q = sel => document.querySelector(sel);
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x+r.width/2), cy: Math.round(r.y+r.height/2) }; };
    const hit = b => { const el = b ? document.elementFromPoint(b.cx, b.cy) : null; return el ? { tag: el.tagName, cls: el.className?.toString?.() || '', text: (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g,' ').trim().slice(0,80), cursor: getComputedStyle(el).cursor } : null; };
    const rows = qa('.panel-row').map((el,i)=>({ i, cls: el.className?.toString?.() || '', text: el.innerText.replace(/\s+/g,' ').trim(), box: box(el) }));
    const panels = qa('.slab-preview svg .innate-panel-is-active, .slab-preview svg g, .slab-preview svg rect').map((el,i)=>({ i, tag: el.tagName, cls: el.getAttribute('class') || el.className?.toString?.() || '', box: box(el), cursor: getComputedStyle(el).cursor })).filter(x => x.box && x.box.w > 20 && x.box.h > 20 && x.box.x > -30 && x.box.x < innerWidth+30 && x.box.y > -30 && x.box.y < innerHeight+30);
    const handles = qa('.slab-preview svg rect, .slab-preview svg circle, .slab-preview svg g').map((el,i)=>({ i, tag: el.tagName, cls: el.getAttribute('class') || '', box: box(el), cursor: getComputedStyle(el).cursor })).filter(x => x.box && x.cursor.includes('resize') && x.box.x > -30 && x.box.x < innerWidth+30 && x.box.y > -30 && x.box.y < innerHeight+30);
    const rotate = q('.innate-selected-rotate__button');
    const rb = box(rotate);
    const inputs = qa('.panel-row input').map((el,i)=>({i, value: el.value, label: el.closest('label')?.innerText?.replace(/\s+/g,' ').trim() || ''}));
    return {
      label, scrollY: Math.round(scrollY), viewport:{w:innerWidth,h:innerHeight},
      mount: !!q('#innate-benchtop-configurator'),
      rotateVisible: !!rotate && rb && rb.w > 0 && rb.h > 0,
      rotateBox: rb, rotateHit: hit(rb),
      activePanelBox: box(q('.slab-preview svg .innate-panel-is-active')) || panels[0]?.box || null,
      activeCardText: q('.panel-row.innate-panel-card-is-active')?.innerText?.replace(/\s+/g,' ').trim() || '',
      activeCardClass: q('.panel-row.innate-panel-card-is-active')?.className?.toString?.() || '',
      rows, panels, handles, handleHits: handles.slice(0,12).map(h=>({ ...h, hit: hit(h.box) })), inputs,
      snapGuidesPresent: !!q('.snap-guides'),
      snapGuideBox: box(q('.snap-guides')),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      text: document.body.innerText.replace(/\s+/g,' ').trim().slice(0,1000),
      oldWarning: document.body.innerText.includes('Add a benchtop 1200'),
      oldEndpoint: document.documentElement.innerHTML.includes('innate-benchtop-quote.vercel.app'),
      missionEndpoint: document.documentElement.innerHTML.includes('innate-mission-control.vercel.app')
    };
  }, label);
}

async function setupPage(browser, name, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 700 });
  const consoleMessages = []; const failedResponses = [];
  page.on('console', msg => consoleMessages.push({type: msg.type(), text: msg.text()}));
  page.on('pageerror', err => consoleMessages.push({type:'pageerror', text: err.message}));
  page.on('response', res => { if (res.status() >= 400) failedResponses.push({status:res.status(), url:res.url()}); });
  await page.goto(`${URL}-${name}`, { waitUntil:'domcontentloaded', timeout:60000 });
  await page.waitForSelector('#innate-benchtop-configurator', { timeout:30000 });
  await page.waitForTimeout(3000);
  await page.locator('#innate-benchtop-configurator').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  return { page, consoleMessages, failedResponses };
}

async function testViewport(browser, name, viewport) {
  const { page, consoleMessages, failedResponses } = await setupPage(browser, name, viewport);
  const shots = {};
  const saveShot = async (key) => { const p = path.join(OUT, 'screenshots', `${name}-${key}.png`); await page.screenshot({path:p, fullPage:false}); shots[key]=p; };

  await saveShot('initial');
  const initial = await state(page, 'initial');

  // Rotate with floating selected-panel control.
  if (await page.locator('.innate-selected-rotate__button').isVisible().catch(()=>false)) {
    await page.locator('.innate-selected-rotate__button').click();
    await page.waitForTimeout(500);
  }
  const afterFloatingRotate = await state(page, 'afterFloatingRotate');

  // Rotate back using the card control if visible.
  const rowRotate = page.locator('button[aria-label^="Rotate Benchtop piece"]').first();
  if (await rowRotate.isVisible().catch(()=>false)) { await rowRotate.click(); await page.waitForTimeout(500); }
  const afterRowRotate = await state(page, 'afterRowRotate');

  // Copy and add another piece.
  const copy = page.locator('button[aria-label^="Duplicate Benchtop piece"]').first();
  let copyClicked = false;
  if (await copy.isVisible().catch(()=>false)) { await copy.click(); copyClicked = true; await page.waitForTimeout(800); }
  const afterCopy = await state(page, 'afterCopy');
  await saveShot('after-copy');
  const add = page.getByRole('button', { name: /Add another benchtop piece/i }).first();
  let addClicked = false;
  if (await add.isVisible().catch(()=>false)) { await add.click(); addClicked = true; await page.waitForTimeout(800); }
  const afterAdd = await state(page, 'afterAdd');
  await saveShot('after-add');

  // Select last card if available, then drag active panel near another panel. Evaluate snap guide during drag.
  const cards = page.locator('.panel-row');
  const count = await cards.count();
  if (count > 1) { await cards.nth(count-1).click(); await page.waitForTimeout(400); }
  const beforeDrag = await state(page, 'beforeDrag');
  let duringDrag = null;
  let dragAttempted = false;
  if (beforeDrag.activePanelBox) {
    const b = beforeDrag.activePanelBox;
    dragAttempted = true;
    await page.mouse.move(b.cx, b.cy);
    await page.mouse.down();
    await page.mouse.move(Math.max(120, b.cx - 130), b.cy, { steps: 10 });
    await page.waitForTimeout(250);
    duringDrag = await state(page, 'duringDrag');
    await page.mouse.up();
    await page.waitForTimeout(700);
  }
  const afterDrag = await state(page, 'afterDrag');
  await saveShot('after-drag');

  // Resize from first visible handle.
  const beforeResize = await state(page, 'beforeResize');
  const handle = beforeResize.handleHits.find(h => h.cursor.includes('resize'));
  let resizeAttempted = false;
  if (handle?.box) {
    resizeAttempted = true;
    await page.mouse.move(handle.box.cx, handle.box.cy);
    await page.mouse.down();
    await page.mouse.move(handle.box.cx + 60, handle.box.cy + 20, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(700);
  }
  const afterResize = await state(page, 'afterResize');
  await saveShot('after-resize');

  await page.close();
  return { name, viewport, shots, copyClicked, addClicked, dragAttempted, resizeAttempted, consoleMessages: consoleMessages.map(m=>({type:m.type, text:m.text.slice(0,240)})), failedResponses: failedResponses.map(r=>({status:r.status, url:r.url.slice(0,220)})), states:{initial, afterFloatingRotate, afterRowRotate, afterCopy, afterAdd, beforeDrag, duringDrag, afterDrag, beforeResize, afterResize} };
}

function verdict(r) {
  const s = r.states;
  return {
    mount: s.initial.mount,
    defaultTextOk: /1800.*600.*43|1800×600×43/.test(s.initial.text) && /Tōtara/.test(s.initial.text),
    rotateVisible: s.initial.rotateVisible,
    floatingRotateChanged: JSON.stringify(s.initial.activePanelBox) !== JSON.stringify(s.afterFloatingRotate.activePanelBox) || s.afterFloatingRotate.activeCardText.includes('VERTICAL'),
    rowRotateChangedBack: JSON.stringify(s.afterFloatingRotate.activePanelBox) !== JSON.stringify(s.afterRowRotate.activePanelBox) || s.afterRowRotate.activeCardText.includes('HORIZONTAL'),
    copyAddedRow: s.afterCopy.rows.length > s.afterRowRotate.rows.length,
    addAddedRow: s.afterAdd.rows.length > s.afterCopy.rows.length,
    dragMoved: JSON.stringify(s.beforeDrag.activePanelBox) !== JSON.stringify(s.afterDrag.activePanelBox),
    snapSeenDuringDrag: !!s.duringDrag?.snapGuidesPresent,
    resizeChanged: JSON.stringify(s.beforeResize.activePanelBox) !== JSON.stringify(s.afterResize.activePanelBox) || JSON.stringify(s.beforeResize.inputs) !== JSON.stringify(s.afterResize.inputs),
    handleCursors: [...new Set(s.initial.handleHits.map(h=>h.cursor))],
    rotateHitCursor: s.initial.rotateHit?.cursor,
    overflow: s.initial.horizontalOverflow,
    oldWarning: s.initial.oldWarning,
    oldEndpoint: s.initial.oldEndpoint,
    missionEndpoint: s.initial.missionEndpoint,
    consoleErrors: r.consoleMessages.filter(m => ['error','pageerror'].includes(m.type)).length,
    failedResponses: r.failedResponses.length
  };
}

async function main() {
  await fs.mkdir(path.join(OUT, 'screenshots'), {recursive:true});
  const browser = await chromium.launch({ headless:true });
  const desktop = await testViewport(browser, 'desktop-1440x1000', {width:1440,height:1000});
  const mobile = await testViewport(browser, 'mobile-390x844', {width:390,height:844});
  const tablet = await testViewport(browser, 'tablet-900x900', {width:900,height:900});
  const assetPage = await browser.newPage();
  await assetPage.goto(`${URL}-asset`, {waitUntil:'domcontentloaded', timeout:60000});
  const assetUrl = await assetPage.evaluate(() => [...document.scripts].map(s=>s.src).find(s=>s.includes('innate-benchtop-configurator.js')) || '');
  const assetText = assetUrl ? await (await assetPage.request.get(assetUrl)).text() : '';
  const assetHash = crypto.createHash('sha256').update(assetText).digest('hex');
  await assetPage.close(); await browser.close();

  const results = { url: URL, checkedAt: new Date().toISOString(), assetUrl, assetHash, desktop, mobile, tablet, verdicts: { desktop: verdict(desktop), mobile: verdict(mobile), tablet: verdict(tablet) } };
  await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const lines = ['# Focused dogfood QA — live timber-panels configurator surface', '', `URL: ${URL}`, `Checked: ${results.checkedAt}`, `Asset SHA256: ${assetHash}`, `Asset URL: ${assetUrl}`, ''];
  for (const [k,v] of Object.entries(results.verdicts)) {
    lines.push(`## ${k}`);
    for (const [kk,vv] of Object.entries(v)) lines.push(`- ${kk}: ${Array.isArray(vv) ? vv.join(', ') : vv}`);
    const rr = results[k];
    lines.push(`- screenshots: ${Object.values(rr.shots).map(p => path.relative(OUT, p)).join(', ')}`);
    lines.push('');
  }
  await fs.writeFile(path.join(OUT, 'report.md'), lines.join('\n'));
  console.log(JSON.stringify({out:OUT, assetHash, verdicts:results.verdicts}, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
