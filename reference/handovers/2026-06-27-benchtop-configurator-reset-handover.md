# Benchtop configurator reset handover — 2026-06-27

Purpose: give the next Website Agent chat a clean, short source-of-truth so it does **not** replay the messy Telegram history or confuse live/preview states.

## Read this first

Do **not** use the old conversation as the work database. It contains contradictory emergency instructions, stale context summaries, preview/live confusion, and rollback churn.

Start from current live and current preview inspection only.

## Current known targets

- Live URL: `https://innatefurniture.co.nz/pages/timber-panels`
- Live theme: `141308166203`
- Preview theme: `141473218619`
- Store domain for Shopify CLI: `innate-furniture.myshopify.com`
- Page: `/pages/timber-panels`
- Main assets:
  - `assets/innate-benchtop-configurator.js`
  - `assets/page-benchtops-atelier.css`

## Current live state after emergency recovery

Live was restored back to the version that existed before the mistaken urgent live rollback.

Current live readback hashes after recovery:

- JS: `6586effaefb288deed1c0c9d0673b52d2b22a042239eaec7e74f251c53f5080f`
- CSS: `d98bafaa71db75ccc55898a310cf4fb51c2a97f8bf29bf535a397aa0cd4f35d3`

Recovery backup / reversal path:

- `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260627_131121_LIVE_restore_pre_urgent_rollback_current_before_141308166203/`

Verification evidence:

- `/Users/mack-mini/innate-mission-control/reference/evidence/20260627-live-restore-pre-urgent-rollback/`

Verified at the time:

- Live desktop loaded.
- Live mobile loaded.
- Configurator app was present.
- Horizontal overflow was `0`.
- Desktop timber swatches loaded from Shopify CDN, 9/9, natural size `424×338`.
- Visible broken images were `0`.

## Current preview state after rollback

Preview theme `141473218619` was rolled back to before the last two rejected preview changes.

Current preview rollback state:

- JS restored from before mobile overflow-reserve:
  - `4cb807ef8eee569552aaaa0d200a253cc75ddc22f3577b77094802393b8d5db1`
  - Source backup: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260627_122520_preview_mobile_overflow_reserve_141473218619/innate-benchtop-configurator.before.js`
- CSS restored from before the later preview rebase:
  - `f2f2521a32a98eca9a56512fba659154f504d63002b12213d9140bcd20c13b4e`
  - Source backup: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260627_124227_preview_rebase_from_live_rollback_141473218619/assets.preview-before/page-benchtops-atelier.css`

Rollback backup/current-before path:

- `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260627_130321_preview_rollback_before_last_two_141473218619/`

Verification evidence:

- `/Users/mack-mini/innate-mission-control/reference/evidence/20260627-preview-rollback-before-last-two/`

Verified at the time:

- Preview desktop loaded.
- Preview mobile loaded.
- Configurator app was present.
- Horizontal overflow was `0`.
- Mobile preview `overlapSvgMobile:false`.

Important caveat: this does **not** mean the preview is good or ready for review. It only means it was rolled back to a less-bad known point after the rejected last two changes.

## What worked / useful changes

These appeared to be useful or at least had evidence behind them. Re-verify before reusing.

### Live changes from 2026-06-26 that should not be casually reverted

1. **Mobile rotate cleanup**
   - File: `assets/page-benchtops-atelier.css`
   - Hid only `.innate-selected-rotate.is-mobile` below 960px.
   - Kept rotation available inside the mobile Size sheet as `Rotate piece 90°`.
   - Backup: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260626_080434_live_mobile_rotate_hide_141308166203/`

2. **Mobile tabs / page separation cleanup**
   - File: `assets/page-benchtops-atelier.css`
   - Made mobile Size/Timber/Cutouts/Delivery rail read as tappable segmented controls.
   - Removed old mobile negative margin that pulled `THE DIFFERENCE` into the configurator area.
   - Backup: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260626_081644_live_mobile_tabs_separation_141308166203/`

