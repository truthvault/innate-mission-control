#!/usr/bin/env node
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const allowLiveWrites = String(process.env.QA_ALLOW_LIVE_WRITES || '').toLowerCase() === 'true';
if (allowLiveWrites) {
  throw new Error('Refusing stability QA with QA_ALLOW_LIVE_WRITES=true');
}

const shouldStartServer = process.env.QA_START_SERVER !== 'false';
const port = Number(process.env.QA_PORT || 3110);
const baseUrl = (process.env.QA_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const authSecret = process.env.AUTH_SESSION_SECRET || process.env.SITE_PASSWORD || 'qa-stability-secret';
const protectedRoutes = ['/', '/today', '/leads', '/workboard', '/production', '/production/plan', '/production/samples', '/production/dispatch', '/production/test', '/freight-quotes', '/configurator'];
const publicRoutes = ['/login'];
const routeExpectations = new Map([
  ['/', { status: [307, 200], markers: [] }],
  ['/login', { status: [200], markers: ['Tuesday'] }],
  ['/today', { status: [200], markers: ['Owner Daily Brief', 'Tuesday'] }],
  ['/leads', { status: [200], markers: ['Leads', 'Add lead'] }],
  ['/workboard', { status: [200], markers: ['Workboard'] }],
  ['/production', { status: [200], markers: ['Production'] }],
  ['/production/plan', { status: [200], markers: ['Production Plan'] }],
  ['/production/samples', { status: [200], markers: ['Sample'] }],
  ['/production/dispatch', { status: [200], markers: ['Dispatch'] }],
  ['/production/test', { status: [200], markers: ['Tuesday'] }],
  ['/freight-quotes', { status: [200], markers: ['Freight'] }],
  ['/configurator', { status: [200], markers: ['Configurator'] }],
]);
const safeMutationProbes = [
  { method: 'POST', path: '/api/leads', body: null, expect: [400, 403, 307] },
  { method: 'PATCH', path: '/api/leads/qa-stability-nonexistent', body: null, expect: [400, 403, 307] },
  { method: 'PATCH', path: '/api/workboard/tasks/qa-stability-nonexistent', body: null, expect: [400, 403, 307] },
  { method: 'POST', path: '/api/production/plan-task-links', body: null, expect: [400, 403, 307] },
  { method: 'POST', path: '/api/production/order-workflow', body: null, expect: [400, 403, 307] },
  { method: 'DELETE', path: '/api/production/order-photos', body: null, expect: [400, 403, 307] },
];

function authCookie(secret = authSecret) {
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const payload = `v1.${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `innate-auth=${payload}.${signature}`;
}

async function fetchText(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', ...options });
  const text = await response.text().catch(() => '');
  return { response, text };
}

async function waitForServer() {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < 45_000) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await wait(1000);
  }
  throw new Error(`QA server did not become ready at ${baseUrl}. Last error: ${lastError}`);
}

function startServer() {
  if (!shouldStartServer) return null;
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
  child.qaOutput = () => output.slice(-4000);
  return child;
}

function stopServer(child) {
  if (!child) return;
  child.kill('SIGTERM');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const report = { baseUrl, startedServer: shouldStartServer, unauth: [], routes: [], mutationProbes: [], static: {} };
  const server = startServer();
  try {
    await waitForServer();

    for (const path of protectedRoutes.filter((route) => route !== '/')) {
      const { response } = await fetchText(path);
      const location = response.headers.get('location') || '';
      report.unauth.push({ path, status: response.status, location });
      assert(response.status === 307 && location.includes('/login'), `${path} should redirect unauthenticated users to /login, got ${response.status} ${location}`);
    }

    const cookie = authCookie();
    for (const path of [...protectedRoutes, ...publicRoutes]) {
      const expected = routeExpectations.get(path) || { status: [200], markers: [] };
      const { response, text } = await fetchText(path, { headers: protectedRoutes.includes(path) ? { Cookie: cookie } : {} });
      const row = { path, status: response.status, bytes: text.length, buttons: (text.match(/<button\b/gi) || []).length, links: (text.match(/<a\b/gi) || []).length };
      report.routes.push(row);
      assert(expected.status.includes(response.status), `${path} expected status ${expected.status.join('/')} got ${response.status}`);
      for (const marker of expected.markers) {
        assert(text.includes(marker), `${path} missing expected marker: ${marker}`);
      }
      assert(!/about:blank/i.test(text), `${path} rendered about:blank marker`);
    }

    for (const probe of safeMutationProbes) {
      const { response, text } = await fetchText(probe.path, {
        method: probe.method,
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: probe.body == null ? undefined : JSON.stringify(probe.body),
      });
      const row = { method: probe.method, path: probe.path, status: response.status, body: text.slice(0, 120) };
      report.mutationProbes.push(row);
      assert(probe.expect.includes(response.status), `${probe.method} ${probe.path} expected safe failure ${probe.expect.join('/')} got ${response.status}: ${text.slice(0, 200)}`);
      assert(response.status !== 200, `${probe.method} ${probe.path} unexpectedly returned 200 during no-live-write QA`);
    }

    const plan = report.routes.find((route) => route.path === '/production/plan');
    const leads = report.routes.find((route) => route.path === '/leads');
    assert(plan && plan.buttons >= 1, '/production/plan should expose at least one interactive button/control');
    assert(leads && leads.buttons >= 5, '/leads should expose lead filter/action buttons');

    console.log(JSON.stringify(report, null, 2));
    console.log('qa:stability OK');
  } catch (err) {
    console.error(JSON.stringify(report, null, 2));
    if (server?.qaOutput) console.error(`\n--- dev server output tail ---\n${server.qaOutput()}`);
    throw err;
  } finally {
    stopServer(server);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
