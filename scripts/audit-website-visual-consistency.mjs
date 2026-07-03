#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_BASE_URL = 'https://innatefurniture.co.nz';
const DEFAULT_ROUTES = [
  '/',
  '/collections/dining-tables',
  '/collections/outdoor',
  '/pages/benchtops',
  '/pages/commercial-1',
  '/pages/our-story',
  '/pages/contact',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet-wide', width: 1024, height: 900 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const LEAK_THEME_IDS = [
  '140732760123',
  '140760219707',
  '141105463355',
];

function usage() {
  return `
Innate website visual consistency audit

Usage:
  npm run audit:website-visual -- [options]

Options:
  --base-url <url>       Base site URL. Default: ${DEFAULT_BASE_URL}
  --url <path-or-url>    Add one route. May be repeated.
  --urls-file <path>     Newline-delimited routes/URLs to audit.
  --theme-id <id>        Append Shopify preview_theme_id to audited URLs.
  --out <dir>            Evidence directory. Default: reference/evidence/<date>/website-visual-audit-<stamp>
  --limit <n>            Limit route count for smoke tests.
  --timeout <ms>         Navigation timeout. Default: 45000
  --soft                 Always exit 0, even when findings fail the audit.
  --help                 Show this help.
`.trim();
}

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    urls: [],
    urlsFile: null,
    themeId: null,
    outDir: null,
    limit: null,
    timeout: 45000,
    soft: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    if (arg === '--base-url') args.baseUrl = readValue();
    else if (arg === '--url') args.urls.push(readValue());
    else if (arg === '--urls-file') args.urlsFile = readValue();
    else if (arg === '--theme-id') args.themeId = readValue();
    else if (arg === '--out') args.outDir = readValue();
    else if (arg === '--limit') args.limit = Number.parseInt(readValue(), 10);
    else if (arg === '--timeout') args.timeout = Number.parseInt(readValue(), 10);
    else if (arg === '--soft') args.soft = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.timeout) || args.timeout <= 0) throw new Error('--timeout must be a positive number');
  if (args.limit !== null && (!Number.isFinite(args.limit) || args.limit <= 0)) throw new Error('--limit must be a positive number');
  return args;
}

function timestampParts(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return {
    date: datePart,
    compact: `${datePart.replace(/-/g, '')}T${timePart}`,
  };
}

function slugForUrl(url) {
  const parsed = new URL(url);
  const pathPart = parsed.pathname === '/' ? 'home' : parsed.pathname.replace(/^\/+/, '');
  const withQuery = parsed.searchParams.get('preview_theme_id')
    ? `${pathPart}-theme-${parsed.searchParams.get('preview_theme_id')}`
    : pathPart;
  return withQuery
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'page';
}

function normalizeUrl(input, baseUrl, themeId, cacheKey) {
  const url = new URL(input, baseUrl);
  if (themeId) {
    url.searchParams.set('preview_theme_id', themeId);
    url.searchParams.set('_ab', '0');
    url.searchParams.set('_fd', '0');
    url.searchParams.set('_sc', '1');
  }
  url.searchParams.set('visual_audit', cacheKey);
  return url.toString();
}

async function loadRoutes(args) {
  const routes = [...args.urls];
  if (args.urlsFile) {
    const filePath = path.resolve(repoRoot, args.urlsFile);
    const body = await readFile(filePath, 'utf8');
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) routes.push(trimmed);
    }
  }
  const chosen = routes.length ? routes : DEFAULT_ROUTES;
  return args.limit ? chosen.slice(0, args.limit) : chosen;
}

function severityCounts(routeReports) {
  let failures = 0;
  let warnings = 0;
  for (const route of routeReports) {
    for (const viewport of route.viewports) {
      failures += viewport.failures.length;
      warnings += viewport.warnings.length;
    }
  }
  return { failures, warnings };
}

function summarizeFindingList(items) {
  return items.slice(0, 8).map((item) => `    - ${item}`).join('\n');
}

function mdEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function writeReports(report, outDir) {
  await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Website Visual Audit Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Base URL: ${report.baseUrl}`,
    `Preview theme: ${report.themeId || 'none'}`,
    `Routes: ${report.routes.length}`,
    `Viewports: ${report.viewports.map((viewport) => `${viewport.name} ${viewport.width}x${viewport.height}`).join(', ')}`,
    `Result: ${report.summary.failures === 0 ? 'PASS' : 'FAIL'}`,
    `Failures: ${report.summary.failures}`,
    `Warnings: ${report.summary.warnings}`,
    '',
    '## Route Summary',
    '',
    '| Route | Viewport | Status | Final URL | Failures | Warnings | Screenshot |',
    '|---|---:|---:|---|---:|---:|---|',
  ];

  for (const route of report.routes) {
    for (const viewport of route.viewports) {
      lines.push([
        mdEscape(route.input),
        viewport.viewport.name,
        viewport.status ?? 'n/a',
        mdEscape(viewport.finalUrl ?? ''),
        viewport.failures.length,
        viewport.warnings.length,
        viewport.screenshot ? `screenshots/${path.basename(viewport.screenshot)}` : '',
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
  }

  lines.push('', '## Findings', '');
  for (const route of report.routes) {
    lines.push(`### ${route.input}`, '');
    for (const viewport of route.viewports) {
      lines.push(`#### ${viewport.viewport.name} ${viewport.viewport.width}x${viewport.viewport.height}`, '');
      lines.push(`- URL: ${viewport.finalUrl || viewport.url}`);
      lines.push(`- Status: ${viewport.status ?? 'n/a'}`);
      lines.push(`- Title: ${viewport.metrics?.title || ''}`);
      lines.push(`- First H1: ${viewport.metrics?.firstH1 || ''}`);
      lines.push(`- Screenshot: ${viewport.screenshot ? `screenshots/${path.basename(viewport.screenshot)}` : 'not captured'}`);
      if (viewport.failures.length) {
        lines.push('- Failures:');
        lines.push(summarizeFindingList(viewport.failures));
      }
      if (viewport.warnings.length) {
        lines.push('- Warnings:');
        lines.push(summarizeFindingList(viewport.warnings));
      }
      if (!viewport.failures.length && !viewport.warnings.length) {
        lines.push('- Findings: none from automated heuristics. Screenshots still require human review.');
      }
      lines.push('');
    }
  }

  lines.push(
    '## Reminder',
    '',
    'This scanner catches route/version/layout defects and saves screenshots. It does not replace brand judgement. Review screenshots with `docs/current/visual-qa-checklist.md` before calling the page ready.'
  );

  await writeFile(path.join(outDir, 'report.md'), `${lines.join('\n')}\n`, 'utf8');
}

