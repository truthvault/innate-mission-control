import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const LIVE = process.env.BENCHTOP_LIVE_URL || 'https://innatefurniture.co.nz/pages/timber-panels?_ab=0&_fd=0&_sc=1';
const PREVIEW = process.env.BENCHTOP_PREVIEW_URL || 'https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141408796731&_ab=0&_fd=0&_sc=1';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').slice(0, 15);
const OUT = process.env.BENCHTOP_DEEP_PARITY_OUT || `reference/evidence/${stamp}-benchtop-deep-parity`;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
  { name: 'laptop', width: 1180, height: 850, mobile: false },
  { name: 'tablet', width: 768, height: 900, mobile: true },
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'short-mobile', width: 375, height: 667, mobile: true },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (n) => Number.isFinite(n) ? Math.round(n * 10) / 10 : n;
const textClean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function pctDiff(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denom;
}

function rectDiff(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(pctDiff(a.w, b.w), pctDiff(a.h, b.h), pctDiff(a.x, b.x), pctDiff(a.y, b.y));
}

function rowOrientations(state) {
  return state.rows.map((row) => row.orientation || '').join(',');
}

function visiblePanelKey(panel, index) {
  return panel?.number || panel?.label || panel?.id || `panel-${index + 1}`;
}

async function ensureOut() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(path.join(OUT, 'screenshots'), { recursive: true });
}

