#!/usr/bin/env node
// ============================================================================
// LOCK CANARY — rotated panel, all 4 corners, accurate drag-to-resize.
// This is the feature Guido fought for months. It MUST stay green forever.
//
// What it proves, from a fresh page, for a ROTATED (90deg) panel, each corner:
//   1. dragging the corner outward GROWS the panel (mm area increases)
//   2. the OPPOSITE corner stays anchored (no throw / jump)  -> release settle small
//   3. the timber image is not corrupted mid-drag (during-drag box stays sane)
//
// Runs against the LOCAL golden bundle by default (interception), or the live
// preview with PREVIEW_THEME=<id>, or production with LIVE=1.
//
// Usage:
//   node lock-rotated-corners.mjs                 # test the golden JS/CSS here
//   PREVIEW_THEME=141689290811 node lock-...mjs   # test the deployed preview
//   LIVE=1 node lock-rotated-corners.mjs          # test production
// Exit 0 = all green (feature intact). Exit 1 = REGRESSION (do not ship).
// ============================================================================
import { chromium } from 'playwright';
import path from 'path';
import url from 'url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const NODE_MODULES = '/Users/mack-mini/innate-mission-control/node_modules';
let BASE = 'https://innatefurniture.co.nz/pages/timber-panels';
if (process.env.PREVIEW_THEME) BASE += `?preview_theme_id=${process.env.PREVIEW_THEME}&pb=0&_ab=0&_fd=0&_sc=1`;

const results = [];
const rec = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  ' + detail); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1470, height: 950 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let pageErrors = 0;
page.on('pageerror', () => pageErrors++);

// Serve the golden local bundle unless testing a deployed target.
if (!process.env.PREVIEW_THEME && !process.env.LIVE) {
  await page.route('**/innate-benchtop-configurator.js*', r => r.fulfill({ path: path.join(HERE, 'innate-benchtop-configurator.js'), contentType: 'text/javascript' }));
  await page.route('**/page-benchtops-atelier.css*', r => r.fulfill({ path: path.join(HERE, 'page-benchtops-atelier.css'), contentType: 'text/css' }));
}

async function freshRotated() {
  let ok = false;
  for (let i = 0; i < 3 && !ok; i++) {
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('#innate-benchtop-configurator svg', { timeout: 45000 });
      ok = true;
    } catch { await page.waitForTimeout(4000); }
  }
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#innate-benchtop-configurator svg', { timeout: 45000 });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { const m = document.querySelector('#innate-benchtop-configurator'); window.scrollTo(0, m.getBoundingClientRect().top + window.scrollY - 10); });
  // settle smooth-scroll
  await page.waitForFunction(() => { const y = window.scrollY; if (window.__lY === y) window.__sc = (window.__sc || 0) + 1; else window.__sc = 0; window.__lY = y; return window.__sc >= 3; }, { polling: 100, timeout: 10000 }).catch(() => {});
  // rotate the single default piece
  await page.locator('.panel-row__rotate').first().click();
  await page.waitForTimeout(700);
}

const dims = () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('innate.benchtop.v4')); const p = s.panels[0]; return { L: p.length, W: p.width, rot: p.rotationDeg }; });
const hitBox = () => page.evaluate(() => { const h = document.querySelector('.panel-move__hit').getBoundingClientRect(); return { x: h.x, y: h.y, w: h.width, h: h.height }; });

async function grip(corner) {
  return page.evaluate((corner) => {
    const el = document.querySelector(`.panel-resize__corner--${corner} rect`);
    const hit = document.querySelector('.panel-move__hit');
    if (!el || !hit) return null;
    const r = el.getBoundingClientRect(), b = hit.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const bcx = b.x + b.width / 2, bcy = b.y + b.height / 2;
    const vx = cx - bcx, vy = cy - bcy, len = Math.hypot(vx, vy) || 1;
    // is this the top/left corner of the on-screen box? -> its anchor is the opposite side
    const grabbedLeft = Math.abs(cx - b.x) < Math.abs(cx - (b.x + b.width));
    const grabbedTop = Math.abs(cy - b.y) < Math.abs(cy - (b.y + b.height));
    return { cx, cy, ux: vx / len, uy: vy / len, grabbedLeft, grabbedTop };
  }, corner);
}

