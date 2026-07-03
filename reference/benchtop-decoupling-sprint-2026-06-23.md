# Benchtop configurator decoupling sprint — 2026-06-23

## Goal

Decouple the Shopify-embedded benchtop configurator from `https://innate-benchtop-quote.vercel.app` so the old standalone app can be retired safely.

## Safety rules

- Do not change live Shopify without explicit live approval.
- Do not delete or disable the old Vercel app until live network QA proves zero dependency.
- Do not overwrite current visible Shopify/page images. New timber assets are isolated under Mission Control `public/timbers/**` and keep the same runtime paths expected by the configurator.
- Do not send real quote emails during QA unless Guido separately approves a test send and recipient.
- Keep secrets server-side; never put Google/Mainfreight/Resend keys into Shopify theme JS.

## Current dependency inventory

Live Shopify section `sections/benchtops-atelier.liquid` mounts the embedded app with:

- `data-api-base="https://innate-benchtop-quote.vercel.app"`
- `data-asset-base="https://innate-benchtop-quote.vercel.app"`

Runtime dependencies still on the old app:

| Type | Path | Purpose |
| --- | --- | --- |
| Asset | `/timbers/rimu.jpg?v=5` | Rimu preview texture |
| Asset | `/timbers/totara.jpg?v=6` | Tōtara preview texture |
| Asset | `/timbers/beech.jpg?v=5` | Beech preview texture |
| Asset | `/timbers/selection/{species}-{colour}.jpg` | Material selector swatches |
| API | `/api/address-autocomplete` | Google Places autocomplete proxy |
| API | `/api/address-details` | Google Place ID → lat/lng/address components |
| API | `/api/freight-estimate` | Benchtop delivery estimate |
| API | `/api/send-quote` | Share/send benchtop quote |

## Implemented locally in Mission Control

Assets copied from the currently live old app into:

- `public/timbers/rimu.jpg`
- `public/timbers/totara.jpg`
- `public/timbers/beech.jpg`
- `public/timbers/selection/*.jpg`
- `public/timbers/asset-manifest-20260623.json`

Backend compatibility routes added:

- `app/api/address-autocomplete/route.ts`
- `app/api/address-details/route.ts`
- `app/api/freight-estimate/route.ts`
- `app/api/send-quote/route.ts`

Shared code added/updated:

- `lib/benchtops/benchtopFreightPackages.ts`
- `lib/benchtops/dispatchDate.ts`
- `lib/freight/mainfreightRate.ts` accepts benchtop package lines as well as dining lines.
- `proxy.ts` allows storefront public asset/API access without Tuesday login redirect.

## Local verification so far

- `npx tsc --noEmit --pretty false` passes.
- Local static asset `/timbers/beech.jpg` returns HTTP 200 and 78,055 bytes from Mission Control.
- Local `/api/freight-estimate` with Christchurch dry-run/local delivery returns HTTP 200 JSON and `$150` Pinpoint/local estimate.
- Local `/api/send-quote` dry-run returns HTTP 200 JSON and renders subject/text/html preview without sending email.
- Local address autocomplete currently returns 503 because Mission Control local `.env.local` does not include a Google Places key; old Vercel endpoint returns valid predictions, so the deployment must receive the same Google env before live cutover.

## Required before live cutover

1. Deploy a Mission Control preview with these routes/assets.
2. Confirm preview deployment env has Google Places, Mainfreight and Resend vars configured. Redact values in reports.
3. Patch Shopify preview theme only:
   - `api_base` → new Mission Control preview/prod origin.
   - `asset_base` → new Mission Control preview/prod origin.
   - include the Beech edge overscan fix in the configurator asset.
4. QA desktop/mobile:
   - no network calls to `innate-benchtop-quote.vercel.app`,
   - all 12 timber images load from new host,
   - address autocomplete/details work,
   - freight local + non-local paths return expected JSON,
   - share modal validates and dry-run API works without email send,
   - Beech Clear edge has no visible pale line.
5. Ask for live approval with exact scoped assets/settings to copy.
6. After live verification, retire old app only after a final search/network proof shows no dependency.
