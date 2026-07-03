const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/, '').replace('T','_');
  const outDir = `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-28/hospitality-option2-visual-${stamp}`;
  fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });
  const url = `https://innatefurniture.co.nz/pages/hospitality-furniture?option2_visual=${Date.now()}`;
  const viewports = [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'tablet', width: 820, height: 1100 },
    { name: 'mobile', width: 390, height: 844 }
  ];
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(async () => chromium.launch({ headless: true }));
  const results = [];
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1500);
    // scroll through to trigger lazy images
    for (const y of [0, 600, 1200, 1800, 2400, 3200]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const shot = path.join(outDir, 'screenshots', `${vp.name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const data = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const imgs = Array.from(document.images).map((img) => {
        const r = img.getBoundingClientRect();
        return {
          src: img.currentSrc || img.src,
          alt: img.alt || '',
          visible: r.width > 1 && r.height > 1 && getComputedStyle(img).visibility !== 'hidden' && getComputedStyle(img).display !== 'none',
          rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        };
      });
      const mainNeedles = ['Kokomo-hospitality-hero.jpg', 'innate-commercial-gin-gin-new-regent.jpg'];
      const relevant = imgs.filter(i => mainNeedles.some(n => i.src.includes(n)) || /Kokomo|Gin Gin|Francesca/i.test(i.alt));
      const brokenVisible = imgs.filter(i => i.visible && i.complete && (i.naturalWidth === 0 || i.naturalHeight === 0));
      return {
        title: document.title,
        textHasNewCopy: text.includes('Natural materials need normal care, so we set clear expectations before anything is built.'),
        textHasMaintenanceFree: text.includes('maintenance-free'),
        htmlHasHeic: document.documentElement.innerHTML.includes('Kokomo.heic'),
        htmlHasNewJpg: document.documentElement.innerHTML.includes('Kokomo-hospitality-hero.jpg'),
        relevant,
        brokenVisible,
        h1: document.querySelector('h1')?.innerText || null,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      };
    });
    results.push({
      viewport: vp,
      status: response ? response.status() : null,
      finalUrl: page.url(),
      screenshot: shot,
      ...data,
      pass: response && response.status() === 200 && data.textHasNewCopy && !data.textHasMaintenanceFree && !data.htmlHasHeic && data.htmlHasNewJpg && data.relevant.filter(i => i.src.includes('Kokomo-hospitality-hero.jpg')).length >= 2 && data.brokenVisible.length === 0 && data.scrollWidth <= data.innerWidth + 2
    });
    await page.close();
  }
  await browser.close();
  const summary = { ok: results.every(r => r.pass), url, outDir, results };
  fs.writeFileSync(path.join(outDir, 'visual-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'report.md'), '# Hospitality option 2 visual verification\n\n' + results.map(r => `## ${r.viewport.name}\n- status: ${r.status}\n- pass: ${r.pass}\n- screenshot: ${r.screenshot}\n- H1: ${r.h1}\n- new JPG present: ${r.htmlHasNewJpg}\n- HEIC present: ${r.htmlHasHeic}\n- new copy present: ${r.textHasNewCopy}\n- maintenance-free present: ${r.textHasMaintenanceFree}\n- broken visible images: ${r.brokenVisible.length}\n- horizontal overflow: ${r.scrollWidth - r.innerWidth}\n`).join('\n'));
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
})();
