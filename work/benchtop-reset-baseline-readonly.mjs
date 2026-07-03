import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const OUT = `/Users/mack-mini/innate-mission-control/reference/evidence/${stamp}-benchtop-reset-baseline-rendered`;
const SHOTS = path.join(OUT, 'screenshots');
await fs.mkdir(SHOTS, { recursive: true });

const cases = [
  { kind: 'live', themeId: '141308166203', url: `https://innatefurniture.co.nz/pages/timber-panels?_ab=0&_fd=0&_sc=1&baseline=${stamp}` },
  { kind: 'preview', themeId: '141473218619', url: `https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141473218619&_ab=0&_fd=0&_sc=1&baseline=${stamp}` },
];
const viewports = [
  { name: 'desktop', width: 1440, height: 1000, mobile: false, touch: false },
  { name: 'mobile390', width: 390, height: 844, mobile: true, touch: true },
  { name: 'short375', width: 375, height: 667, mobile: true, touch: true },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

async function pageState(page) {
  return await page.evaluate(() => {
    const qa = s => [...document.querySelectorAll(s)];
    const q = s => document.querySelector(s);
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
    const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
    const imgs = qa('img').map(img => ({ src: img.currentSrc || img.src || '', alt: img.alt || '', complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, visible: visible(img), rect: rect(img) }));
    const visibleBrokenImages = imgs.filter(img => img.visible && (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0));
    const swatchImgs = imgs.filter(img => /benchtop|timber|totara|rimu|beech|ash|selection/i.test(`${img.src} ${img.alt}`));
    const app = q('#innate-benchtop-configurator, .innate-bench-widget, .atelier-configurator-mount');
    const stage = q('.stage__preview, .stage__visual, .slab-preview');
    const activePanel = q('.panel-resize.innate-panel-is-active, [data-panel-move="true"]');
    const activeRow = q('.panel-row.innate-panel-card-is-active');
    const tabs = qa('.mobile-piece-tab').filter(visible).map(t => ({ text: (t.textContent || '').replace(/\s+/g,' ').trim(), active: t.classList.contains('is-active') || t.getAttribute('aria-selected') === 'true', rect: rect(t) }));
    const buttons = qa('button').filter(visible).map(b => ({ text: (b.textContent || '').replace(/\s+/g,' ').trim().slice(0,80), aria: b.getAttribute('aria-label') || '', cls: b.className || '', rect: rect(b) })).slice(0,80);
    const body = document.body.innerText || '';
    const scrollContainers = qa('.atelier-configurator-mount, .innate-bench-widget, .stage, .stage__preview, .stage__visual, .slab-preview, .panel-editor, .material-card, .mobile-sheet')
      .filter(visible).map(el => { const cs = getComputedStyle(el); return { cls: String(el.className || ''), id: el.id || '', rect: rect(el), overflowX: cs.overflowX, overflowY: cs.overflowY, scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight, hasX: el.scrollWidth > el.clientWidth + 3, hasY: el.scrollHeight > el.clientHeight + 3 }; })
      .filter(x => x.hasX || x.hasY);
    return {
      href: location.href,
      title: document.title,
      appPresent: !!app,
      appRect: rect(app),
      stageRect: rect(stage),
      activePanelRect: rect(activePanel),
      activeRowText: activeRow ? (activeRow.textContent || '').replace(/\s+/g,' ').trim().slice(0,300) : '',
      rows: qa('.panel-row').length,
      panels: qa('.panel-resize, [data-panel-move="true"]').filter(visible).length,
      tabs,
      buttons,
      visibleBrokenImages,
      swatchImgs,
      allVisibleImgCount: imgs.filter(i => i.visible).length,
      documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollContainers,
      hasGeometryProofText: /geometry proof only/i.test(body),
      hasLiveDesignSurfaceText: /LIVE DESIGN SURFACE/i.test(body),
      hasRejectedOldEndpoint: /innate-benchtop-quote\.vercel\.app|geometry-renderer/i.test(document.documentElement.innerHTML),
      bodySnippet: body.replace(/\s+/g,' ').trim().slice(0, 1200),
    };
  });
}

async function clickByText(page, regexes) {
  for (const re of regexes) {
    const hit = await page.evaluate((source) => {
      const re = new RegExp(source, 'i');
      const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
      const el = [...document.querySelectorAll('button, [role="tab"], .mobile-piece-tab, .panel-row')].find(el => visible(el) && re.test(el.textContent || el.getAttribute('aria-label') || ''));
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: el.getBoundingClientRect().left + 12, clientY: el.getBoundingClientRect().top + 12 }));
      return { text: (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g,' ').trim().slice(0,120), tag: el.tagName, cls: el.className || '' };
    }, re.source);
    if (hit) { await sleep(600); return hit; }
  }
  return null;
}

