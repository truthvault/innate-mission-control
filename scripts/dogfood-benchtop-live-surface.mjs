import { chromium } from 'playwright';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const URL = 'https://innatefurniture.co.nz/pages/timber-panels?dogfood=live-surface-20260624';
const OUT = '/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-24/dogfood-live-timber-panels-surface';

async function ensureOut() {
  await fs.mkdir(path.join(OUT, 'screenshots'), { recursive: true });
}

function summarizeConsole(messages) {
  return messages.map(m => ({ type: m.type, text: m.text.slice(0, 240) }));
}

async function collectState(page, label) {
  return await page.evaluate((label) => {
    const q = (sel) => document.querySelector(sel);
    const qa = (sel) => [...document.querySelectorAll(sel)];
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    };
    const text = (sel) => (q(sel)?.innerText || q(sel)?.textContent || '').replace(/\s+/g, ' ').trim();
    const inputs = qa('.panel-row input, .panel-row__field input, .panel-editor input').map((el, i) => ({ i, cls: el.className?.toString?.() || '', value: el.value, label: el.closest('label')?.innerText?.replace(/\s+/g, ' ').trim() || '' }));
    const panelRows = qa('.panel-row').map((el, i) => ({ i, cls: el.className?.toString?.() || '', text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 260), box: box(el) }));
    const svg = q('.slab-preview svg');
    const rects = qa('.slab-preview svg rect, .slab-preview svg circle, .slab-preview svg g').map((el, i) => {
      const b = box(el); const cs = getComputedStyle(el);
      return { i, tag: el.tagName, cls: el.getAttribute('class') || '', b, cursor: cs.cursor, fill: el.getAttribute('fill'), stroke: el.getAttribute('stroke') };
    }).filter(x => x.b && x.b.w > 4 && x.b.h > 4 && x.b.x > -100 && x.b.x < innerWidth + 100 && x.b.y > -100 && x.b.y < innerHeight + 100);
    const slab = q('.slab-preview');
    const rotate = q('.innate-selected-rotate__button');
    const activeCard = q('.panel-row.innate-panel-card-is-active');
    const activePanel = q('.innate-panel-is-active');
    const stage = q('.stage__preview, .stage__visual');
    const rotateBox = box(rotate);
    const hit = (b) => {
      if (!b) return null;
      const el = document.elementFromPoint(b.cx, b.cy);
      return el ? { tag: el.tagName, cls: el.className?.toString?.() || '', text: (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80), cursor: getComputedStyle(el).cursor } : null;
    };
    const handleHits = rects.filter(x => /resize/.test(x.cursor)).slice(0, 12).map(x => ({ ...x, hit: hit(x.b) }));
    return {
      label,
      scrollY: Math.round(scrollY),
      viewport: { w: innerWidth, h: innerHeight },
      mount: !!q('#innate-benchtop-configurator'),
      title: document.title,
      bodySnippet: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 650),
      stageText: text('.stage'),
      stickyText: text('.stickybar'),
      panelRows,
      inputs,
      slabBox: box(slab),
      svgBox: box(svg),
      rotateBox,
      rotateHit: hit(rotateBox),
      activeCardText: activeCard?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 220) || '',
      activePanelBox: box(activePanel),
      activePanelClass: activePanel?.className?.toString?.() || '',
      activeCardClass: activeCard?.className?.toString?.() || '',
      rects,
      handleHits,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      oldWarningsPresent: document.body.innerText.includes('Add a benchtop 1200'),
      missionEndpointTextPresent: document.documentElement.innerHTML.includes('innate-mission-control.vercel.app'),
      oldEndpointPresent: document.documentElement.innerHTML.includes('innate-benchtop-quote.vercel.app'),
    };
  }, label);
}

async function clickRole(page, name, nth = 0) {
  const loc = page.getByRole('button', { name }).nth(nth);
  await loc.scrollIntoViewIfNeeded();
  await loc.click({ timeout: 10000 });
}

