import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const THEME_ID = process.env.BENCHTOP_PREVIEW_THEME_ID || '141473218619';
const BASE_URL = process.env.BENCHTOP_QA_URL || `https://innate-furniture.myshopify.com/pages/timber-panels?preview_theme_id=${THEME_ID}&_ab=0&_fd=0&_sc=1`;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const OUT = path.join('/Users/mack-mini/innate-mission-control/reference/evidence', '20260627-benchtop-rotated-drag-matrix', stamp);
const SHOTS = path.join(OUT, 'screenshots');
await fs.mkdir(SHOTS, { recursive: true });

function encodeQuote(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const kitchenPlan = {
  panels: [
    {
      id: 'qa-back-run',
      label: 'Back wall run',
      length: 2400,
      width: 600,
      thickness: 43,
      quantity: 1,
      rotationDeg: 0,
      layout: { xMm: 0, yMm: 0, snappedTo: null },
      cutouts: [],
    },
    {
      id: 'qa-l-return',
      label: 'L return vertical run',
      length: 1800,
      width: 600,
      thickness: 43,
      quantity: 1,
      rotationDeg: 90,
      layout: { xMm: 0, yMm: 680, snappedTo: null },
      cutouts: [],
    },
    {
      id: 'qa-island-sink',
      label: 'Kitchen island with sink',
      length: 2200,
      width: 900,
      thickness: 43,
      quantity: 1,
      rotationDeg: 0,
      layout: { xMm: 1150, yMm: 1220, snappedTo: null },
      cutouts: [
        { id: 'qa-sink-cutout', pos: 0.5, cross: 0.52, widthMm: 560, depthMm: 460 },
      ],
    },
  ],
  species: 'totara',
  finish: 'oiled',
  colour: 'clear',
  shipping: { kind: 'pickup' },
  quoteNo: `QA-${stamp}`,
};
const HASH = encodeQuote(kitchenPlan);
const handles = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
const outward = {
  n: { dx: 0, dy: -90 },
  s: { dx: 0, dy: 90 },
  e: { dx: 90, dy: 0 },
  w: { dx: -90, dy: 0 },
  nw: { dx: -80, dy: -80 },
  ne: { dx: 80, dy: -80 },
  sw: { dx: -80, dy: 80 },
  se: { dx: 80, dy: 80 },
};

function stableWithin(a, b, px = 12) { return Math.abs(a - b) <= px; }
function movedAtLeast(after, before, amount = 25, dir = 1) { return dir > 0 ? after - before >= amount : before - after >= amount; }
function nearlyNoMove(after, before, px = 18) { return Math.abs(after - before) <= px; }

function evaluateDrag(handle, before, after) {
  const b = before.activePanel.box;
  const a = after.activePanel.box;
  const problems = [];
  const widthDelta = a.w - b.w;
  const heightDelta = a.h - b.h;
  const centerDx = a.cx - b.cx;
  const centerDy = a.cy - b.cy;

  // Visual anchored-edge expectations. These are intentionally customer-visible rules,
  // not implementation-specific length/width assumptions.
  if (handle.includes('n')) {
    if (!movedAtLeast(a.top, b.top, 20, -1)) problems.push('north/top dragged outward but visible top did not move up enough');
    if (!stableWithin(a.bottom, b.bottom)) problems.push('north/top drag moved the opposite bottom edge too much');
  }
  if (handle.includes('s')) {
    if (!movedAtLeast(a.bottom, b.bottom, 20, 1)) problems.push('south/bottom dragged outward but visible bottom did not move down enough');
    if (!stableWithin(a.top, b.top)) problems.push('south/bottom drag moved the opposite top edge too much');
  }
  if (handle.includes('e')) {
    if (!movedAtLeast(a.right, b.right, 20, 1)) problems.push('east/right dragged outward but visible right edge did not move right enough');
    if (!stableWithin(a.left, b.left)) problems.push('east/right drag moved the opposite left edge too much');
  }
  if (handle.includes('w')) {
    if (!movedAtLeast(a.left, b.left, 20, -1)) problems.push('west/left dragged outward but visible left edge did not move left enough');
    if (!stableWithin(a.right, b.right)) problems.push('west/left drag moved the opposite right edge too much');
  }

  // A resize can move the centre by roughly half the drag, but not leap across the canvas
  // or move hard on the unrelated axis for a single-edge drag.
  if (Math.abs(centerDx) > 90 || Math.abs(centerDy) > 90) problems.push(`panel centre jumped too far (${Math.round(centerDx)}, ${Math.round(centerDy)})`);
  if ((handle === 'n' || handle === 's') && !nearlyNoMove(a.cx, b.cx, 18)) problems.push('vertical edge drag shifted the panel sideways');
  if ((handle === 'e' || handle === 'w') && !nearlyNoMove(a.cy, b.cy, 18)) problems.push('horizontal edge drag shifted the panel up/down');
  if (handle.length === 1 && handle.match(/[ns]/) && heightDelta < 20) problems.push('vertical visual edge did not increase visible height');
  if (handle.length === 1 && handle.match(/[ew]/) && widthDelta < 20) problems.push('horizontal visual edge did not increase visible width');
  if (handle.length === 2 && (widthDelta < 20 || heightDelta < 20)) problems.push('corner drag did not increase both visible width and height');

  return { ok: problems.length === 0, problems, deltas: { widthDelta, heightDelta, centerDx, centerDy } };
}

async function captureState(page, label) {
  const state = await page.evaluate(() => {
    const qa = s => [...document.querySelectorAll(s)];
    const q = s => document.querySelector(s);
    const box = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };
    const panels = qa('#innate-benchtop-configurator .stage__preview > .slab-preview:not(.slab-preview--panel-card) .panel-resize')
      .map((el, i) => {
        const m = el.getCTM?.();
        return {
          i,
          active: el.classList.contains('innate-panel-is-active'),
          muted: el.classList.contains('innate-panel-is-muted'),
          cursorRotated: el.dataset.cursorRotated || '',
          transform: m ? { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f } : null,
          box: box(el),
          edgeCursors: Object.fromEntries(['n', 's', 'e', 'w'].map(h => [h, getComputedStyle(el.querySelector(`.panel-resize__edge--${h}`)).cursor])),
          cornerCursors: Object.fromEntries(['nw', 'ne', 'sw', 'se'].map(h => [h, getComputedStyle(el.querySelector(`.panel-resize__corner--${h}`)).cursor])),
        };
      });
    const activePanel = panels.find(p => p.active) || panels[0] || null;
    const rows = qa('.panel-row').map((row, i) => ({ i, active: row.classList.contains('innate-panel-card-is-active'), text: row.innerText.replace(/\s+/g, ' ').slice(0, 220), box: box(row) }));
    const tabs = qa('.mobile-piece-tab:not(.mobile-piece-tab--add)').map((tab, i) => ({ i, active: tab.classList.contains('is-active') || tab.getAttribute('aria-selected') === 'true', text: tab.innerText.replace(/\s+/g, ' ') }));
    const sink = q('.cutout');
    const bodyText = document.body.innerText;
    return {
      href: location.href,
      title: document.title,
      rows,
      tabs,
      panels,
      activePanel,
      activeRow: rows.find(r => r.active) || null,
      activeTab: tabs.find(t => t.active) || null,
      sinkCutoutBox: box(sink),
      rowCount: rows.length,
      panelCount: panels.length,
      hasSinkCutout: !!sink,
      hasGeometryProofText: bodyText.includes('geometry proof only'),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      quoteText: bodyText.match(/\$[0-9,]+/)?.[0] || '',
    };
  });
  return { label, ...state };
}