async function collectMetrics(page, expectedThemeId) {
  return page.evaluate(async ({ expectedThemeId, leakThemeIds }) => {
    function selectorFor(element) {
      if (!element || !element.tagName) return '';
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const className = typeof element.className === 'string'
        ? `.${element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')}`
        : '';
      return `${tag}${id}${className}`.slice(0, 120);
    }

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (!(rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && Number.parseFloat(style.opacity || '1') > 0.05)) {
        return false;
      }

      let parent = element.parentElement;
      while (parent && parent !== document.documentElement) {
        const parentStyle = window.getComputedStyle(parent);
        if (parent.hidden || parent.getAttribute('aria-hidden') === 'true' || parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
          return false;
        }
        const overflow = `${parentStyle.overflow} ${parentStyle.overflowX} ${parentStyle.overflowY}`;
        if (/(hidden|clip|auto|scroll)/.test(overflow)) {
          const parentRect = parent.getBoundingClientRect();
          const intersects = rect.bottom > parentRect.top + 1
            && rect.top < parentRect.bottom - 1
            && rect.right > parentRect.left + 1
            && rect.left < parentRect.right - 1;
          if (!intersects) return false;
        }
        parent = parent.parentElement;
      }
      return true;
    };

    const rectInfo = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        selector: selectorFor(element),
        text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 140),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    function colorToRgb(value) {
      const match = String(value).match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
      if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
      const alpha = parts.length >= 4 ? parts[3] : 1;
      if (alpha < 0.8) return null;
      return parts.slice(0, 3).map((part) => Math.max(0, Math.min(255, part)));
    }

    function luminance(rgb) {
      const [r, g, b] = rgb.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function contrastRatio(foreground, background) {
      const fg = colorToRgb(foreground);
      const bg = colorToRgb(background);
      if (!fg || !bg) return null;
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const light = Math.max(l1, l2);
      const dark = Math.min(l1, l2);
      return (light + 0.05) / (dark + 0.05);
    }

    async function isPaintVisible(element) {
      const startX = window.scrollX;
      const startY = window.scrollY;
      element.scrollIntoView({ block: 'center', inline: 'center' });
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect();
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + Math.min(12, rect.width / 3), rect.top + Math.min(12, rect.height / 3)],
        [rect.right - Math.min(12, rect.width / 3), rect.bottom - Math.min(12, rect.height / 3)],
      ];
      const visible = points.some(([x, y]) => {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
        const topElement = document.elementFromPoint(x, y);
        return topElement === element || element.contains(topElement) || topElement?.contains(element);
      });
      window.scrollTo(startX, startY);
      return visible;
    }

    const title = document.title || '';
    const bodyText = document.body?.innerText || '';
    const lowerTitle = title.toLowerCase();
    const lowerBody = bodyText.toLowerCase();
    const h1s = Array.from(document.querySelectorAll('h1')).filter(isVisible);
    const h2s = Array.from(document.querySelectorAll('h2')).filter(isVisible);
    const firstH1Font = h1s[0] ? Number.parseFloat(window.getComputedStyle(h1s[0]).fontSize || '0') : 0;
    const loudH2s = h2s
      .filter((heading) => Number.parseFloat(window.getComputedStyle(heading).fontSize || '0') > firstH1Font + 4)
      .slice(0, 6)
      .map(rectInfo);

    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
    const horizontalOverflow = Math.max(0, Math.round(scrollWidth - window.innerWidth));
    const overflowElements = Array.from(document.querySelectorAll('body *'))
      .filter(isVisible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 2 || rect.left < -2;
      })
      .slice(0, 20)
      .map(rectInfo);

    const visibleImages = Array.from(document.images).filter(isVisible);
    const brokenImages = [];
    const hiddenBrokenImages = [];
    for (const img of visibleImages.filter((candidate) => !candidate.complete || candidate.naturalWidth === 0 || candidate.naturalHeight === 0).slice(0, 40)) {
      const info = { ...rectInfo(img), src: img.currentSrc || img.src || '' };
      if (await isPaintVisible(img)) brokenImages.push(info);
      else hiddenBrokenImages.push(info);
    }

    const cropRiskImages = visibleImages
      .map((img) => {
        const rect = img.getBoundingClientRect();
        const renderedRatio = rect.width / Math.max(1, rect.height);
        const naturalRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
        const ratioDelta = Math.abs(Math.log(renderedRatio / Math.max(0.01, naturalRatio)));
        const style = window.getComputedStyle(img);
        return {
          ...rectInfo(img),
          src: img.currentSrc || img.src || '',
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          objectFit: style.objectFit,
          objectPosition: style.objectPosition,
          ratioDelta: Number(ratioDelta.toFixed(2)),
        };
      })
      .filter((img) => img.width > 160 && img.height > 120 && img.ratioDelta > 0.7)
      .slice(0, 12);

    const buttonLike = Array.from(document.querySelectorAll('button, a.button, a.btn, [role="button"], input[type="submit"]'))
      .filter(isVisible);
    const smallTargets = buttonLike
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 36;
      })
      .slice(0, 20)
      .map(rectInfo);

    const lowContrastActions = buttonLike
      .map((element) => {
        const style = window.getComputedStyle(element);
        const ratio = contrastRatio(style.color, style.backgroundColor);
        return { ...rectInfo(element), ratio: ratio ? Number(ratio.toFixed(2)) : null };
      })
      .filter((item) => item.ratio !== null && item.ratio < 3)
      .slice(0, 12);

    const visibleFields = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="range"]):not([type="submit"]):not([type="button"]), textarea, select'))
      .filter(isVisible);
    const weakFields = visibleFields
      .map((element) => {
        const style = window.getComputedStyle(element);
        const borderWidth = Number.parseFloat(style.borderTopWidth || '0') + Number.parseFloat(style.borderBottomWidth || '0');
        const contrast = contrastRatio(style.color, style.backgroundColor);
        return {
          ...rectInfo(element),
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderWidth,
          contrast: contrast ? Number(contrast.toFixed(2)) : null,
        };
      })
      .filter((field) => field.borderWidth < 1 || (field.contrast !== null && field.contrast < 4.5))
      .slice(0, 12);

    const nestedCards = Array.from(document.querySelectorAll('[class*="card" i] [class*="card" i]'))
      .filter(isVisible)
      .slice(0, 12)
      .map(rectInfo);

    const urlAttributes = [];
    for (const element of Array.from(document.querySelectorAll('[src], [srcset], [href], [style]'))) {
      for (const attr of ['src', 'srcset', 'href', 'style']) {
        const value = element.getAttribute(attr);
        if (value && /140732760123|140760219707|141105463355/.test(value)) {
          urlAttributes.push({ selector: selectorFor(element), attr, value: value.slice(0, 300) });
        }
      }
    }
    const leakedThemeAssets = expectedThemeId
      ? []
      : urlAttributes.filter((entry) => leakThemeIds.some((id) => entry.value.includes(id))).slice(0, 20);

    const iframes = Array.from(document.querySelectorAll('iframe'))
      .filter(isVisible)
      .slice(0, 12)
      .map((iframe) => ({
        ...rectInfo(iframe),
        src: iframe.src || '',
        title: iframe.title || '',
      }));

    return {
      title,
      bodyLength: bodyText.length,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: {
        width: scrollWidth,
        height: Math.max(doc.scrollHeight, body?.scrollHeight || 0),
        horizontalOverflow,
      },
      h1Count: h1s.length,
      firstH1: h1s[0]?.innerText?.trim().replace(/\s+/g, ' ').slice(0, 180) || '',
      firstH1Font,
      loudH2s,
      pageNotFoundSignals: lowerTitle.includes('404') || lowerTitle.includes('not found') || lowerBody.includes('page not found'),
      overflowElements,
      imageCount: visibleImages.length,
      brokenImages,
      hiddenBrokenImages,
      cropRiskImages,
      smallTargets,
      lowContrastActions,
      weakFields,
      nestedCards,
      leakedThemeAssets,
      iframes,
    };
  }, { expectedThemeId, leakThemeIds: LEAK_THEME_IDS });
}