async function inspectCase(browser, item, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.touch, deviceScaleFactor: vp.mobile ? 2 : 1 });
  const page = await context.newPage();
  const failedResponses = [];
  const consoleMessages = [];
  page.on('console', m => { if (['error','warning'].includes(m.type())) consoleMessages.push({ type: m.type(), text: m.text().slice(0,500) }); });
  page.on('pageerror', e => consoleMessages.push({ type: 'pageerror', text: e.message }));
  page.on('response', r => { if (r.status() >= 400 && !/google|clarity|facebook|doubleclick|analytics|shop\.app/i.test(r.url())) failedResponses.push({ status: r.status(), url: r.url() }); });
  await page.addInitScript(() => { localStorage.removeItem('innate.benchtop.v4'); localStorage.removeItem('innate.benchtop.v3'); });
  const response = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 18000 }).catch(() => {});
  await page.locator('#innate-benchtop-configurator, .innate-bench-widget, .atelier-configurator-mount').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.locator('#innate-benchtop-configurator, .atelier-configurator-mount').first().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(1000);
  const initialShot = path.join(SHOTS, `${item.kind}-${vp.name}-initial.png`);
  await page.screenshot({ path: initialShot, fullPage: false });
  const initial = await pageState(page);

  const assetUrl = await page.evaluate(() => [...document.scripts].map(s => s.src).find(s => /innate-benchtop-configurator\.js/i.test(s)) || '');
  let renderedAssetHash = '';
  let renderedAssetStatus = null;
  if (assetUrl) {
    const req = await page.request.get(assetUrl).catch(() => null);
    renderedAssetStatus = req?.status() || null;
    if (req && req.ok()) renderedAssetHash = sha(await req.text());
  }

  const interactions = {};
  interactions.sizeClick = await clickByText(page, [/^Size$/i, /Edit size/i, /Step\s*1/i]);
  await page.screenshot({ path: path.join(SHOTS, `${item.kind}-${vp.name}-size.png`), fullPage: false });
  interactions.sizeState = await pageState(page);
  interactions.rotateClick = await clickByText(page, [/Rotate selected panel 90 degrees/i, /Rotate piece 90/i, /^Rotate$/i]);
  await page.screenshot({ path: path.join(SHOTS, `${item.kind}-${vp.name}-rotate.png`), fullPage: false });
  interactions.rotateState = await pageState(page);
  interactions.timberClick = await clickByText(page, [/^Timber$/i, /Timber|finish|Step\s*2/i]);
  await page.screenshot({ path: path.join(SHOTS, `${item.kind}-${vp.name}-timber.png`), fullPage: false });
  interactions.timberState = await pageState(page);
  interactions.addClick = await clickByText(page, [/Add another benchtop piece/i, /Add another piece/i, /Add piece/i, /^\+$/i]);
  await page.screenshot({ path: path.join(SHOTS, `${item.kind}-${vp.name}-after-add.png`), fullPage: false });
  interactions.addState = await pageState(page);

  await context.close();
  return {
    kind: item.kind,
    expectedThemeId: item.themeId,
    viewport: vp,
    requestedUrl: item.url,
    finalUrl: initial.href,
    httpStatus: response?.status() || null,
    serverTiming: response?.headers()?.['server-timing'] || '',
    xRequestId: response?.headers()?.['x-request-id'] || '',
    assetUrl,
    renderedAssetStatus,
    renderedAssetHash,
    initialShot,
    initial,
    interactions,
    failedResponses,
    consoleMessages,
  };
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const vp of viewports) {
  for (const item of cases) {
    console.log(`Checking ${item.kind} ${vp.name}`);
    results.push(await inspectCase(browser, item, vp));
  }
}
await browser.close();

const summary = results.map(r => ({
  kind: r.kind,
  viewport: r.viewport.name,
  status: r.httpStatus,
  finalUrl: r.finalUrl,
  serverTiming: r.serverTiming,
  assetUrl: r.assetUrl,
  renderedAssetHash: r.renderedAssetHash,
  appPresent: r.initial.appPresent,
  overflowX: r.initial.documentOverflowX,
  visibleBrokenImages: r.initial.visibleBrokenImages.length,
  swatches: r.initial.swatchImgs.map(i => ({ ok: i.complete && i.naturalWidth > 0, src: i.src, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight })).slice(0, 12),
  failedResponseCount: r.failedResponses.length,
  consoleCount: r.consoleMessages.length,
  rowsInitial: r.initial.rows,
  panelsInitial: r.initial.panels,
  addRows: r.interactions.addState?.rows,
  addPanels: r.interactions.addState?.panels,
  hasGeometryProofText: r.initial.hasGeometryProofText,
  hasRejectedOldEndpoint: r.initial.hasRejectedOldEndpoint,
  scrollContainers: r.initial.scrollContainers,
}));
await fs.writeFile(path.join(OUT, 'baseline-rendered-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), out: OUT, summary, results }, null, 2));
await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ out: OUT, summary }, null, 2));
