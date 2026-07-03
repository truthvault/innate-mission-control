import { chromium } from 'playwright';

const url = 'https://innatefurniture.co.nz/pages/timber-panels?cacheBust=approved-verify-' + Date.now();
const browser = await chromium.launch({ headless: true });
const results = [];
async function verifyMobile(viewport, mode) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(20000);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('.mobile-mode-rail button', { state: 'visible', timeout: 30000 });
  await page.locator('.mobile-mode-rail button', { hasText: mode }).click();
  await page.waitForSelector('.mobile-sheet', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(300);
  const metrics = await page.evaluate(() => {
    const sheet = document.querySelector('.mobile-sheet');
    const sticky = document.querySelector('.mobile-stickybar, .mobile-summary-bar, .innate-mobile-stickybar');
    const rotate = Array.from(document.querySelectorAll('button, [role="button"]')).find((el) => /Rotate piece 90/i.test(el.textContent || ''));
    const floatingRotate = document.querySelector('.innate-selected-rotate.is-mobile');
    const rect = sheet.getBoundingClientRect();
    const bottomGap = Math.round((window.innerHeight - rect.bottom) * 100) / 100;
    const centerBottom = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 3);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      sheetBottomCss: getComputedStyle(sheet).bottom,
      sheetMaxHeight: getComputedStyle(sheet).maxHeight,
      sheetRect: { top: rect.top, bottom: rect.bottom, height: rect.height },
      bottomGap,
      bottomElementInSheet: !!centerBottom?.closest?.('.mobile-sheet'),
      stickyDisplay: sticky ? getComputedStyle(sticky).display : null,
      rotateInSheet: !!rotate?.closest?.('.mobile-sheet'),
      floatingRotateDisplay: floatingRotate ? getComputedStyle(floatingRotate).display : null,
      differenceTextVisibleBelowSheet: !!Array.from(document.querySelectorAll('body *')).find((el) => /A useful brief before we talk/i.test(el.textContent || '') && el.getBoundingClientRect().top > rect.bottom)
    };
  });
  const path = `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-26-live-approved-reverify-${viewport.width}x${viewport.height}-${mode.toLowerCase()}.png`;
  await page.screenshot({ path, fullPage: false });
  results.push({ mode, viewport, path, metrics });
  await page.close();
}

await verifyMobile({ width: 390, height: 844 }, 'Size');
await verifyMobile({ width: 390, height: 844 }, 'Timber');
await verifyMobile({ width: 375, height: 667 }, 'Size');

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desktop.setDefaultTimeout(20000);
await desktop.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desktop.waitForSelector('.innate-selected-rotate, .atelier-stage', { timeout: 30000 });
const desktopMetrics = await desktop.evaluate(() => {
  const floatingRotate = document.querySelector('.innate-selected-rotate');
  const sheet = document.querySelector('.mobile-sheet');
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    desktopRotateVisible: floatingRotate ? getComputedStyle(floatingRotate).display !== 'none' && floatingRotate.getBoundingClientRect().width > 0 : false,
    mobileSheetPresent: !!sheet,
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth
  };
});
const desktopPath = '/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-26-live-approved-reverify-desktop.png';
await desktop.screenshot({ path: desktopPath, fullPage: false });
await desktop.close();
await browser.close();

const failed = [];
for (const r of results) {
  if (Math.abs(r.metrics.bottomGap) > 1) failed.push(`${r.viewport.width}x${r.viewport.height} ${r.mode}: bottom gap ${r.metrics.bottomGap}`);
  if (!r.metrics.bottomElementInSheet) failed.push(`${r.viewport.width}x${r.viewport.height} ${r.mode}: bottom point not inside sheet`);
  if (r.mode === 'Size' && !r.metrics.rotateInSheet) failed.push(`${r.viewport.width}x${r.viewport.height} Size: rotate control not in sheet`);
}
if (!desktopMetrics.desktopRotateVisible) failed.push('desktop rotate not visible');
if (desktopMetrics.horizontalOverflow > 2) failed.push(`desktop horizontal overflow ${desktopMetrics.horizontalOverflow}`);
console.log(JSON.stringify({ url, results, desktop: { path: desktopPath, metrics: desktopMetrics }, failed }, null, 2));
if (failed.length) process.exit(1);