async function openPlan(page, handleName) {
  const url = `${BASE_URL}&qa=rotated-drag-${stamp}-${handleName}#q=${HASH}`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#innate-benchtop-configurator .stage__preview .panel-resize', { state: 'attached', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.locator('#innate-benchtop-configurator').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.locator('.panel-row').nth(1).scrollIntoViewIfNeeded();
  await page.locator('.panel-row').nth(1).click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(350);
  await page.locator('#innate-benchtop-configurator').scrollIntoViewIfNeeded();
  return { url, status: response?.status() || null, headers: response?.headers() || {} };
}

async function dragHandle(page, handle) {
  // Select by visual position, not by SVG class name. Once a panel is rotated,
  // .panel-resize__edge--n may be visually on the side, not at the top.
  const target = await page.evaluate((handle) => {
    const panel = document.querySelector('#innate-benchtop-configurator .stage__preview .panel-resize.innate-panel-is-active');
    if (!panel) return null;
    const panelBox = panel.getBoundingClientRect();
    const center = (el) => { const r = el.getBoundingClientRect(); return { el, cls: el.getAttribute('class') || '', box: { x: r.x, y: r.y, width: r.width, height: r.height }, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; };
    const edges = [...panel.querySelectorAll('.panel-resize__edge')].map(center);
    const corners = [...panel.querySelectorAll('.panel-resize__corner')].map(center);
    const suffix = (cls, prefix) => (cls.match(new RegExp(`${prefix}--([a-z]+)`)) || [])[1] || '';
    if (handle.length === 1) {
      let chosen;
      if (handle === 'n') chosen = edges.toSorted((a, b) => a.cy - b.cy)[0];
      if (handle === 's') chosen = edges.toSorted((a, b) => b.cy - a.cy)[0];
      if (handle === 'e') chosen = edges.toSorted((a, b) => b.cx - a.cx)[0];
      if (handle === 'w') chosen = edges.toSorted((a, b) => a.cx - b.cx)[0];
      if (!chosen) return null;
      return { kind: 'edge', requestedVisual: handle, actualSuffix: suffix(chosen.cls, 'panel-resize__edge'), box: chosen.box, panelBox: { x: panelBox.x, y: panelBox.y, width: panelBox.width, height: panelBox.height } };
    }
    const scored = corners.map(c => {
      const wantLeft = handle.includes('w'), wantTop = handle.includes('n');
      const sx = wantLeft ? c.cx : -c.cx;
      const sy = wantTop ? c.cy : -c.cy;
      return { ...c, score: sx + sy };
    }).toSorted((a, b) => a.score - b.score);
    const chosen = scored[0];
    if (!chosen) return null;
    return { kind: 'corner', requestedVisual: handle, actualSuffix: suffix(chosen.cls, 'panel-resize__corner'), box: chosen.box, panelBox: { x: panelBox.x, y: panelBox.y, width: panelBox.width, height: panelBox.height } };
  }, handle);
  if (!target) throw new Error(`No visual handle target for ${handle}`);
  const selector = target.kind === 'edge'
    ? `.panel-resize.innate-panel-is-active .panel-resize__edge--${target.actualSuffix}`
    : `.panel-resize.innate-panel-is-active .panel-resize__corner--${target.actualSuffix}`;
  const b = target.box;
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const d = outward[handle];
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + d.dx * 0.35, start.y + d.dy * 0.35, { steps: 4 });
  await page.mouse.move(start.x + d.dx * 0.7, start.y + d.dy * 0.7, { steps: 4 });
  await page.mouse.move(start.x + d.dx, start.y + d.dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  return { selector, target, start, end: { x: start.x + d.dx, y: start.y + d.dy }, delta: d };
}

async function runDesktopMatrix(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1 });
  const failures = [];
  const cases = [];
  for (const handle of handles) {
    const open = await openPlan(page, handle);
    const before = await captureState(page, `${handle}-before`);
    const beforeShot = path.join(SHOTS, `desktop-${handle}-before.png`);
    await page.screenshot({ path: beforeShot, fullPage: false });
    const drag = await dragHandle(page, handle);
    const after = await captureState(page, `${handle}-after`);
    const afterShot = path.join(SHOTS, `desktop-${handle}-after.png`);
    await page.screenshot({ path: afterShot, fullPage: false });
    const evalResult = evaluateDrag(handle, before, after);
    const caseResult = { handle, open, drag, before, after, beforeShot, afterShot, ...evalResult };
    cases.push(caseResult);
    if (!evalResult.ok) failures.push({ handle, problems: evalResult.problems, deltas: evalResult.deltas });
  }
  await page.close();
  return { cases, failures };
}