async function loadPage(page, url) {
  await page.route('**/api/send-quote', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, interceptedBy: 'deep-parity-audit' }),
  }));
  await page.addInitScript(() => {
    localStorage.removeItem('innate.benchtop.v4');
    localStorage.removeItem('innate.benchtop.v3');
  });
  const sep = url.includes('?') ? '&' : '?';
  await page.goto(`${url}${sep}deepParity=${Date.now()}-${Math.random().toString(36).slice(2)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.locator('.innate-bench-widget, #innate-benchtop-configurator, .atelier-configurator-mount').first().waitFor({ timeout: 30_000 });
  await page.locator('.slab-preview, .stage__preview, .stage__visual, #innate-benchtop-configurator').first().scrollIntoViewIfNeeded();
  await sleep(800);
}

async function state(page, label, screenshotName) {
  const data = await page.evaluate((label) => {
    const qa = (sel) => Array.from(document.querySelectorAll(sel));
    const q = (sel) => document.querySelector(sel);
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x * 10) / 10,
        y: Math.round(r.y * 10) / 10,
        left: Math.round(r.left * 10) / 10,
        top: Math.round(r.top * 10) / 10,
        right: Math.round(r.right * 10) / 10,
        bottom: Math.round(r.bottom * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        cx: Math.round((r.left + r.width / 2) * 10) / 10,
        cy: Math.round((r.top + r.height / 2) * 10) / 10,
      };
    };
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };
    const numberFromText = (s) => {
      const m = String(s || '').match(/(?:Benchtop\s*)?piece\s*([1-9])/i);
      return m ? Number(m[1]) : null;
    };
    const previewEl = q('.slab-preview, .stage__preview, .stage__visual');
    const svg = q('.slab-preview svg, .stage__preview svg, .stage__visual svg');
    const panels = qa('[data-panel-move="true"]').filter(visible).map((el, i) => {
      const group = el.closest('g');
      const labelText = el.getAttribute('data-panel-label') || el.getAttribute('aria-label') || group?.getAttribute('aria-label') || '';
      const b = rect(el);
      const centre = b ? document.elementsFromPoint(b.cx, b.cy).slice(0, 8).map((hit) => ({
        tag: hit.tagName,
        cls: String(hit.getAttribute('class') || hit.className || ''),
        id: hit.getAttribute('data-panel-id'),
        label: hit.getAttribute('data-panel-label') || hit.getAttribute('aria-label') || '',
        text: (hit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      })) : [];
      return {
        index: i + 1,
        id: el.getAttribute('data-panel-id') || '',
        label: labelText,
        number: numberFromText(labelText) || i + 1,
        active: !!group?.classList.contains('innate-panel-is-active'),
        rect: b,
        attrs: Object.fromEntries(['x', 'y', 'width', 'height', 'transform'].map((key) => [key, el.getAttribute(key) || group?.getAttribute(key) || null])),
        centreHit: centre,
      };
    });
    const rows = qa('.panel-row').filter(visible).map((row, i) => {
      const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        index: i + 1,
        number: numberFromText(row.querySelector('.panel-row__label')?.value || txt) || i + 1,
        active: row.classList.contains('innate-panel-card-is-active'),
        label: row.querySelector('.panel-row__label')?.value || '',
        orientation: (txt.match(/horizontal|vertical/i)?.[0] || '').toLowerCase(),
        inputs: Array.from(row.querySelectorAll('input')).map((input) => input.value),
        text: txt.slice(0, 500),
        rect: rect(row),
      };
    });
    const tabs = qa('.mobile-piece-tab').filter(visible).map((tab, i) => {
      const txt = (tab.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        index: i + 1,
        number: numberFromText(txt) || i + 1,
        active: tab.classList.contains('is-active') || tab.getAttribute('aria-selected') === 'true',
        ariaSelected: tab.getAttribute('aria-selected'),
        text: txt.slice(0, 300),
        rect: rect(tab),
      };
    });
    const handles = qa('.panel-resize__dot, circle[class*="resize"], circle').filter((el) => visible(el) && (el.classList.contains('panel-resize__dot') || /resize|handle|dot/i.test(el.getAttribute('class') || ''))).map((el) => ({
      tag: el.tagName,
      cls: el.getAttribute('class') || '',
      r: el.getAttribute('r'),
      fill: el.getAttribute('fill'),
      stroke: el.getAttribute('stroke'),
      rect: rect(el),
    }));
    const labels = qa('.slab-preview svg text, .stage__preview svg text').filter(visible).map((el) => ({
      text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
      rect: rect(el),
      transform: el.getAttribute('transform') || '',
      cls: el.getAttribute('class') || '',
    }));
    const buttons = qa('button').filter(visible).map((b) => ({
      text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      aria: b.getAttribute('aria-label') || '',
      cls: b.getAttribute('class') || '',
      rect: rect(b),
    }));
    const sheet = q('.mobile-sheet, .atelier-mobile-sheet, [data-mobile-sheet]');
    const scrollContainers = qa('.atelier-configurator-mount, .innate-bench-widget, .stage, .stage__preview, .stage__visual, .slab-preview, .stage__controls, .material-card, .panel-editor, main, section, div')
      .filter(visible)
      .map((el) => {
        const cs = getComputedStyle(el);
        const b = rect(el);
        return {
          tag: el.tagName,
          cls: String(el.getAttribute('class') || '').slice(0, 160),
          id: el.id || '',
          rect: b,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          scrollW: Math.round(el.scrollWidth * 10) / 10,
          clientW: Math.round(el.clientWidth * 10) / 10,
          scrollH: Math.round(el.scrollHeight * 10) / 10,
          clientH: Math.round(el.clientHeight * 10) / 10,
          hasX: el.scrollWidth > el.clientWidth + 3,
          hasY: el.scrollHeight > el.clientHeight + 3,
        };
      })
      .filter((el) => (el.hasX || el.hasY) && /auto|scroll|hidden|clip/i.test(`${el.overflowX} ${el.overflowY}`))
      .slice(0, 24);
    const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      label,
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight },
      preview: rect(previewEl),
      svg: svg ? { rect: rect(svg), viewBox: svg.getAttribute('viewBox') } : null,
      panels,
      rows,
      tabs,
      handles,
      labels,
      buttons,
      sheet: sheet && visible(sheet) ? { rect: rect(sheet), text: (sheet.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 700) } : null,
      scrollContainers,
      activePanel: panels.find((p) => p.active) || null,
      activeRow: rows.find((r) => r.active) || null,
      activeTab: tabs.find((t) => t.active) || null,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      proofHarnessText: /geometry proof only|live design surface/i.test(bodyText),
      stepWording: /Step\s+\d+:/i.test(bodyText),
      totalText: (q('.stickybar__price, .quote-summary__total-amt, .atelier-total')?.textContent || '').replace(/\s+/g, ' ').trim(),
      bodySnippet: bodyText.slice(0, 2000),
    };
  }, label);
  if (screenshotName) {
    await page.screenshot({ path: path.join(OUT, 'screenshots', `${screenshotName}-${label}.png`), fullPage: false });
  }
  return data;
}

async function clickAddPiece(page) {
  await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden';
    };
    const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const buttons = Array.from(document.querySelectorAll('button'));
    const button = buttons.find((b) => visible(b) && b.classList.contains('panel-editor__add') && /add another benchtop piece/i.test(text(b)))
      || buttons.find((b) => visible(b) && /add another benchtop piece/i.test(text(b)))
      || buttons.find((b) => visible(b) && b.classList.contains('mobile-piece-tab--add'));
    if (!button) throw new Error('No visible add-piece button found');
    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.click();
  });
  await sleep(450);
}

async function clickFirstVisible(page, selector) {
  const clicked = await page.evaluate((selector) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };
    const el = Array.from(document.querySelectorAll(selector)).find(visible);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return true;
  }, selector);
  await sleep(300);
  return clicked;
}

async function selectRow(page, number) {
  const clickedRow = await page.evaluate((number) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };
    const rows = Array.from(document.querySelectorAll('.panel-row'));
    const row = rows[number - 1];
    if (row && visible(row)) {
      row.scrollIntoView({ block: 'center', inline: 'center' });
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: row.getBoundingClientRect().left + 24, clientY: row.getBoundingClientRect().top + 24 }));
      return 'row';
    }
    const tabs = Array.from(document.querySelectorAll('.mobile-piece-tab'));
    const tab = tabs.find((t) => visible(t) && new RegExp(`piece\\s*${number}`, 'i').test(t.textContent || '')) || tabs[number - 1];
    if (tab && visible(tab)) {
      tab.scrollIntoView({ block: 'center', inline: 'center' });
      tab.click();
      return 'tab';
    }
    return null;
  }, number);
  await sleep(350);
  if (!clickedRow) throw new Error(`Could not select panel ${number} by visible row or mobile tab`);
}

async function rotateSelected(page) {
  if (await clickFirstVisible(page, 'button[aria-label="Rotate selected panel 90 degrees"]')) return;
  if (await clickFirstVisible(page, '.panel-row.innate-panel-card-is-active button[aria-label*="Rotate"], .panel-row.innate-panel-card-is-active .panel-row__rotate')) return;
  // Mobile/tablet live hides the floating rotate button; open Size/Edit size sheet and use its visible Rotate piece 90° control.
  await openMobileTab(page, /Size|Edit size|Step 1/i).catch(() => null);
  const clickedSheetRotate = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };
    const button = Array.from(document.querySelectorAll('button')).find((b) => visible(b) && /rotate(?: piece)?\s*90/i.test(b.textContent || b.getAttribute('aria-label') || ''));
    if (!button) return false;
    button.click();
    return true;
  });
  await sleep(450);
  if (!clickedSheetRotate) throw new Error('No visible selected rotate control found');
}

async function rotateRow(page, number) {
  await selectRow(page, number);
  const clickedVisibleRowRotate = await clickFirstVisible(page, '.panel-row.innate-panel-card-is-active button[aria-label*="Rotate"], .panel-row.innate-panel-card-is-active .panel-row__rotate');
  if (!clickedVisibleRowRotate) await rotateSelected(page);
  await sleep(450);
}

async function dragActivePanel(page, dx, dy) {
  const before = await state(page, 'before-drag-active', null);
  const active = before.activePanel;
  if (!active?.rect) return { error: 'no active panel before drag', before, after: before };
  const sx = active.rect.cx;
  const sy = active.rect.cy;
  const ownership = await page.evaluate(({ x, y, id, label }) => {
    return document.elementsFromPoint(x, y).slice(0, 10).map((el) => ({
      tag: el.tagName,
      cls: String(el.getAttribute('class') || el.className || ''),
      id: el.getAttribute('data-panel-id'),
      label: el.getAttribute('data-panel-label') || el.getAttribute('aria-label') || '',
      ownsTarget: (id && el.getAttribute('data-panel-id') === id) || (label && (el.getAttribute('data-panel-label') || '').includes(label)),
    }));
  }, { x: sx, y: sy, id: active.id, label: active.label });
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 18; i += 1) {
    await page.mouse.move(sx + (dx * i) / 18, sy + (dy * i) / 18);
    await sleep(20);
  }
  await page.mouse.up();
  await sleep(500);
  const after = await state(page, 'after-drag-active', null);
  const beforeByNumber = new Map(before.panels.map((p) => [p.number, p]));
  const movements = after.panels.map((p) => {
    const old = beforeByNumber.get(p.number);
    return {
      number: p.number,
      id: p.id,
      label: p.label,
      activeAfter: p.active,
      dx: old ? round(p.rect.cx - old.rect.cx) : null,
      dy: old ? round(p.rect.cy - old.rect.cy) : null,
      distance: old ? round(Math.hypot(p.rect.cx - old.rect.cx, p.rect.cy - old.rect.cy)) : null,
    };
  });
  return { target: active, ownership, movements, before, after };
}

async function openMobileTab(page, labelRegex) {
  const found = await page.evaluate((source) => {
    const re = new RegExp(source, 'i');
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden';
    };
    const candidates = Array.from(document.querySelectorAll('button, [role="tab"]')).filter((el) => visible(el) && re.test(el.textContent || ''));
    const el = candidates[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    el.click();
    return { text: (el.textContent || '').replace(/\s+/g, ' ').trim(), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  }, labelRegex.source);
  await sleep(450);
  return found;
}

async function auditOne(url, kind, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.mobile });
  const page = await context.newPage();
  const consoleMessages = [];
  const network = [];
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 500) });
  });
  page.on('pageerror', (err) => consoleMessages.push({ type: 'pageerror', text: err.message }));
  page.on('request', (req) => {
    const u = req.url();
    if (/innate-benchtop-quote|innate-mission-control|cdn\/shop|api\/send-quote|api\/freight|timbers\//i.test(u)) network.push({ method: req.method(), url: u });
  });
  const prefix = `${viewport.name}-${kind}`;
  const result = { kind, viewport, url, consoleMessages, network, states: {}, interactions: {}, errors: [] };
  try {
    await loadPage(page, url);
    result.states.initial = await state(page, 'initial', prefix);

    await rotateSelected(page);
    result.states.afterSingleRotate = await state(page, 'after-single-rotate', prefix);

    // Return first panel to horizontal before multi-panel checks if possible.
    await rotateSelected(page).catch(() => {});
    await sleep(250);

    for (let i = result.states.initial.panels.length; i < 4; i += 1) await clickAddPiece(page);
    result.states.afterAdd4 = await state(page, 'after-add4', prefix);

    await selectRow(page, 2);
    result.states.afterSelectRow2 = await state(page, 'after-select-row2', prefix);
    const beforeRotate2 = await state(page, 'before-rotate-row2', null);
    await rotateSelected(page);
    result.states.afterRotateRow2 = await state(page, 'after-rotate-row2', prefix);
    result.interactions.rotateRow2 = { before: beforeRotate2.rows.map((r) => ({ n: r.number, orientation: r.orientation, active: r.active })), after: result.states.afterRotateRow2.rows.map((r) => ({ n: r.number, orientation: r.orientation, active: r.active })) };

    await rotateRow(page, 3);
    result.states.afterRotateRow3 = await state(page, 'after-rotate-row3', prefix);

    await selectRow(page, 2);
    result.interactions.dragRow2 = await dragActivePanel(page, 70, 35);
    result.states.afterDragRow2 = await state(page, 'after-drag-row2', prefix);

    if (viewport.mobile) {
      result.interactions.openSize = await openMobileTab(page, /Size|Edit size|Step 1/i);
      result.states.sizeSheet = await state(page, 'size-sheet', prefix);
      result.interactions.openTimber = await openMobileTab(page, /Timber|finish|Step 2/i);
      result.states.timberSheet = await state(page, 'timber-sheet', prefix);
    }
  } catch (error) {
    result.errors.push(error?.stack || error?.message || String(error));
  } finally {
    await browser.close();
  }
  return result;
}

function compareStates(viewport, live, preview, problems, differences) {
  // Compare strict visual parity for states that should remain identical. Rotating row 2/3 is an intended geometry fix,
  // so those checkpoints are validated by selected-only assertions rather than live-equality box comparison.
  const checkpoints = ['initial', 'afterSingleRotate', 'afterAdd4'];
  for (const checkpoint of checkpoints) {
    const l = live.states[checkpoint];
    const p = preview.states[checkpoint];
    if (!l || !p) {
      problems.push({ viewport: viewport.name, area: checkpoint, issue: 'missing checkpoint', live: !!l, preview: !!p, risk: 'untested flow' });
      continue;
    }
    if (p.overflowX) problems.push({ viewport: viewport.name, area: checkpoint, issue: 'preview horizontal overflow', risk: 'mobile/layout break' });
    if (p.proofHarnessText && !l.proofHarnessText) problems.push({ viewport: viewport.name, area: checkpoint, issue: 'preview contains proof-harness text', risk: 'customer-facing stale/test UI' });
    if (p.stepWording !== l.stepWording) differences.push({ viewport: viewport.name, area: checkpoint, issue: 'step wording differs', live: l.stepWording, preview: p.stepWording, intended: false });
    const previewUnexpectedScroll = (p.scrollContainers || []).filter((el) => {
      const cls = `${el.cls} ${el.id}`;
      // Normal page-level scrolling is acceptable. Internal configurator/canvas/sidebar scrollbars are not, because Guido sees them as broken/cropped UI.
      return /atelier-configurator-mount|innate-bench-widget|stage|slab-preview|material-card|panel-editor/i.test(cls)
        && (el.hasX || el.hasY)
        && el.rect?.w > 40
        && el.rect?.h > 40;
    });
    if (previewUnexpectedScroll.length) {
      problems.push({ viewport: viewport.name, area: checkpoint, issue: 'preview shows internal configurator scrollbar/overflow', preview: previewUnexpectedScroll.slice(0, 8), risk: 'cropped or scroll-trapped configurator UI' });
    }
    if (l.preview && p.preview) {
      const dW = pctDiff(l.preview.w, p.preview.w);
      const dH = pctDiff(l.preview.h, p.preview.h);
      if (dW > 0.03 || dH > 0.06) problems.push({ viewport: viewport.name, area: checkpoint, issue: 'design surface size differs from live', live: l.preview, preview: p.preview, risk: 'visual parity drift' });
    }
    const livePanels = l.panels || [];
    const previewPanels = p.panels || [];
    if (livePanels.length !== previewPanels.length) {
      problems.push({ viewport: viewport.name, area: checkpoint, issue: 'panel count differs', live: livePanels.length, preview: previewPanels.length, risk: 'flow/state mismatch' });
    }
    for (let i = 0; i < Math.min(livePanels.length, previewPanels.length); i += 1) {
      const lp = livePanels[i];
      const pp = previewPanels[i];
      const wDiff = pctDiff(lp.rect?.w, pp.rect?.w);
      const hDiff = pctDiff(lp.rect?.h, pp.rect?.h);
      if (wDiff > 0.08 || hDiff > 0.08) {
        problems.push({ viewport: viewport.name, area: checkpoint, issue: `panel ${visiblePanelKey(pp, i)} rendered size differs from live`, live: lp.rect, preview: pp.rect, risk: 'scale/rotation parity drift' });
      }
    }
    const lh = l.handles?.[0]?.rect;
    const ph = p.handles?.[0]?.rect;
    if (lh && ph) {
      if (Math.abs((lh.w || 0) - (ph.w || 0)) > 1.5 || Math.abs((lh.h || 0) - (ph.h || 0)) > 1.5) {
        problems.push({ viewport: viewport.name, area: checkpoint, issue: 'handle/circle visible size differs from live', live: lh, preview: ph, risk: 'visible control drift' });
      }
      const liveHandle = l.handles?.[0] || {};
      const previewHandle = p.handles?.[0] || {};
      if (String(liveHandle.r || '') !== String(previewHandle.r || '') || String(liveHandle.fill || '') !== String(previewHandle.fill || '')) {
        differences.push({ viewport: viewport.name, area: checkpoint, issue: 'handle SVG style attributes differ', live: { r: liveHandle.r, fill: liveHandle.fill, stroke: liveHandle.stroke, cls: liveHandle.cls }, preview: { r: previewHandle.r, fill: previewHandle.fill, stroke: previewHandle.stroke, cls: previewHandle.cls }, intended: false });
      }
    }
  }
}

function checkSelectedOnly(kind, viewport, result, problems) {
  const rotate = result.interactions.rotateRow2;
  if (rotate?.before && rotate?.after) {
    const beforeSource = rotate.before.length ? rotate.before : (result.states.afterSelectRow2?.tabs || []).map((t) => ({ n: t.number, orientation: (t.text.match(/horizontal|vertical/i)?.[0] || '').toLowerCase(), active: t.active }));
    const afterSource = rotate.after.length ? rotate.after : (result.states.afterRotateRow2?.tabs || []).map((t) => ({ n: t.number, orientation: (t.text.match(/horizontal|vertical/i)?.[0] || '').toLowerCase(), active: t.active }));
    const before = new Map(beforeSource.map((r) => [r.n, r.orientation]));
    const changed = afterSource.filter((r) => before.get(r.n) !== r.orientation).map((r) => r.n);
    if (changed.length !== 1 || changed[0] !== 2) {
      problems.push({ viewport: viewport.name, candidate: kind, area: 'rotate row 2', issue: 'rotate changed wrong number of panels or wrong panel', changed, before: beforeSource, after: afterSource, risk: 'selected-panel bug' });
    }
  }
  const drag = result.interactions.dragRow2;
  if (drag?.movements) {
    const moved = drag.movements.filter((m) => (m.distance || 0) > 8).sort((a, b) => (b.distance || 0) - (a.distance || 0));
    if (!moved.length || moved[0].number !== 2) {
      problems.push({ viewport: viewport.name, candidate: kind, area: 'drag row 2', issue: 'drag moved wrong panel or no selected panel movement', target: drag.target, moved, ownership: drag.ownership, risk: 'wrong-target drag' });
    }
    if (moved.length > 1 && (moved[1].distance || 0) > 8) {
      problems.push({ viewport: viewport.name, candidate: kind, area: 'drag row 2', issue: 'drag moved additional panels', moved, risk: 'multi-panel mutation during selected drag' });
    }
    const firstHit = drag.ownership?.[0];
    if (firstHit && !firstHit.ownsTarget) {
      problems.push({ viewport: viewport.name, candidate: kind, area: 'drag row 2 hit target', issue: 'active panel centre is covered by another element before drag', firstHit, target: drag.target, ownership: drag.ownership?.slice(0, 5), risk: 'overlap hit-target ambiguity' });
    }
  }
}

function buildSummary(results) {
  const problems = [];
  const differences = [];
  for (const viewport of VIEWPORTS) {
    const live = results.find((r) => r.kind === 'live' && r.viewport.name === viewport.name);
    const preview = results.find((r) => r.kind === 'preview' && r.viewport.name === viewport.name);
    if (!live || !preview) {
      problems.push({ viewport: viewport.name, area: 'runner', issue: 'missing live or preview run' });
      continue;
    }
    if (live.errors.length) problems.push({ viewport: viewport.name, candidate: 'live', area: 'runner', issue: 'live run errors', errors: live.errors });
    if (preview.errors.length) problems.push({ viewport: viewport.name, candidate: 'preview', area: 'runner', issue: 'preview run errors', errors: preview.errors });
    compareStates(viewport, live, preview, problems, differences);
    checkSelectedOnly('preview', viewport, preview, problems);
  }
  return { problems, differences, verdict: problems.length ? 'not safe for review/live' : 'safe for review candidate' };
}

await ensureOut();
const results = [];
for (const viewport of VIEWPORTS) {
  console.log(`Auditing ${viewport.name} live...`);
  results.push(await auditOne(LIVE, 'live', viewport));
  console.log(`Auditing ${viewport.name} preview...`);
  results.push(await auditOne(PREVIEW, 'preview', viewport));
}
const summary = buildSummary(results);
const report = { generatedAt: new Date().toISOString(), liveUrl: LIVE, previewUrl: PREVIEW, outDir: OUT, summary, results };
await fs.writeFile(path.join(OUT, 'deep-parity-report.json'), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(OUT, 'deep-parity-summary.md'), `# Benchtop Deep Parity QA\n\nGenerated: ${report.generatedAt}\n\nLive: ${LIVE}\n\nPreview: ${PREVIEW}\n\nVerdict: **${summary.verdict}**\n\nProblems: ${summary.problems.length}\n\nDifferences: ${summary.differences.length}\n\n## Problems\n\n${summary.problems.map((p, i) => `${i + 1}. ${p.viewport || ''} / ${p.area || ''}: ${p.issue} (${p.risk || 'risk not classified'})`).join('\n')}\n\n## Differences\n\n${summary.differences.map((d, i) => `${i + 1}. ${d.viewport || ''} / ${d.area || ''}: ${d.issue}`).join('\n')}\n`);
console.log(JSON.stringify({ outDir: OUT, verdict: summary.verdict, problems: summary.problems.length, differences: summary.differences.length, firstProblems: summary.problems.slice(0, 12) }, null, 2));
if (summary.problems.length) process.exit(2);
