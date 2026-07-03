import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const BASE_URL = process.env.BENCHTOP_QA_URL || 'https://innatefurniture.co.nz/pages/timber-panels';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const date = new Date().toISOString().slice(0, 10);
const OUT = process.env.BENCHTOP_QA_OUT || path.join('/Users/mack-mini/innate-mission-control/reference/evidence', date, `benchtop-mobile-tablet-excellence-${stamp}`);
const viewports = [
  { name: 'mobile-390x844', width: 390, height: 844, isMobile: true },
  { name: 'mobile-large-430x932', width: 430, height: 932, isMobile: true },
  { name: 'tablet-768x900', width: 768, height: 900, isMobile: false },
  { name: 'tablet-wide-1024x900', width: 1024, height: 900, isMobile: false },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function bustUrl(name) {
  const u = new URL(BASE_URL);
  u.searchParams.set('qa', `mobile-tablet-excellence-${stamp}-${name}`);
  u.searchParams.set('_fd', '0');
  u.searchParams.set('_sc', '1');
  return u.toString();
}

async function ensure() {
  await fs.mkdir(path.join(OUT, 'screenshots'), { recursive: true });
}

async function shot(page, viewport, label, fullPage = false) {
  const p = path.join(OUT, 'screenshots', `${viewport.name}-${label}.png`);
  await page.screenshot({ path: p, fullPage });
  return p;
}

async function getState(page, label) {
  return page.evaluate((label) => {
    const q = (sel) => document.querySelector(sel);
    const qa = (sel) => [...document.querySelectorAll(sel)];
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    };
    const text = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const panelRows = qa('.panel-row').map((el, i) => ({ i, cls: el.className?.toString?.() || '', text: text(el), box: box(el) }));
    const activeRow = q('.panel-row.innate-panel-card-is-active');
    const activePanel = q('.slab-preview svg .innate-panel-is-active');
    const panelLike = qa('.slab-preview svg g, .slab-preview svg rect').map((el, i) => ({
      i, tag: el.tagName, cls: el.getAttribute('class') || '', box: box(el), cursor: getComputedStyle(el).cursor,
      text: text(el), aria: el.getAttribute('aria-label') || ''
    })).filter(x => x.box && x.box.w > 20 && x.box.h > 20 && x.box.x > -50 && x.box.x < innerWidth + 50 && x.box.y > -120 && x.box.y < innerHeight + 120);
    const rotate = q('.innate-selected-rotate__button');
    const addButtons = qa('button').filter(b => /add another|add piece|add benchtop/i.test(text(b) || b.getAttribute('aria-label') || '')).map((b, i) => ({ i, text: text(b) || b.getAttribute('aria-label') || '', box: box(b), visible: visible(b) }));
    const rotateButtons = qa('button').filter(b => /rotate/i.test(text(b) || b.getAttribute('aria-label') || '')).map((b, i) => ({ i, text: text(b) || b.getAttribute('aria-label') || '', box: box(b), visible: visible(b) }));
    const copyButtons = qa('button').filter(b => /copy|duplicate/i.test(text(b) || b.getAttribute('aria-label') || '')).map((b, i) => ({ i, text: text(b) || b.getAttribute('aria-label') || '', box: box(b), visible: visible(b) }));
    const stickyCandidates = qa('[class*="sticky"], .stickybar').map((el, i) => ({ i, cls: el.className?.toString?.() || '', text: text(el).slice(0, 180), box: box(el), visible: visible(el) })).filter(x => x.visible);
    const buttons = qa('button, a[href], input, select, textarea').map((el, i) => ({ i, tag: el.tagName, text: (text(el) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').slice(0, 80), box: box(el), visible: visible(el) })).filter(x => x.visible);
    const smallTargets = buttons.filter(b => b.box && (b.box.w < 44 || b.box.h < 38)).slice(0, 30);
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const overflowEls = qa('body *').map((el) => ({ el, b: el.getBoundingClientRect() })).filter(x => x.b.width > 1 && x.b.right > document.documentElement.clientWidth + 2).slice(0, 20).map(({el,b}) => ({ tag: el.tagName, cls: el.className?.toString?.().slice(0,120) || '', text: text(el).slice(0,120), right: Math.round(b.right), w: Math.round(b.width) }));
    const visibleImages = qa('img').filter(visible).map((img, i) => ({ i, src: img.currentSrc || img.src, alt: img.alt || '', box: box(img), complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })).slice(0, 80);
    return {
      label,
      url: location.href,
      title: document.title,
      viewport: { w: innerWidth, h: innerHeight },
      scrollY: Math.round(scrollY),
      mount: !!q('#innate-benchtop-configurator'),
      h1: text(q('h1')),
      configuratorBox: box(q('#innate-benchtop-configurator')),
      canvasBox: box(q('.slab-preview')) || box(q('.stage__preview')) || box(q('.stage__visual')),
      svgBox: box(q('.slab-preview svg')),
      activePanelBox: box(activePanel),
      activePanelClass: activePanel?.getAttribute('class') || '',
      activeRowText: text(activeRow),
      activeRowClass: activeRow?.className?.toString?.() || '',
      panelRows,
      panelLike,
      pieceCountText: (document.body.innerText.match(/\b\d+\s+PIECES?\b/i) || [''])[0],
      addButtons, rotateButtons, copyButtons,
      rotateFloatingBox: box(rotate),
      stickyCandidates,
      horizontalOverflow: overflow,
      overflowEls,
      smallTargets,
      visibleImages,
      oldLoginImageRefs: document.documentElement.innerHTML.includes('/login') || document.documentElement.innerHTML.includes('innate-mission-control.vercel.app/timbers/selection'),
      bodySnippet: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 1600),
    };
  }, label);
}

async function clickIfVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) {
      await item.scrollIntoViewIfNeeded().catch(() => {});
      await item.click({ timeout: 10000 });
      return true;
    }
  }
  return false;
}