3. **Mobile edit-sheet bottom anchoring**
   - File: `assets/page-benchtops-atelier.css`
   - Anchored `.mobile-sheet` flush to viewport bottom when open.
   - Removed exposed lower-page content under the sheet.
   - Backup: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260626_085033_live_mobile_sheet_bottom_gap_141308166203/`

4. **Benchtops copy update**
   - Files: `sections/benchtops-atelier.liquid`, `templates/page.benchtops.json`
   - Changed copy from `Indicative quote` language to `Live quote` language.
   - Do not revert unless Guido explicitly asks.

### Preview-only work that had promise but still needs careful revalidation

5. **Preview safe fix from 2026-06-26**
   - Theme: `141473218619`
   - JS hash then: `ae7d64d409678ea58651f8ac98c734075d18f870fe42bec7e20acfa664bd4df0`
   - CSS hash then: `d52166d7479cb2b5946177903ca5c7d18330e7bd38bfee5f28d9190c3085483d`
   - Added row-click selected-panel sync.
   - Removed internal stage scroll traps by making preview overflow visible.
   - Evidence:
     - `/Users/mack-mini/innate-mission-control/reference/evidence/20260626-safe-fix-141473218619-deep-parity-overflow-visible/`
     - `/Users/mack-mini/innate-mission-control/reference/evidence/20260626-safe-fix-141473218619-focused-qa/`
   - Treat as a candidate idea, not a blindly reusable baseline.

6. **Rotated drag / hit-area fixes**
   - Final preview QA hash before later rejected changes: `4cb807ef8eee569552aaaa0d200a253cc75ddc22f3577b77094802393b8d5db1`
   - Backup: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260627_102200_preview_resize_hit_overlay_141473218619/`
   - Evidence: `/Users/mack-mini/innate-mission-control/reference/evidence/20260627-benchtop-rotated-drag-matrix/`
   - It reportedly fixed rotated resize hit-testing/deltas while preserving selected panel/detail-card sync.
   - Re-test visually and with interactions before using.

## What did **not** work / should not be repeated

1. **Geometry proof renderer as customer preview**
   - Guido rejected the screenshot with `This preview renderer is for geometry proof only`.
   - Treat that renderer as an internal harness only.
   - Do not show it as a review preview.
   - Future work must preserve the current commercial UI and port geometry underneath it.

2. **Using stale standalone/Vite configurator output as Shopify source**
   - Do not push from `/Users/mack-mini/innate-benchtop-quote/dist` or stale standalone app outputs.
   - The correct Shopify page is embedded `/pages/timber-panels`.
   - The old standalone app is not proof of customer-facing state.

3. **Blindly rolling live to old rollback theme `141243383867`**
   - This was the major failure.
   - It restored older assets with protected Vercel swatch image paths.
   - Result: broken swatches / alt text on live.
   - Do not use `141243383867` as a live rollback source unless independently inspected and visually verified.

4. **Treating screenshot wording as proof of live/preview**
   - The screenshot label `LIVE DESIGN SURFACE` is part of the UI, not proof that the screenshot is live site.
   - Always verify actual URL/theme before writing.

5. **Mobile overflow-reserve fix**
   - Marker: `innate-mobile-preview-overflow-reserve-v1`
   - It added dynamic bottom margin based on SVG overflow.
   - It passed some machine checks but Guido rejected the resulting visual direction / it made the situation worse in context.
   - Do not reapply unless there is a new, explicit design decision and visual proof.

6. **Preview rebase from live rollback**
   - Preview was overwritten from the older live rollback baseline and then patched.
   - It was later rolled back after Guido said it was worse.
   - Do not use as a baseline.

7. **Live image URL hotfix after misidentifying screenshot**
   - The Shopify CDN swatch URL idea was technically valid for the broken images, but it was applied to live after context confusion.
   - It was rolled back, then live was restored correctly later.
   - Lesson: good fix, wrong target/time. Verify live/preview first and require explicit live approval.

## Root cause of the painful failure

The agent operated with a cluttered context window and several stale summaries/backups in play. It confused:

- live vs preview screenshots,
- UI label `LIVE DESIGN SURFACE` vs actual live site,
- rollback source vs true previous live state,
- machine checks passing vs Guido’s visual review failing,
- emergency rollback urgency vs exact target verification.

