# Website Visual Audit Protocol

Status: active scan protocol.
Purpose: give the Website Agent one repeatable way to inspect the whole Innate website for theme consistency, layout defects, wrong-route problems, and obvious polish misses before it tells Guido the site or a page is visually clear.

This protocol does not approve Shopify writes. It is a read-only verification path unless Guido separately approves a scoped fix.

## When To Use

Use this when Guido asks for:

- a whole-site scan;
- theme consistency;
- formatting errors;
- visual QA after a broad website change;
- proof that desktop, tablet/intermediate, and mobile views have been checked.

Use `docs/current/visual-qa-checklist.md` for the final design judgement after this scan produces artifacts.

## First Principles

The agent is not allowed to trust intent. It must prove the exact rendered page:

- right source: live URL, preview URL, local route, Shopify Admin/content, or exact theme asset;
- right version: live theme or named preview/sandbox role checked in `docs/current/site-state.md`;
- right route: final URL and status are not a hidden 404 or redirect surprise;
- right views: desktop, awkward tablet/intermediate, and real mobile width;
- right evidence: screenshots plus a machine-readable report saved under `reference/evidence/`;
- right conclusion: defects become caveats or fix tasks, not "ready" claims.

## Default Command

Run from `/Users/mack-mini/innate-mission-control`:

```bash
npm run audit:website-visual -- --base-url https://innatefurniture.co.nz
```

For preview-theme proof, pass the exact approved theme:

```bash
npm run audit:website-visual -- --base-url https://innatefurniture.co.nz --theme-id 141105463355
```

For a focused URL:

```bash
npm run audit:website-visual -- --url /pages/benchtops
```

## Default Route Set

The scanner covers these buyer-critical surfaces by default:

- `/`
- `/collections/dining-tables`
- `/collections/outdoor`
- `/pages/benchtops`
- `/pages/commercial-1`
- `/pages/our-story`
- `/pages/contact`

If the request mentions a product, collection, blog, or newly staged page, add it with `--url`. If the route set itself is in question, regenerate a fresh inventory from sitemap/live crawl evidence before calling the scan complete.

## Required Viewports

The scan uses:

- desktop: 1440 x 1000;
- tablet-wide: 1024 x 900;
- tablet: 768 x 900;
- mobile: 390 x 844.

Do not replace the mobile check with only a desktop screenshot. Do not skip intermediate widths; many previous misses were not pure desktop/mobile failures.

## What The Scanner Checks

The scanner records and flags:

- HTTP status, final URL, page title, H1 count, and first H1;
- screenshot evidence for each route and viewport;
- horizontal overflow and the elements causing it;
- missing or broken visible images;
- visible image aspect/crop risk signals;
- visible form fields with weak borders/backgrounds;
- small button/tap targets;
- H2s that visually overpower H1s;
- nested card-like UI;
- obvious 404/page-not-found states;
- console/page errors and failed network requests;
- sandbox/retired theme asset IDs leaking into live pages.

These are guardrails, not taste. After the scan, open the saved screenshots and apply `visual-qa-checklist.md` for composition, rhythm, crop quality, copy hierarchy, and brand fit.

## Pair With Theme Checks

For Shopify Liquid, JSON template, section, snippet, or theme-setting changes, this visual scan is not enough on its own. Also run the available Shopify/theme lint or readback checks for the edited files, such as Shopify Theme Check through the Shopify CLI when it is configured for the target theme. Theme linting catches syntax, missing-template, deprecated-tag, and theme-structure problems that screenshots may miss.

## Pass/Fail

A scan is not visually clear if:

- the scanner cannot load the route;
- any required viewport is missing;
- route identity is uncertain;
- a preview theme ID cannot be proven where required;
- the page is a 404 workaround but is reported as a clean draft;
- mobile overflow or broken visible images remain;
- screenshots were generated but not reviewed.

If issues are found, report:

- what failed;
- which route and viewport;
- whether live was touched;
- the smallest scoped fix or next approval needed.

## Evidence Location

The script saves:

- `report.md`
- `report.json`
- `screenshots/*.png`

under:

```text
reference/evidence/YYYY-MM-DD/website-visual-audit-YYYYMMDD-HHMMSS/
```

Use that folder in handoffs instead of dumping raw terminal output into Telegram.

## Handoff Shape

```text
Website visual scan

Scope:
- base URL:
- routes:
- viewports:

Result:
- pass/fail:
- issue count:
- evidence folder:

Key findings:
- ...

Live touched:
- no

Next:
- ...
```
