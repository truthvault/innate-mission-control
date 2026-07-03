# Innate Freight Checker Hardening Configuration

Last updated: 2026-06-28

Purpose: durable repo reference for future Mission Control sessions working on the customer-facing Innate freight checker.

## Live systems

- Mission Control production base: `https://innate-mission-control.vercel.app`
- Storefront origin: `https://innatefurniture.co.nz`
- Customer-facing freight routes live under `/api/freight/*` in Mission Control.
- Server-side Google Places, Mainfreight, Supabase, Airtable, and email credentials must never be exposed to Shopify or logs.

## Approved hardening direction

Future protected mode should require:

1. allowed Innate/Shopify storefront `Origin` or parsed `Referer`, and
2. valid freight public anti-abuse token.

The freight public token is not a true secret once embedded in Shopify JavaScript. Treat it as a publishable anti-abuse marker, not authentication by itself.

## Current rollout rule

Do not enable `FREIGHT_PUBLIC_ACCESS_TOKEN` or `FREIGHT_PUBLIC_REQUEST_TOKEN` in production until the Shopify caller has been updated and tested to send the token.

Safe order:

1. Deploy Mission Control code that supports stricter token mode.
2. Leave the production token env unset.
3. Smoke test current no-token fallback from the live Shopify origin.
4. Update Shopify caller from JSONP/query-token compatibility toward `fetch` + `X-Innate-Freight-Token` after live/staging theme source-of-truth checks.
5. Test the Shopify caller with the token.
6. Only then enable the production freight public token env.
7. Re-run live smoke immediately.

## Expected access behaviour

No token configured:

- Allowed Origin/Referer passes.
- Bad Origin fails.
- Missing Origin/Referer fails.

Token configured:

- Allowed Origin/Referer + valid token passes.
- Allowed Origin/Referer + missing/wrong token fails.
- Valid token from bad Origin fails.
- Valid token with missing Origin/Referer fails.

Preferred token transport:

- `X-Innate-Freight-Token` header.

Legacy compatibility only:

- `freightToken` / `freight_token` query param for JSONP-era callers.
- Retire this after Shopify has moved to `fetch`.

## Smoke commands

Production fallback smoke:

```bash
SMOKE_BASE_URL=https://innate-mission-control.vercel.app \
SMOKE_FREIGHT_ORIGIN=https://innatefurniture.co.nz \
node scripts/smoke-freight.mjs
```

Expected current output shape:

```text
Freight smoke OK (https://innate-mission-control.vercel.app)
- address-autocomplete allowed-origin JSON: 200
- dining-estimate POST dry-run: 200
- dining-estimate GET JSONP: 200
- dining-estimate disallowed-origin guard: 400
- dining-estimate no-origin guard: 400
- address-autocomplete no-origin guard: 400
- dining-estimate invalid input controlled error: 400
```

Local helper check:

```bash
node --experimental-strip-types scripts/check-freight-public-access.mjs
```

## Approval gates

Require explicit approval before:

- setting or changing production freight token env vars,
- changing Vercel WAF/rate-limit configuration,
- deploying further Mission Control changes,
- editing or publishing Shopify theme assets,
- retiring JSONP/query-token compatibility.
