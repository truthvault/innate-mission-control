#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const port = Number(process.env.SMOKE_LOCAL_PORT || process.env.PORT || 3000);
const baseUrl = (process.env.SMOKE_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
const sitePassword = process.env.SITE_PASSWORD || 'smoke-test-only';
const serverEnv = {
  ...process.env,
  PORT: String(port),
  SITE_PASSWORD: sitePassword,
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET || sitePassword,
  READ_ONLY_MONDAY_SYNC: 'true',
  TUESDAY_LEADS_WRITES_ENABLED: process.env.TUESDAY_LEADS_WRITES_ENABLED || 'false',
  TUESDAY_WORKBOARD_WRITES_ENABLED: process.env.TUESDAY_WORKBOARD_WRITES_ENABLED || 'false',
  TUESDAY_PLAN_OVERLAY_WRITES_ENABLED: process.env.TUESDAY_PLAN_OVERLAY_WRITES_ENABLED || 'false',
  TUESDAY_ORDER_WORKFLOW_WRITES_ENABLED: process.env.TUESDAY_ORDER_WORKFLOW_WRITES_ENABLED || 'false',
};

function startServer() {
  const child = spawn('npm', ['start'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: serverEnv,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.outputTail = () => output.slice(-6000);
  return child;
}

async function waitForServer(child) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < 45_000) {
    if (child.exitCode !== null) {
      throw new Error(`Local smoke server exited early with ${child.exitCode}.\n${child.outputTail?.() || ''}`);
    }
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await wait(1000);
  }
  throw new Error(`Local smoke server did not become ready at ${baseUrl}. Last error: ${lastError}\n${child.outputTail?.() || ''}`);
}

async function runSmoke() {
  return await new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/smoke-tuesday.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SMOKE_BASE_URL: baseUrl,
        SITE_PASSWORD: sitePassword,
        AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET || sitePassword,
      },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`smoke:tuesday exited with ${code}`));
    });
  });
}

const server = startServer();
try {
  await waitForServer(server);
  await runSmoke();
  console.log(`smoke:tuesday:local OK (${baseUrl}, READ_ONLY_MONDAY_SYNC=true)`);
} catch (err) {
  console.error(`\n--- local smoke server output tail ---\n${server.outputTail?.() || ''}`);
  throw err;
} finally {
  server.kill('SIGTERM');
}