async function runKitchenJourney(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1 });
  const open = await openPlan(page, 'kitchen-journey');
  const initial = await captureState(page, 'kitchen-plan-loaded');
  const initialShot = path.join(SHOTS, 'desktop-kitchen-plan-loaded.png');
  await page.screenshot({ path: initialShot, fullPage: false });

  // Drag the vertical L return body slightly, then verify it stays selected and does not lose the island sink cutout.
  const bodyBox = await page.evaluate(() => {
    const activeResize = document.querySelector('#innate-benchtop-configurator .stage__preview .panel-resize.innate-panel-is-active');
    const el = activeResize?.parentElement?.querySelector('.panel-move__hit') || null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  let moveResult = null;
  if (bodyBox) {
    const start = { x: bodyBox.x + bodyBox.width / 2, y: bodyBox.y + bodyBox.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 70, start.y + 55, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    moveResult = { start, end: { x: start.x + 70, y: start.y + 55 } };
  }
  const afterMove = await captureState(page, 'after-moving-l-return');
  const moveShot = path.join(SHOTS, 'desktop-kitchen-plan-after-moving-l-return.png');
  await page.screenshot({ path: moveShot, fullPage: false });

  const problems = [];
  if (initial.rowCount !== 3) problems.push(`expected 3 panel rows, found ${initial.rowCount}`);
  if (initial.panelCount !== 3) problems.push(`expected 3 rendered panels, found ${initial.panelCount}`);
  if (!initial.hasSinkCutout) problems.push('island sink cutout was not visible');
  if (initial.hasGeometryProofText || afterMove.hasGeometryProofText) problems.push('rejected geometry proof text visible');
  if (initial.overflowX > 1 || afterMove.overflowX > 1) problems.push(`horizontal overflow detected (${initial.overflowX}, ${afterMove.overflowX})`);
  if (moveResult === null) problems.push('L return move hit area was not found');
  if (afterMove.activeRow?.i !== 1) problems.push(`moving the L return changed active row from 1 to ${afterMove.activeRow?.i ?? 'none'}`);
  if (!afterMove.hasSinkCutout) problems.push('sink cutout disappeared after moving the L return');
  await page.close();
  return { open, initial, afterMove, moveResult, screenshots: { initialShot, moveShot }, ok: problems.length === 0, problems };
}

async function runMobileSmoke(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const url = `${BASE_URL}&qa=rotated-drag-${stamp}-mobile#q=${HASH}`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#innate-benchtop-configurator .mobile-piece-tab', { timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.locator('#innate-benchtop-configurator').scrollIntoViewIfNeeded();
  await page.locator('.mobile-piece-tab').nth(1).tap().catch(() => {});
  await page.getByRole('button', { name: /^Size$/i }).tap().catch(() => {});
  await page.waitForTimeout(500);
  const state = await captureState(page, 'mobile-smoke');
  const shot = path.join(SHOTS, 'mobile-390-kitchen-plan-size-sheet.png');
  await page.screenshot({ path: shot, fullPage: false });
  const text = await page.locator('body').innerText();
  const problems = [];
  if (response?.status() !== 200) problems.push(`mobile status ${response?.status()}`);
  if (!text.includes('Rotate piece 90°')) problems.push('mobile size sheet rotate action missing');
  if (state.rowCount < 3 && state.tabs.length < 3) problems.push('mobile did not expose three pieces');
  if (state.overflowX > 1) problems.push(`mobile horizontal overflow ${state.overflowX}`);
  if (state.hasGeometryProofText) problems.push('mobile rejected geometry proof text visible');
  await page.close();
  return { url, status: response?.status() || null, state, shot, ok: problems.length === 0, problems };
}

const allErrors = [];
const failedResponses = [];
const browser = await chromium.launch({ headless: true });
browser.on('disconnected', () => {});
const context = await browser.newContext();
await context.close();

const pageForAsset = await browser.newPage({ viewport: { width: 1200, height: 800 } });
pageForAsset.on('pageerror', e => allErrors.push(e.message));
pageForAsset.on('response', r => { if (r.status() >= 400 && !/google|clarity|facebook|doubleclick|analytics|shop.app/i.test(r.url())) failedResponses.push({ status: r.status(), url: r.url() }); });
await pageForAsset.goto(`${BASE_URL}&qa=asset-${stamp}#q=${HASH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const assetUrl = await pageForAsset.evaluate(() => [...document.scripts].map(s => s.src).find(s => s.includes('innate-benchtop-configurator.js')) || '');
let assetHash = '';
let assetHasCursorPatch = false;
if (assetUrl) {
  const txt = await (await pageForAsset.request.get(assetUrl)).text();
  assetHash = crypto.createHash('sha256').update(txt).digest('hex');
  assetHasCursorPatch = txt.includes('cursorRotated');
}
await pageForAsset.close();

const desktop = await runDesktopMatrix(browser);
const kitchenJourney = await runKitchenJourney(browser);
const mobile = await runMobileSmoke(browser);
await browser.close();

const problems = [];
if (!assetHasCursorPatch) problems.push('loaded asset does not include cursor patch marker');
for (const f of desktop.failures) problems.push(`desktop handle ${f.handle}: ${f.problems.join('; ')}`);
for (const p of kitchenJourney.problems) problems.push(`kitchen journey: ${p}`);
for (const p of mobile.problems) problems.push(`mobile: ${p}`);
for (const e of allErrors) problems.push(`page error: ${e}`);

const report = {
  checkedAt: new Date().toISOString(),
  out: OUT,
  baseUrl: BASE_URL,
  themeId: THEME_ID,
  kitchenPlan,
  assetUrl,
  assetHash,
  assetHasCursorPatch,
  ok: problems.length === 0,
  problems,
  failedResponses,
  desktop,
  kitchenJourney,
  mobile,
};
await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(OUT, 'summary.md'), [
  `# Benchtop rotated drag matrix`,
  ``,
  `Theme: ${THEME_ID}`,
  `Asset: ${assetUrl}`,
  `Asset hash: ${assetHash}`,
  `OK: ${report.ok}`,
  ``,
  `## Problems`,
  ...(problems.length ? problems.map(p => `- ${p}`) : ['- None']),
  ``,
  `## Screenshots`,
  `- ${SHOTS}`,
].join('\n'));

console.log(JSON.stringify({
  out: OUT,
  ok: report.ok,
  problemCount: problems.length,
  problems,
  assetHash,
  desktopFailures: desktop.failures,
  kitchenJourneyOk: kitchenJourney.ok,
  mobileOk: mobile.ok,
}, null, 2));