The agent also kept trying to continue work inside the same poisoned chat, which made it easier to mix good and bad states.

## Required clean-start protocol for next chat

Use this protocol before any further benchtop configurator work.

### Step 1 — read-only baseline only

Before editing anything, inspect:

- live `/pages/timber-panels`
- preview theme `141473218619` at `/pages/timber-panels?preview_theme_id=141473218619&_ab=0&_fd=0&_sc=1`
- Shopify readback hashes for the two main assets on both themes
- browser desktop and mobile rendered screenshots
- failed image requests and visible broken images
- horizontal overflow
- basic interaction state: selected panel, Size tab, Timber tab, rotate, add piece if needed

### Step 2 — state the target before action

Report in one short message:

- live status: broken / acceptable / not checked
- preview status: broken / acceptable / not checked
- exact theme ID to be touched
- exact files to be touched
- backup path to be created
- whether live will be touched: yes/no

If live is to be touched, stop and wait for explicit live approval.

### Step 3 — one narrow fix at a time

Only fix one thing per iteration, e.g.:

- swatch images broken,
- rotated handle hit area,
- selected piece sync,
- mobile sheet overlap,
- internal scrollbar/crop.

Do not combine geometry, image paths, mobile layout, and rollback in one push.

### Step 4 — verify visually and mechanically

Minimum proof after a preview push:

- Shopify readback hashes match candidate.
- Desktop screenshot saved.
- Mobile screenshot saved.
- Console errors checked.
- Failed requests checked.
- Horizontal overflow checked.
- If interaction fix: run the relevant Playwright interaction, not just page load.

Do not say ready if any verification command fails.

### Step 5 — do not send broken preview links

If preview is broken, do not send the clickable preview link as if it is ready. Say it is broken and give the blocker.

## Suggested first message for the new chat

Paste this into a fresh Website Agent chat:

```text
Reset context. Use this handover only, not old Telegram history:
/Users/mack-mini/innate-mission-control/reference/handovers/2026-06-27-benchtop-configurator-reset-handover.md

Task: Benchtop configurator recovery.
First do read-only baseline only. Inspect live and preview, verify exact theme IDs/hashes/screenshots, and tell me what is broken where. Do not write anything yet.

Live URL: https://innatefurniture.co.nz/pages/timber-panels
Live theme: 141308166203
Preview theme: 141473218619
Preview path: /pages/timber-panels?preview_theme_id=141473218619&_ab=0&_fd=0&_sc=1

No live changes without explicit approval. Do not infer live/preview from screenshots.
```

## Quick decision guide for future work

- If live currently looks acceptable: **freeze live** and work only on a fresh duplicate/preview.
- If preview is broken: **fix preview only**, from current preview readback, not stale local files.
- If old work seems useful: cherry-pick a tiny change from a verified backup, never wholesale rebase.
- If unsure which version is good: use rendered screenshots + exact hashes, not memory.
- If Guido sends a screenshot: ask/verify whether it is live or preview unless the URL/theme is explicit.

## Short list of useful evidence folders

- Current live recovery proof:
  - `/Users/mack-mini/innate-mission-control/reference/evidence/20260627-live-restore-pre-urgent-rollback/`
- Current preview rollback proof:
  - `/Users/mack-mini/innate-mission-control/reference/evidence/20260627-preview-rollback-before-last-two/`
- Earlier safe-fix preview proof:
  - `/Users/mack-mini/innate-mission-control/reference/evidence/20260626-safe-fix-141473218619-deep-parity-overflow-visible/`
  - `/Users/mack-mini/innate-mission-control/reference/evidence/20260626-safe-fix-141473218619-focused-qa/`
- Rotated drag/hit-area matrix:
  - `/Users/mack-mini/innate-mission-control/reference/evidence/20260627-benchtop-rotated-drag-matrix/`

## Final instruction to next agent

Be boring. Verify the exact theme and rendered page before acting. Make one small preview change. Back it up. Read it back. Screenshot it. If anything fails, stop and say blocked. Do not improvise a rollback source.