function classifyFindings({ status, serverTiming, expectedThemeId, consoleErrors, pageErrors, requestFailures, metrics }) {
  const failures = [];
  const warnings = [];

  if (typeof status === 'number' && status >= 400) failures.push(`HTTP status ${status}`);
  if (metrics?.pageNotFoundSignals) failures.push('Page looks like a 404/not-found route');
  if (expectedThemeId && !String(serverTiming || '').includes(expectedThemeId)) failures.push(`Preview theme ${expectedThemeId} not proven in server-timing header`);
  if (!metrics?.h1Count) failures.push('No visible H1 found');
  if (metrics?.h1Count > 1) warnings.push(`${metrics.h1Count} visible H1 elements found`);
  const hasPageOverflow = metrics?.scroll?.horizontalOverflow > 2;
  if (hasPageOverflow) failures.push(`Horizontal overflow: ${metrics.scroll.horizontalOverflow}px`);

  if (hasPageOverflow) {
    for (const item of metrics?.overflowElements || []) failures.push(`Overflow element ${item.selector} (${item.left}-${item.right}px): ${item.text || 'no text'}`);
  }
  for (const item of metrics?.brokenImages || []) {
    const thirdPartyReviewAvatar = item.src.includes('lh3.googleusercontent.com') || item.selector.includes('grp-entangle');
    const message = `Broken visible image ${item.selector}: ${item.src}`;
    if (thirdPartyReviewAvatar) warnings.push(message);
    else failures.push(message);
  }
  for (const item of metrics?.hiddenBrokenImages || []) {
    warnings.push(`Broken hidden/collapsed image ${item.selector}: ${item.src}`);
  }
  for (const item of metrics?.leakedThemeAssets || []) failures.push(`Live page references sandbox/retired theme asset ID in ${item.selector} ${item.attr}`);
  for (const error of pageErrors.slice(0, 5)) failures.push(`Page error: ${error}`);
  for (const request of requestFailures.filter((item) => ['document', 'script', 'stylesheet', 'image'].includes(item.resourceType)).slice(0, 10)) warnings.push(`Failed ${request.resourceType}: ${request.url} (${request.errorText})`);
  for (const error of consoleErrors.slice(0, 8)) warnings.push(`Console error: ${error}`);
  for (const item of metrics?.cropRiskImages || []) warnings.push(`Image crop/aspect risk ${item.selector} ratioDelta=${item.ratioDelta} fit=${item.objectFit} pos=${item.objectPosition}`);
  for (const item of metrics?.smallTargets || []) warnings.push(`Small action target ${item.selector} ${item.width}x${item.height}: ${item.text || 'no text'}`);
  for (const item of metrics?.lowContrastActions || []) warnings.push(`Low-contrast action ${item.selector} ratio=${item.ratio}: ${item.text || 'no text'}`);
  for (const item of metrics?.weakFields || []) warnings.push(`Weak visible form field ${item.selector}: borderWidth=${item.borderWidth}, contrast=${item.contrast}`);
  for (const item of metrics?.loudH2s || []) warnings.push(`H2 may overpower H1 ${item.selector}: ${item.text || 'no text'}`);
  for (const item of metrics?.nestedCards || []) warnings.push(`Nested card-like UI ${item.selector}: ${item.text || 'no text'}`);

  return { failures, warnings };
}

