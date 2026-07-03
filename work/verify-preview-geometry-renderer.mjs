import { chromium } from 'playwright';

const url = 'https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141408796731&_ab=0&_fd=0&_sc=1&visual_probe=' + Date.now();
const browser = await chromium.launch({ headless: true });
const outputs = [];
for (const [name, viewport, mobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['tablet', { width: 820, height: 1100 }, false],
  ['mobile', { width: 390, height: 844 }, true],
]) {
  const page = await browser.newPage({ viewport, isMobile: mobile });
  const errors = [];
  page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) errors.push(`${msg.type()}: ${msg.text()}`); });
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.innate-bench-widget', { timeout: 30000 });
  await page.locator('#innate-benchtop-configurator').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1600);
  const metrics = await page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
    return {
      cssLoaded: !!document.querySelector('link[data-benchtop-geometry-renderer]'),
      widget: !!document.querySelector('.innate-bench-widget'),
      panels: document.querySelectorAll('[data-panel-move="true"]').length,
      activeRow: document.querySelector('.panel-row.innate-panel-card-is-active')?.textContent?.replace(/\s+/g,' ').trim().slice(0,100) || null,
      activeTab: document.querySelector('.mobile-piece-tab.is-active')?.textContent?.replace(/\s+/g,' ').trim() || null,
      rotateVisible: (() => { const el=document.querySelector('.innate-selected-rotate'); if (!el) return false; const cs=getComputedStyle(el); const r=el.getBoundingClientRect(); return cs.display !== 'none' && r.width > 0 && r.height > 0; })(),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      preview: box('.slab-preview'),
      rail: box('.mobile-piece-rail'),
      url: location.href,
    };
  });
  const path = `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-26-preview-geometry-renderer-141408796731-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  outputs.push({ name, path, metrics, errors: errors.filter(e => !/favicon|Tracking Prevention|preload|shop\.app|status of 403|Content Security Policy directive/i.test(e)).slice(0, 20) });
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ url, outputs }, null, 2));
const failed = outputs.flatMap(o => [
  !o.metrics.cssLoaded ? `${o.name}: CSS not loaded` : null,
  !o.metrics.widget ? `${o.name}: widget missing` : null,
  o.metrics.panels < 1 ? `${o.name}: panels missing` : null,
  o.metrics.overflowX > 2 ? `${o.name}: overflow ${o.metrics.overflowX}` : null,
  o.errors.length ? `${o.name}: console errors ${o.errors.join('; ')}` : null,
].filter(Boolean));
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
