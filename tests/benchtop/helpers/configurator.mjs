export const CONFIGURATOR_URL = process.env.BENCHTOP_URL || 'https://innatefurniture.co.nz/pages/timber-panels';
export const LIVE_ASSET_HASH = 'acccb33c7de5a174031d13d82f586d3ed537e258d3285f3cf74627188bc314d6';

export async function loadConfigurator(page, testInfo, extraQuery = '') {
  await page.route('**/api/send-quote', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, interceptedBy: 'benchtop-geometry-regression' }),
    });
  });
  await page.addInitScript(() => {
    localStorage.removeItem('innate.benchtop.v4');
    localStorage.removeItem('innate.benchtop.v3');
  });
  const cache = `pw-geometry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sep = CONFIGURATOR_URL.includes('?') ? '&' : '?';
  const url = `${CONFIGURATOR_URL}${sep}_ab=0&_fd=0&_sc=1&readonly=1&cachebust=${cache}${extraQuery}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.locator('.innate-bench-widget').waitFor({ timeout: 30_000 });
  await page.locator('.stage, .stage__preview, .slab-preview').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await attachState(testInfo, 'initial-state', await measure(page));
}

export async function addPieces(page, targetCount) {
  for (let i = await uniquePanelCount(page); i < targetCount; i += 1) {
    await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden';
      };
      const buttons = Array.from(document.querySelectorAll('button'));
      const text = (b) => (b.textContent || '').replace(/\s+/g, ' ').trim();
      const button = buttons.find((b) => visible(b) && b.classList.contains('panel-editor__add') && /add another benchtop piece/i.test(text(b)))
        || buttons.find((b) => visible(b) && b.classList.contains('mobile-piece-tab--add'))
        || buttons.find((b) => visible(b) && /^add another benchtop piece$/i.test(text(b)));
      if (!button) throw new Error('No visible add-piece button found');
      button.scrollIntoView({ block: 'center', inline: 'center' });
      button.click();
    });
    await page.waitForTimeout(500);
  }
}

export async function uniquePanelCount(page) {
  const state = await measure(page);
  return state.panels.length;
}

export async function selectPanelRow(page, panelNumber) {
  await page.locator('.panel-row').nth(panelNumber - 1).scrollIntoViewIfNeeded();
  await page.locator('.panel-row').nth(panelNumber - 1).click({ position: { x: 24, y: 24 } });
  await page.waitForTimeout(150);
}

export async function rotatePanelRow(page, panelNumber) {
  await selectPanelRow(page, panelNumber);
  const row = page.locator('.panel-row').nth(panelNumber - 1);
  const rotate = row.locator('button[aria-label*="Rotate"], .panel-row__rotate').first();
  await rotate.click();
  await page.waitForTimeout(300);
}

export async function setPanelDimensions(page, panelNumber, { length, width, thickness } = {}) {
  await selectPanelRow(page, panelNumber);
  const row = page.locator('.panel-row').nth(panelNumber - 1);
  const inputs = row.locator('input');
  // Current DOM order includes label input first, then length, width, thickness.
  if (length != null) {
    await inputs.nth(1).fill(String(length));
    await inputs.nth(1).press('Tab');
  }
  if (width != null) {
    await inputs.nth(2).fill(String(width));
    await inputs.nth(2).press('Tab');
  }
  if (thickness != null) {
    await inputs.nth(3).fill(String(thickness));
    await inputs.nth(3).press('Tab');
  }
  await page.waitForTimeout(400);
}

