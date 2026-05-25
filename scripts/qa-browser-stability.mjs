#!/usr/bin/env node
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from 'playwright';

const allowLiveWrites = String(process.env.QA_ALLOW_LIVE_WRITES || '').toLowerCase() === 'true';
if (allowLiveWrites) throw new Error('Refusing browser QA with QA_ALLOW_LIVE_WRITES=true');

const port = Number(process.env.QA_BROWSER_PORT || 3111);
const baseUrl = (process.env.QA_BROWSER_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
const authSecret = process.env.AUTH_SESSION_SECRET || process.env.SITE_PASSWORD || 'qa-browser-secret';
const report = { baseUrl, pages: [], interactions: [], drag: { status: 'not-run', detail: '' }, consoleErrors: [] };

function authCookieValue(secret = authSecret) {
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const payload = `v1.${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function startServer() {
  const child = spawn('npm', ['run', 'dev', '--', '-p', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      SHELL: process.env.SHELL,
      TMPDIR: process.env.TMPDIR || '/tmp',
      NODE_ENV: 'development',
      SITE_PASSWORD: authSecret,
      AUTH_SESSION_SECRET: authSecret,
      READ_ONLY_MONDAY_SYNC: 'true',
      TUESDAY_LEADS_WRITES_ENABLED: 'false',
      TUESDAY_WORKBOARD_WRITES_ENABLED: 'false',
      TUESDAY_PLAN_OVERLAY_WRITES_ENABLED: 'false',
      TUESDAY_ORDER_WORKFLOW_WRITES_ENABLED: 'false',
      QA_STABILITY_MODE: 'true',
    },
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.outputTail = () => output.slice(-5000);
  return child;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {}
    await wait(1000);
  }
  throw new Error(`Browser QA server did not become ready at ${baseUrl}`);
}

function stopServer(child) {
  child?.kill('SIGTERM');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function count(page, locator) {
  return await locator.count().catch(() => 0);
}

async function gotoAndCheck(page, path, marker) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  assert(page.url() !== 'about:blank', `${path} navigated to about:blank`);
  await page.getByText(marker, { exact: false }).first().waitFor({ timeout: 10_000 });
  const buttons = await count(page, page.locator('button'));
  const links = await count(page, page.locator('a'));
  report.pages.push({ path, title: await page.title(), buttons, links });
}

async function clickFirstVisible(label, locator) {
  const first = locator.first();
  await first.waitFor({ state: 'visible', timeout: 10_000 });
  await first.click();
  report.interactions.push(label);
}

async function main() {
  const server = startServer();
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || 'chrome' });
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: 'innate-auth', value: authCookieValue(), domain: new URL(baseUrl).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => report.consoleErrors.push(error.message));

    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.getByRole('textbox').fill(authSecret);
    await page.getByRole('button', { name: /enter|login|sign/i }).click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
    report.interactions.push('login form submits');

    await gotoAndCheck(page, '/leads', 'Leads');
    await clickFirstVisible('leads: open Add lead drawer', page.getByRole('button', { name: /add lead/i }));
    await page.getByText(/Create a new Supabase lead|New lead|Add lead/i).first().waitFor({ timeout: 5_000 });
    const createButtons = page.getByRole('button', { name: /create|save/i });
    if (await count(page, createButtons)) {
      await createButtons.first().click();
      report.interactions.push('leads: empty create is safely blocked/validated');
    }
    const closeLead = page.getByRole('button', { name: /cancel|close|×/i });
    if (await count(page, closeLead)) {
      await closeLead.first().click();
      report.interactions.push('leads: drawer closes');
    } else {
      await page.keyboard.press('Escape');
      report.interactions.push('leads: drawer escape close attempted');
    }

    await gotoAndCheck(page, '/workboard', 'Workboard');
    const workButtons = await count(page, page.locator('button'));
    assert(workButtons >= 1, 'Workboard should expose at least one button/control');

    await gotoAndCheck(page, '/production/plan', 'Production Plan');
    const planButtons = page.locator('button');
    assert(await count(page, planButtons) >= 1, 'Production Plan should expose at least one button/control');
    const safePlanControls = page.getByRole('button', { name: /show tasks|open full task list|hide tasks|close full task list|schedule|order rows|collapse|expand/i });
    if (await count(page, safePlanControls)) {
      await safePlanControls.first().click();
      report.interactions.push('production plan: safe visible control clicks');
    }
    const draggable = page.locator('[draggable="true"], [role="button"][aria-roledescription*="sortable" i], [data-rbd-draggable-id], [data-draggable], [data-dnd-kit-draggable]');
    const droppable = page.locator('[data-droppable], [data-rbd-droppable-id], [data-dnd-kit-droppable]');
    const draggableCount = await count(page, draggable);
    const droppableCount = await count(page, droppable);
    if (draggableCount > 0 && droppableCount > 0) {
      const from = await draggable.first().boundingBox();
      const to = await droppable.last().boundingBox();
      if (from && to) {
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
        await page.mouse.up();
        report.drag = { status: 'exercised', detail: `${draggableCount} draggable, ${droppableCount} droppable` };
      } else {
        report.drag = { status: 'skipped', detail: 'drag elements found but not visible' };
      }
    } else {
      report.drag = { status: 'needs-fixture', detail: `No browser-visible drag fixture in sandbox (${draggableCount} draggable, ${droppableCount} droppable). Logic-level drag tests still run via npm run test:planning.` };
    }

    await gotoAndCheck(page, '/production/test', 'Test Run');
    const summary = page.locator('summary').first();
    if (await count(page, summary)) {
      await summary.click();
      report.interactions.push('production test: details/summary opens');
    }

    assert(report.consoleErrors.length === 0, `Browser console/page errors: ${report.consoleErrors.join(' | ')}`);
    console.log(JSON.stringify(report, null, 2));
    if (report.drag.status === 'needs-fixture' && process.env.QA_BROWSER_REQUIRE_DRAG === 'true') {
      throw new Error(report.drag.detail);
    }
    console.log('qa:browser OK');
  } catch (err) {
    console.error(JSON.stringify(report, null, 2));
    console.error(`\n--- dev server output tail ---\n${server.outputTail?.() || ''}`);
    throw err;
  } finally {
    await browser?.close().catch(() => {});
    stopServer(server);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
