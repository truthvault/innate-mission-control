# Visual QA Checklist

Status: active proof protocol.
Purpose: prevent Website agents from calling a page ready based on code confidence, DOM checks, or one lucky desktop screenshot.

Use this before telling Guido a Website page, section, preview, or visual fix is ready.

For broad requests such as "scan the whole website", "check the theme consistency", or "find formatting errors", first use `docs/current/website-visual-audit-protocol.md` and run `npm run audit:website-visual`. This checklist is still the judgement layer after the scanner has produced screenshots and a report.

## Required Proof Packet

Report or retain proof for:

- target source: live URL, preview URL, screenshot, local route, Shopify Admin/content, or exact theme asset;
- final URL or artifact checked;
- live touched: yes/no;
- files or admin objects changed;
- viewport screenshots or attached proof;
- Shopify editability summary;
- known caveats or blockers.

For local Mac mini review links, do not give Guido `localhost`. Use the Mac mini Tailscale URL/hostname and verify the exact URL.

## Route And Source Truth

Before visual judgement:

- confirm the exact URL/path Guido will open;
- confirm whether it is live, preview/sandbox, local draft, or visual workaround;
- record HTTP status/final URL where useful;
- for Shopify preview pages, confirm the expected preview theme where possible;
- if the page is a 404 workaround, say so plainly and do not call it a clean draft route;
- do not use local files as evidence for a live problem unless just pulled from or compared with the exact target theme.

## Required Views

Use these defaults unless the defect needs a different viewport:

- Desktop: 1440px wide first viewport.
- Intermediate/tablet: 768px or 1024px wide first viewport. Do not skip awkward in-between widths.
- Mobile: 390px wide first viewport.
- Page-level work: capture or inspect at least one mid-page section, especially the most complex or image-heavy section.
- Full-page edits: inspect top to footer on mobile with overlapping screenshots or equivalent section-by-section proof.

## Visual Checks

Check these directly in screenshots/browser, not only in code:

- header, announcement bar, nav, and hero feel calm together;
- H1 size fits the page family;
- H2s are not louder than the page title;
- no awkward heading wraps or single-word tail lines;
- CTAs are visible in a sensible order;
- buttons are clear, aligned, and not over-styled;
- section spacing has no dead zones;
- cards are clean, stable, and not nested;
- forms have visible fields, readable placeholders, borders, and focus states;
- accordions match the dining standard;
- Google Reviews match the homepage style;
- no raw app/widget/form/newsletter styling;
- no horizontal overflow on mobile;
- no key information was removed just to make the page cleaner.

## Image And Media Checks

For every key hero/proof/product/material image:

- image is real, useful, and not AI-looking unless approved;
- crop protects faces, heads, hands, tools, furniture edges, timber detail, and room context;
- rendered box/aspect ratio is stable;
- image does not become visually useless on mobile or intermediate widths;
- new/replaced live images use a permanent source: Shopify Files, live theme asset, product media, or approved external app;
- no live page depends on staging theme asset URLs.

For image zoom/lightbox work:

- popup has top breathing room;
- close button is visible and inside the image at top right;
- no unnecessary frame unless needed;
- no mobile overflow;
- labels/arrows only appear for like-sized image sets;
- small swatches do not jump into a large carousel experience.

## Shopify Editability Check

Before review, confirm what Guido can edit:

- page text;
- images;
- links;
- cards;
- FAQs;
- proof points;
- forms or form labels where practical;
- section/block order.

Say what remains code-controlled. A polished page should still behave like a usable Shopify theme page, not a locked custom build.

## Configurator-Specific QA

For benchtop/configurator changes, verify desktop and mobile:

- canvas selection;
- detail/editor row selection;
- mobile piece tab selection;
- selected-object rotate target;
- canvas-to-card/tab selection;
- card/tab-to-canvas selection;
- after adding or copying a second piece, rotating the selected second piece does not rotate or change the first piece;
- quote/result clarity still matches the current source logic.

Do not change calculations or source data during visual work unless explicitly approved.

## Live-vs-Preview Deep Parity Gate

For any preview candidate that should preserve the current live website while changing behaviour underneath, run a Deep Parity QA packet before calling it ready for Guido review or live-candidate approval.

Minimum proof:

- pull/compare exact live vs preview Shopify assets/templates;
- test the rendered live URL and preview URL at desktop, laptop/intermediate, tablet, mobile, and short mobile;
- exercise the relevant full flow, including initial load, add/copy pieces, select via canvas/card/mobile tab, rotate selected panel, drag selected and overlapping panels, resize, size edits, timber/finish, quantity/cutouts, delivery/review button state;
- compare visual parity: panel scale/position, live design surface height, handles, rotate controls, dimension labels, mobile sheets, sticky bars, images, overflow, and proof-harness/stale UI text;
- compare state parity: active canvas panel, active row/card, active tab, selected rotate target, orientation text, dimensions, price text, and intercepted quote/network calls;
- save screenshots plus machine-readable results under `reference/evidence/`;
- for the Timber Panels/benchtop configurator, run `npm run audit:benchtop-deep-parity` from `/Users/mack-mini/innate-mission-control` and treat any non-zero exit as a blocker;
- report each difference as intended or unintended, with risk and fix-needed status.

If any unintended difference remains, the correct status is `not safe for review/live`, even if the source guard or geometry suite passes.

## Pass / Fail Rules

Ready for Guido review means:

- source truth checked;
- required views checked;
- visible defects fixed or clearly listed as caveats;
- no unapproved copy/content drift;
- no unapproved live touch;
- Shopify editability summary included.

Not visually cleared means:

- screenshots could not be captured;
- the exact URL did not load;
- route/status/theme identity is uncertain;
- crop/layout issues remain;
- only code/DOM checks were run.

If visual QA is blocked, say the page is staged but not visually cleared. Do not replace visual inspection with code confidence.

## Handoff Template

Use this shape when reporting ready status:

```text
Website review

Changed:
- ...

Checked:
- source:
- URL:
- desktop:
- intermediate/tablet:
- mobile:
- mid-page/full-page:

Shopify editing:
- editable:
- code-controlled:

Live touched:
- yes/no

Caveats:
- ...
```