async function runViewport(browser, name, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 700 });
  const messages = [];
  page.on('console', msg => messages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => messages.push({ type: 'pageerror', text: err.message }));
  const responses = [];
  page.on('response', res => {
    const status = res.status();
    if (status >= 400) responses.push({ status, url: res.url().slice(0, 220) });
  });

  await page.goto(URL + `-${name}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#innate-benchtop-configurator', { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.locator('#innate-benchtop-configurator').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'screenshots', `${name}-initial.png`), fullPage: false });
  const initial = await collectState(page, `${name}-initial`);

  // Floating selected-panel rotate.
  const beforeRotate = await collectState(page, `${name}-before-floating-rotate`);
  const rotate = page.locator('.innate-selected-rotate__button').first();
  const rotateVisible = await rotate.isVisible().catch(() => false);
  if (rotateVisible) {
    await rotate.click({ timeout: 10000 });
    await page.waitForTimeout(500);
  }
  const afterFloatingRotate = await collectState(page, `${name}-after-floating-rotate`);

  // Row rotate back, then copy/add.
  await clickRole(page, /Rotate 90°/i).catch(() => {});
  await page.waitForTimeout(400);
  const afterRowRotate = await collectState(page, `${name}-after-row-rotate`);

  await clickRole(page, /Copy/i).catch(() => {});
  await page.waitForTimeout(700);
  const afterCopy = await collectState(page, `${name}-after-copy`);
  await page.screenshot({ path: path.join(OUT, 'screenshots', `${name}-after-copy.png`), fullPage: false });

  // Try dragging the active panel by its centre.
  const dragBefore = await collectState(page, `${name}-before-drag`);
  const panelBox = dragBefore.activePanelBox || dragBefore.svgBox;
  let dragOk = false;
  if (panelBox) {
    await page.mouse.move(panelBox.cx, panelBox.cy);
    await page.mouse.down();
    await page.mouse.move(panelBox.cx + 80, panelBox.cy + 45, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    dragOk = true;
  }
  const afterDrag = await collectState(page, `${name}-after-drag`);
  await page.screenshot({ path: path.join(OUT, 'screenshots', `${name}-after-drag.png`), fullPage: false });

  // Try resizing from a visible directional handle.
  const handle = afterDrag.handleHits.find(h => h.cursor.includes('resize'));
  let resizeOk = false;
  if (handle?.b) {
    await page.mouse.move(handle.b.cx, handle.b.cy);
    await page.mouse.down();
    await page.mouse.move(handle.b.cx + 60, handle.b.cy + 30, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    resizeOk = true;
  }
  const afterResize = await collectState(page, `${name}-after-resize`);
  await page.screenshot({ path: path.join(OUT, 'screenshots', `${name}-after-resize.png`), fullPage: false });

  await page.close();
  return { name, viewport, messages: summarizeConsole(messages), failedResponses: responses, rotateVisible, dragAttempted: dragOk, resizeAttempted: resizeOk, states: { initial, beforeRotate, afterFloatingRotate, afterRowRotate, afterCopy, dragBefore, afterDrag, afterResize } };
}

async function main() {
  await ensureOut();
  const browser = await chromium.launch({ headless: true });
  const desktop = await runViewport(browser, 'desktop-1440x1000', { width: 1440, height: 1000 });
  const tablet = await runViewport(browser, 'tablet-900x900', { width: 900, height: 900 });
  const mobile = await runViewport(browser, 'mobile-390x844', { width: 390, height: 844 });

  // Raw HTML + asset hash.
  const probe = await browser.newPage();
  await probe.goto(URL + '-asset', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await probe.waitForSelector('#innate-benchtop-configurator', { timeout: 30000 });
  const assetUrl = await probe.evaluate(() => [...document.scripts].map(s => s.src).find(s => s.includes('innate-benchtop-configurator.js')) || '');
  const assetText = assetUrl ? await (await probe.request.get(assetUrl)).text() : '';
  const assetHash = assetText ? crypto.createHash('sha256').update(assetText).digest('hex') : '';
  await probe.close();
  await browser.close();

  const report = { url: URL, checkedAt: new Date().toISOString(), assetUrl, assetHash, desktop, tablet, mobile };
  await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));

  const md = [];
  md.push('# Dogfood QA — live timber panels configurator surface');
  md.push('');
  md.push(`URL: ${URL}`);
  md.push(`Checked: ${report.checkedAt}`);
  md.push(`Asset: ${assetUrl}`);
  md.push(`Asset SHA256: ${assetHash}`);
  md.push('');
  for (const r of [desktop, tablet, mobile]) {
    const s = r.states;
    const init = s.initial;
    const copyCount = s.afterCopy.panelRows.length;
    const dragMoved = JSON.stringify(s.dragBefore.activePanelBox) !== JSON.stringify(s.afterDrag.activePanelBox);
    const resizeChanged = JSON.stringify(s.afterDrag.activePanelBox) !== JSON.stringify(s.afterResize.activePanelBox) || JSON.stringify(s.afterDrag.inputs) !== JSON.stringify(s.afterResize.inputs);
    md.push(`## ${r.name}`);
    md.push(`- mount: ${init.mount}`);
    md.push(`- rotate visible: ${r.rotateVisible}; rotate hit: ${JSON.stringify(init.rotateHit)}`);
    md.push(`- panel rows after copy: ${copyCount}`);
    md.push(`- drag attempted: ${r.dragAttempted}; active panel moved/changed: ${dragMoved}`);
    md.push(`- resize attempted: ${r.resizeAttempted}; panel/dimensions changed: ${resizeChanged}`);
    md.push(`- handle cursors: ${[...new Set(init.handleHits.map(h => h.cursor))].join(', ')}`);
    md.push(`- rotate/canvas active sync: active panel class=${init.activePanelClass || '(none)'}; active card class=${init.activeCardClass || '(none)'}`);
    md.push(`- horizontal overflow: ${init.horizontalOverflow}`);
    md.push(`- old warning present: ${init.oldWarningsPresent}; old endpoint present: ${init.oldEndpointPresent}; Mission Control endpoint present: ${init.missionEndpointTextPresent}`);
    md.push(`- console/page errors: ${r.messages.filter(m => ['error','pageerror'].includes(m.type)).length}; failed responses: ${r.failedResponses.length}`);
    md.push(`- screenshots: screenshots/${r.name}-initial.png, screenshots/${r.name}-after-copy.png, screenshots/${r.name}-after-drag.png, screenshots/${r.name}-after-resize.png`);
    md.push('');
  }
  await fs.writeFile(path.join(OUT, 'report.md'), md.join('\n'));
  console.log(JSON.stringify({ out: OUT, assetHash, assetUrl, summary: md.join('\n') }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