async function runViewport(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleMessages = [];
  const failedResponses = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 260) }));
  page.on('pageerror', err => consoleMessages.push({ type: 'pageerror', text: err.message.slice(0, 260) }));
  page.on('response', res => { if (res.status() >= 400) failedResponses.push({ status: res.status(), url: res.url().slice(0, 260) }); });

  await page.goto(bustUrl(vp.name), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#innate-benchtop-configurator', { timeout: 40000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await sleep(1200);

  const fullPageShot = await shot(page, vp, 'full-page-before', true);
  await page.locator('#innate-benchtop-configurator').scrollIntoViewIfNeeded();
  await sleep(700);
  const initialShot = await shot(page, vp, 'configurator-initial', false);
  const initial = await getState(page, 'initial');

  // Add a second piece using Copy first, because that mirrors a common customer flow.
  let copied = await clickIfVisible(page.locator('button[aria-label^="Duplicate Benchtop piece"]'));
  if (!copied) copied = await clickIfVisible(page.locator('button', { hasText: /copy/i }));
  await sleep(900);
  const afterCopy = await getState(page, 'after-copy');
  const copyShot = await shot(page, vp, 'after-copy-second-piece', false);

  // Add a third piece using the explicit add-piece CTA.
  const added = await clickIfVisible(page.getByRole('button', { name: /add another benchtop piece|add another piece|add piece/i }));
  await sleep(900);
  const afterAdd = await getState(page, 'after-add-third-piece');
  const addShot = await shot(page, vp, 'after-add-third-piece', false);

  // Select last row/tab/card and rotate it, then check whether active state remains coherent.
  const rows = page.locator('.panel-row');
  const rowCount = await rows.count().catch(() => 0);
  let selectedLast = false;
  if (rowCount > 0) {
    await rows.nth(rowCount - 1).scrollIntoViewIfNeeded().catch(() => {});
    await rows.nth(rowCount - 1).click({ timeout: 10000 }).catch(() => {});
    selectedLast = true;
    await sleep(500);
  }
  const beforeRotateLast = await getState(page, 'before-rotate-last');
  let rotatedLast = false;
  const rotateButton = page.locator('.innate-selected-rotate__button').first();
  if (await rotateButton.isVisible().catch(() => false)) {
    await rotateButton.click({ timeout: 10000 }).catch(() => {});
    rotatedLast = true;
  } else {
    rotatedLast = await clickIfVisible(page.getByRole('button', { name: /rotate/i }));
  }
  await sleep(900);
  const afterRotateLast = await getState(page, 'after-rotate-last');
  const rotateShot = await shot(page, vp, 'after-rotate-last-piece', false);

  // Deep mobile/tablet page audit scroll shots for rhythm/crowding.
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const scrollShots = [];
  const maxStops = Math.min(8, Math.ceil(pageHeight / Math.max(1, vp.height * 0.82)));
  for (let i = 0; i < maxStops; i++) {
    await page.evaluate(([i, h]) => window.scrollTo(0, Math.round(i * h * 0.82)), [i, vp.height]);
    await sleep(250);
    scrollShots.push(await shot(page, vp, `scroll-${String(i + 1).padStart(2, '0')}`, false));
  }
  const finalState = await getState(page, 'final-page-audit');

  await context.close();

  const summarize = (state) => ({
    pieceCountText: state.pieceCountText,
    panelRows: state.panelRows.length,
    activeRowText: state.activeRowText.slice(0, 220),
    activePanelBox: state.activePanelBox,
    canvasBox: state.canvasBox,
    svgBox: state.svgBox,
    overflow: state.horizontalOverflow,
    addButtons: state.addButtons,
    rotateButtons: state.rotateButtons,
    copyButtons: state.copyButtons,
    stickyCandidates: state.stickyCandidates,
    smallTargets: state.smallTargets.slice(0, 10),
    overflowEls: state.overflowEls,
    oldLoginImageRefs: state.oldLoginImageRefs,
  });

  return {
    viewport: vp,
    url: bustUrl(vp.name),
    copied,
    added,
    selectedLast,
    rotatedLast,
    shots: { fullPageShot, initialShot, copyShot, addShot, rotateShot, scrollShots },
    states: { initial: summarize(initial), afterCopy: summarize(afterCopy), afterAdd: summarize(afterAdd), beforeRotateLast: summarize(beforeRotateLast), afterRotateLast: summarize(afterRotateLast), final: summarize(finalState) },
    consoleErrors: consoleMessages.filter(m => ['error', 'pageerror'].includes(m.type)),
    consoleMessages,
    failedResponses,
  };
}

