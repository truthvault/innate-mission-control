# Benchtops Configurator Handover

Date: 2026-06-13

## Purpose

Continue the live readiness audit for the benchtops page:

`https://innatefurniture.co.nz/pages/timber-panels`

Goal: identify anything, especially in the configurator, that stops the page being ready for newsletters and social promotion. It must work cleanly on desktop, tablet/intermediate widths, and mobile.

## Critical Source Rule

Do not trust local files first.

For anything the user says is happening on the live website:

1. Open/render the live page.
2. Confirm which theme is actually being displayed.
3. Inspect the exact live theme asset/admin object if a real issue is found.
4. Only then use local files.

Live theme: `140732760123`

Benchtops preview theme: `140760219707` (unpublished, verified 2026-06-15; not the default broad staging target)

Important: Shopify preview cookies can make a normal `innatefurniture.co.nz` URL silently show an unpublished preview theme. Before diagnosing, confirm whether assets are loading from:

- Live: `/cdn/shop/t/70/...`
- Staging: `/cdn/shop/t/75/...`

The user recently said the true live site looked fine after a confusing preview-state issue. Do not keep fixing staging ghosts.

## What Was Confirmed

The clean live benchtops page was opened with live theme assets:

- `assets/page-benchtops-atelier.css`
- `assets/innate-benchtop-configurator.js`
- live CDN path `/cdn/shop/t/70/...`

The top of the page looked broadly clean on desktop:

- Header/nav calm.
- H1: “Plan your timber benchtop. See the quote as you go.”
- No obvious horizontal overflow at desktop first viewport.
- Hero image and CTAs looked reasonable.

## Last Known Concern

The main risk area remains the configurator, especially at awkward desktop/tablet/mobile widths.

Previous visual checks suggested these are worth auditing carefully on the true live page:

- The configurator controls can become cramped at some widths.
- Material swatch labels may look too tight, especially species + colour labels.
- Finish buttons can visually jam together if the CSS is wrong.
- Price / GST / “View breakdown” text can become too tight.
- Multi-panel states need checking, especially copied benchtop pieces.
- Mobile needs a real dogfood pass, not just code inspection.

Do not assume these are still broken. Re-check live first.

## Recommended Audit Path

1. Open the live page in a clean browser/session or force live theme preview:

   `https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=140732760123`

2. Confirm live theme assets are `/cdn/shop/t/70/...`.

3. Test these viewports:

   - Desktop: around `1440 x 900`
   - Awkward tablet/intermediate: around `1024 x 768`
   - Mobile: around `390 x 844`

4. Check first viewport:

   - H1 wraps cleanly.
   - CTAs are aligned.
   - Hero crop is good.
   - No horizontal overflow.

5. Check configurator with one panel:

   - Surface preview is visible and not covering controls.
   - Length, width, thickness, quantity fields fit.
   - Material selector does not overlap editor fields.
   - Timber swatches display images and readable labels.
   - Finish toggle reads clearly.
   - Delivery controls fit.
   - Price/quote summary is readable.

6. Check configurator with two panels:

   - Add/copy another benchtop piece.
   - Confirm panel editor rows stay inside the card.
   - Confirm controls do not overlap the material selector.
   - Confirm no horizontal overflow.

7. Check material interactions:

   - Changing colour should update the configurator preview.
   - It should not open a large image popup inside the configurator.
   - The benchtop preview outline should be subtle, not a heavy black border.

8. Check mobile:

   - Fields stack cleanly.
   - Labels are readable and not cut off.
   - Timber swatches load and labels are readable.
   - Sticky/summary controls do not cover important content.
   - No side-scroll.

9. Check the rest of the page:

   - Timber examples / material imagery.
   - Sample CTAs.
   - Google Reviews styling.
   - FAQs/accordions.
   - Footer.

## If Fixes Are Needed

Work staging-only first.

Likely files in scope:

- `assets/page-benchtops-atelier.css`
- `assets/innate-benchtop-configurator.js` only if behaviour is genuinely wrong
- `sections/benchtops-atelier.liquid` only if markup/schema is genuinely wrong
- `templates/page.benchtops.json` only if Shopify section settings need changing

Prefer CSS for layout/polish issues. Do not touch JavaScript unless the behaviour itself is wrong.

Push only exact files to staging:

`scripts/innate-scoped-theme.sh push-staging assets/page-benchtops-atelier.css`

Do not push live without explicit user approval.

## Shopify Editor Requirement

If any page structure is changed, include a Shopify editor overview in the handoff back to the user:

- What sections exist.
- What text/images/links are editable.
- What blocks can be reordered.
- What remains code-controlled.

The goal is a polished website that the user can still edit from Shopify if Codex/Hermes access breaks.

## Things To Avoid

- Do not diagnose from stale local theme files.
- Do not use old `.codex-theme-work` folders as source of truth.
- Do not treat a staging preview URL as live.
- Do not make broad theme pushes.
- Do not change copy/content during a readiness audit unless explicitly asked.
- Do not say “ready” unless desktop, tablet/intermediate, and mobile have actually been visually checked.

## Current User Preference

Keep communication short and plain-English.

The user does not want long technical essays. Say what was checked, what is actually wrong, what is safe to fix, and whether live was touched.
