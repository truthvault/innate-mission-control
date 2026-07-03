#!/usr/bin/env node
// Lightweight Vercel production deploy guard.
// This project has a Vercel build command that invokes this script before `npm run build`.
// Keep this guard side-effect free: it should only fail on clearly dangerous conditions.

const forbiddenEnv = [
  'SHOPIFY_FLAG_LIVE_PUBLISH_APPROVED',
  'SHOPIFY_LIVE_DELETE_APPROVED',
];

for (const key of forbiddenEnv) {
  if (process.env[key] && process.env[key] !== '0' && process.env[key].toLowerCase?.() !== 'false') {
    console.error(`Blocked production deploy: unexpected live Shopify override env ${key} is set.`);
    process.exit(1);
  }
}

console.log('OK: Vercel production deploy guard passed.');