function evaluateResult(r) {
  const s = r.states;
  const issues = [];
  const warnings = [];
  if (!s.initial) issues.push('No initial state captured');
  if (s.initial?.overflow > 0 || s.final?.overflow > 0) issues.push(`Horizontal overflow detected (${s.initial?.overflow}/${s.final?.overflow}px)`);
  if (!r.copied) issues.push('Could not activate Copy/Duplicate control');
  if (!r.added) issues.push('Could not activate Add another piece control');
  if ((s.afterCopy?.panelRows || 0) < 2) issues.push('Copy did not create a second visible panel row/card');
  if ((s.afterAdd?.panelRows || 0) < 3) issues.push('Add another did not create a third visible panel row/card');
  if (!r.rotatedLast) issues.push('Could not rotate selected/last piece');
  if (r.consoleErrors.length) warnings.push(`${r.consoleErrors.length} console/page errors`);
  const failedNonNoise = r.failedResponses.filter(x => !/clarity|googletagmanager|google-analytics|facebook|doubleclick|shopify.*analytics/i.test(x.url));
  if (failedNonNoise.length) warnings.push(`${failedNonNoise.length} failed non-analytics responses`);
  if (s.final?.oldLoginImageRefs) issues.push('Old /login or auth-gated timber image references still detected in rendered HTML');
  if ((s.final?.smallTargets || []).length > 8) warnings.push('Several small tap targets visible in viewport sample');
  return { pass: issues.length === 0, issues, warnings };
}

async function main() {
  await ensure();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let assetUrl = '';
  let assetHash = '';
  try {
    for (const vp of viewports) {
      results.push(await runViewport(browser, vp));
    }
    const p = await browser.newPage();
    await p.goto(bustUrl('asset-probe'), { waitUntil: 'domcontentloaded', timeout: 60000 });
    assetUrl = await p.evaluate(() => [...document.scripts].map(s => s.src).find(s => s.includes('innate-benchtop-configurator.js')) || '');
    if (assetUrl) {
      const txt = await (await p.request.get(assetUrl)).text();
      assetHash = crypto.createHash('sha256').update(txt).digest('hex');
    }
    await p.close();
  } finally {
    await browser.close();
  }

  const evaluated = results.map(r => ({ viewport: r.viewport.name, ...evaluateResult(r) }));
  const report = { checkedAt: new Date().toISOString(), baseUrl: BASE_URL, out: OUT, assetUrl, assetHash, evaluated, results };
  await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));

  const lines = [];
  lines.push('# Benchtop mobile/tablet extra-panel QA and deep mobile audit');
  lines.push('');
  lines.push(`Checked: ${report.checkedAt}`);
  lines.push(`URL: ${BASE_URL}`);
  lines.push(`Configurator asset: ${assetUrl}`);
  lines.push(`Asset SHA256: ${assetHash}`);
  lines.push('');
  lines.push('## Verdict by viewport');
  for (const e of evaluated) {
    lines.push(`### ${e.viewport}`);
    lines.push(`- Pass: ${e.pass}`);
    if (e.issues.length) lines.push(`- Issues: ${e.issues.join('; ')}`); else lines.push('- Issues: none blocking from scripted interaction checks');
    if (e.warnings.length) lines.push(`- Warnings: ${e.warnings.join('; ')}`); else lines.push('- Warnings: none material from scripted checks');
    const rr = results.find(r => r.viewport.name === e.viewport);
    lines.push(`- Pieces after copy/add: ${rr.states.afterCopy.panelRows} / ${rr.states.afterAdd.panelRows}`);
    lines.push(`- Actions: copied=${rr.copied}, added=${rr.added}, selectedLast=${rr.selectedLast}, rotatedLast=${rr.rotatedLast}`);
    lines.push(`- Horizontal overflow initial/final: ${rr.states.initial.overflow}/${rr.states.final.overflow}`);
    lines.push(`- Screenshots: ${Object.values(rr.shots).flat().map(p => path.relative(OUT, p)).join(', ')}`);
    lines.push('');
  }
  lines.push('## Design judgement notes to review from screenshots');
  lines.push('- Is the add-piece control unmistakable on mobile?');
  lines.push('- Is the selected-piece state obvious after 2 and 3 pieces?');
  lines.push('- Is the sticky quote/action area crowding the builder controls?');
  lines.push('- Do rotated/stacked pieces remain legible without making the canvas feel cramped?');
  lines.push('- Does the page still feel premium rather than like a technical form?');
  await fs.writeFile(path.join(OUT, 'report.md'), lines.join('\n'));
  console.log(JSON.stringify({ out: OUT, assetHash, evaluated, keyScreenshots: results.map(r => ({ viewport: r.viewport.name, shots: r.shots })) }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