async function warmPageForScreenshots(page) {
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    const step = Math.max(300, Math.floor(window.innerHeight * 0.75));
    for (let y = 0; y < height; y += step) {
      window.scrollTo(0, y);
      await delay(120);
    }
    window.scrollTo(0, 0);
    await delay(250);
  });
}

async function auditViewport(browser, routeInput, url, viewport, outDir, args) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(args.timeout);

  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message.slice(0, 300));
  });
  page.on('requestfailed', (request) => {
    requestFailures.push({
      url: request.url().slice(0, 300),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText || 'unknown',
    });
  });

  let response = null;
  let metrics = null;
  let screenshot = null;
  let navigationError = null;

  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeout });
    await page.waitForLoadState('networkidle', { timeout: Math.min(args.timeout, 10000) }).catch(() => {});
    await page.waitForTimeout(600);
    await warmPageForScreenshots(page);
    metrics = await collectMetrics(page, args.themeId);
    const screenshotName = `${slugForUrl(url)}--${viewport.name}.png`;
    screenshot = path.join(outDir, 'screenshots', screenshotName);
    await page.screenshot({ path: screenshot, fullPage: true });
  } catch (error) {
    navigationError = error.message;
  } finally {
    await context.close();
  }

  const serverTiming = response?.headers()?.['server-timing'] || '';
  const status = response?.status();
  const { failures, warnings } = classifyFindings({
    status,
    serverTiming,
    expectedThemeId: args.themeId,
    consoleErrors,
    pageErrors,
    requestFailures,
    metrics,
  });
  if (navigationError) failures.unshift(`Navigation/screenshot failed: ${navigationError}`);

  return {
    routeInput,
    url,
    viewport,
    status,
    finalUrl: response?.url() || null,
    serverTiming,
    navigationError,
    metrics,
    consoleErrors,
    pageErrors,
    requestFailures,
    failures,
    warnings,
    screenshot,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const stamp = timestampParts();
  const outDir = args.outDir
    ? path.resolve(repoRoot, args.outDir)
    : path.join(repoRoot, 'reference', 'evidence', stamp.date, `website-visual-audit-${stamp.compact}`);
  await mkdir(path.join(outDir, 'screenshots'), { recursive: true });

  const routeInputs = await loadRoutes(args);
  const routes = routeInputs.map((route) => ({
    input: route,
    url: normalizeUrl(route, args.baseUrl, args.themeId, stamp.compact),
    viewports: [],
  }));

  const browser = await chromium.launch({ headless: true });
  try {
    for (const route of routes) {
      for (const viewport of VIEWPORTS) {
        const result = await auditViewport(browser, route.input, route.url, viewport, outDir, args);
        route.viewports.push(result);
        const status = result.failures.length ? 'FAIL' : 'OK';
        console.log(`${status} ${viewport.name} ${route.input} failures=${result.failures.length} warnings=${result.warnings.length}`);
      }
    }
  } finally {
    await browser.close();
  }

  const summary = severityCounts(routes);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    themeId: args.themeId,
    viewports: VIEWPORTS,
    outDir,
    summary,
    routes,
  };
  await writeReports(report, outDir);

  console.log(`Report: ${path.join(outDir, 'report.md')}`);
  console.log(`Screenshots: ${path.join(outDir, 'screenshots')}`);
  console.log(`Failures: ${summary.failures}`);
  console.log(`Warnings: ${summary.warnings}`);

  if (summary.failures > 0 && !args.soft) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