for (const corner of ['nw', 'ne', 'sw', 'se']) {
  await freshRotated();
  const d0 = await dims();
  if (d0.rot !== 90) { rec(`rotate applied before ${corner}`, false, `rot=${d0.rot}`); continue; }
  const g = await grip(corner);
  if (!g) { rec(`rotated corner ${corner} handle present`, false); continue; }
  const b0 = await hitBox();
  // drag the corner outward along the centre->corner diagonal, 60px, in small steps
  await page.mouse.move(g.cx, g.cy);
  await page.mouse.down();
  let duringSane = true;
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(g.cx + g.ux * 60 * i / 16, g.cy + g.uy * 60 * i / 16);
    await page.waitForTimeout(10);
    // during-drag: the piece box must remain a sane rectangle (no NaN, positive size, on-screen-ish)
    const db = await page.evaluate(() => { const h = document.querySelector('.panel-move__hit'); if (!h) return null; const b = h.getBoundingClientRect(); return { w: b.width, h: b.height, x: b.x, y: b.y }; });
    if (!db || !(db.w > 5 && db.h > 5) || db.x < -2000 || db.y < -2000 || db.x > 4000 || db.y > 4000) duringSane = false;
  }
  const b1 = await hitBox();
  await page.mouse.up();
  // let the camera's animated re-fit fully settle (rAF ease); sample until stable
  let prev = null, stableCount = 0;
  for (let i = 0; i < 30 && stableCount < 4; i++) {
    await page.waitForTimeout(60);
    const cur = await hitBox();
    if (prev && Math.abs(cur.x - prev.x) < 1 && Math.abs(cur.y - prev.y) < 1 && Math.abs(cur.w - prev.w) < 1) stableCount++; else stableCount = 0;
    prev = cur;
  }
  const b2 = prev; // fully-settled box
  const d1 = await dims();

  const grew = d1.L * d1.W > d0.L * d0.W;
  // THE core anti-throw protection: during the drag, the corner OPPOSITE the
  // grabbed one must stay put. The historical bug threw the piece 150-510px
  // WHILE dragging; this catches it. (Post-release the camera may re-fit — that
  // is the approved animated behaviour and is checked separately below.)
  const anchor0 = { x: g.grabbedLeft ? b0.x + b0.w : b0.x, y: g.grabbedTop ? b0.y + b0.h : b0.y };
  const anchor1 = { x: g.grabbedLeft ? b1.x + b1.w : b1.x, y: g.grabbedTop ? b1.y + b1.h : b1.y };
  const anchorDrift = Math.hypot(anchor1.x - anchor0.x, anchor1.y - anchor0.y);
  // final framing: after settle, the piece must be centred with breathing room
  // inside the stage frame (proves the camera framed it, not threw it away).
  const frame = await page.evaluate(() => { const f = document.querySelector('#innate-benchtop-configurator .stage__preview svg').getBoundingClientRect(); return { x: f.x, y: f.y, w: f.width, h: f.height }; });
  const cxOff = Math.abs((b2.x + b2.w / 2) - (frame.x + frame.w / 2));
  const cyOff = Math.abs((b2.y + b2.h / 2) - (frame.y + frame.h / 2));
  const centeredIn = cxOff < frame.w * 0.15 && cyOff < frame.h * 0.15;
  const insideFrame = b2.x >= frame.x - 4 && b2.y >= frame.y - 4 && b2.x + b2.w <= frame.x + frame.w + 4 && b2.y + b2.h <= frame.y + frame.h + 4;

  rec(`rotated ${corner}: grows`, grew, `${d0.L}x${d0.W} -> ${d1.L}x${d1.W}`);
  rec(`rotated ${corner}: opposite corner anchored during drag (<18px)`, anchorDrift < 18, `drift ${anchorDrift.toFixed(0)}px`);
  rec(`rotated ${corner}: timber sane throughout drag`, duringSane, '');
  rec(`rotated ${corner}: settles centred & framed (no throw off-screen)`, centeredIn && insideFrame, `centreOff ${cxOff.toFixed(0)},${cyOff.toFixed(0)} inside=${insideFrame}`);
}

rec('no page errors', pageErrors === 0, `${pageErrors} errors`);

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\n*** ROTATED-CORNER FEATURE REGRESSION — DO NOT SHIP ***');
  process.exit(1);
}
console.log('\nRotated-corner drag feature intact.');
process.exit(0);