export async function clickMobilePieceTab(page, panelNumber) {
  const tab = page.locator('.mobile-piece-tab:visible').filter({ hasText: new RegExp(`Benchtop piece ${panelNumber}`) }).first();
  const box = await tab.boundingBox();
  if (!box) throw new Error(`Visible tab for piece ${panelNumber} not found`);
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return {
      tag: el?.tagName || null,
      className: String(el?.className || ''),
      text: (el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  return { box, hit };
}

export async function rotateSelectedPanel(page) {
  const selectedRotate = page.locator('button[aria-label="Rotate selected panel 90 degrees"]:visible').first();
  if (await selectedRotate.count()) {
    await selectedRotate.click();
  } else {
    await page.locator('.panel-row.innate-panel-card-is-active button[aria-label*="Rotate"], .panel-row.innate-panel-card-is-active .panel-row__rotate').first().click();
  }
  await page.waitForTimeout(300);
}

export async function dragPanelByVisibleIndex(page, visibleIndex, dx, dy, { steps = 20 } = {}) {
  const panel = page.locator('[data-panel-move="true"]').filter({ visible: true }).nth(visibleIndex);
  await panel.scrollIntoViewIfNeeded().catch(() => {});
  const box = await panel.boundingBox();
  if (!box) throw new Error(`Visible panel ${visibleIndex} not found`);
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const samples = [];
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps);
    await page.waitForTimeout(20);
    samples.push(await measure(page));
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  return { start: { x: sx, y: sy }, samples, after: await measure(page) };
}

export async function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden';
    };
    const previewEl = document.querySelector('.slab-preview, .stage__preview, .stage__visual');
    const preview = rect(previewEl);
    const panelMap = new Map();
    for (const el of Array.from(document.querySelectorAll('[data-panel-move="true"]')).filter(visible)) {
      const id = el.getAttribute('data-panel-id') || el.getAttribute('data-panel-label') || String(panelMap.size + 1);
      if (!panelMap.has(id)) {
        const group = el.closest('g');
        panelMap.set(id, {
          id,
          label: el.getAttribute('data-panel-label') || el.getAttribute('aria-label') || '',
          active: !!group?.classList.contains('innate-panel-is-active'),
          rect: rect(el),
          transform: group?.getAttribute('transform') || el.getAttribute('transform') || null,
        });
      }
    }
    const panels = Array.from(panelMap.values());
    const union = panels.reduce((acc, p) => ({
      left: Math.min(acc.left, p.rect.left),
      top: Math.min(acc.top, p.rect.top),
      right: Math.max(acc.right, p.rect.right),
      bottom: Math.max(acc.bottom, p.rect.bottom),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    if (panels.length) {
      union.w = union.right - union.left;
      union.h = union.bottom - union.top;
      union.cx = union.left + union.w / 2;
      union.cy = union.top + union.h / 2;
    }
    const rows = Array.from(document.querySelectorAll('.panel-row')).map((row, index) => ({
      index: index + 1,
      label: row.querySelector('.panel-row__label')?.value || `Benchtop piece ${index + 1}`,
      active: row.classList.contains('innate-panel-card-is-active'),
      text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
      inputs: Array.from(row.querySelectorAll('input')).map((input) => input.value),
      rect: rect(row),
    }));
    const tabs = Array.from(document.querySelectorAll('.mobile-piece-tab')).map((tab, index) => ({
      index: index + 1,
      text: (tab.textContent || '').replace(/\s+/g, ' ').trim(),
      active: tab.classList.contains('is-active') || tab.getAttribute('aria-selected') === 'true',
      ariaSelected: tab.getAttribute('aria-selected'),
      rect: rect(tab),
      visible: visible(tab),
    }));
    const fitsPreview = preview && panels.length
      ? panels.every((p) => p.rect.left >= preview.left - 1 && p.rect.top >= preview.top - 1 && p.rect.right <= preview.right + 1 && p.rect.bottom <= preview.bottom + 1)
      : null;
    return {
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight },
      preview,
      panels,
      rows,
      tabs,
      union,
      fitsPreview,
      offPreviewPanels: preview ? panels.filter((p) => p.rect.left < preview.left - 1 || p.rect.top < preview.top - 1 || p.rect.right > preview.right + 1 || p.rect.bottom > preview.bottom + 1) : [],
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      selectedRotatePresent: !!document.querySelector('.innate-selected-rotate'),
      activeRow: rows.find((row) => row.active) || null,
      activeTab: tabs.find((tab) => tab.active) || null,
      activePanel: panels.find((panel) => panel.active) || null,
      totalText: (document.querySelector('.stickybar__price, .quote-summary__total-amt')?.textContent || '').replace(/\s+/g, ' ').trim(),
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 6000),
    };
  });
}

function parsePanelNumber(text) {
  // Live mobile/tablet text can collapse without whitespace, e.g. "Benchtop piece 41800 × 600".
  // Product requirement is currently single-digit panel tabs/rows, so capture the first digit only.
  const match = String(text || '').match(/Benchtop piece\s*([1-9])/i) || String(text || '').match(/piece\s*([1-9])/i);
  return match ? Number(match[1]) : null;
}

export function panelNumberFromRow(row) {
  if (!row) return null;
  return parsePanelNumber(`${row.label || ''} ${row.text || ''}`);
}

export function panelNumberFromTab(tab) {
  if (!tab) return null;
  return parsePanelNumber(tab.text || '');
}

export function panelNumberFromLabel(panel) {
  if (!panel) return null;
  return parsePanelNumber(`${panel.label || panel.id || ''}`);
}

export async function attachState(testInfo, name, data) {
  await testInfo.attach(name, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
}
