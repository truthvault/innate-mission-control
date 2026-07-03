# Benchtop configurator handover — recovered live baseline and next steps

Created: 2026-06-24 17:24 NZST  
Owner context: Innate Website Agent / Shopify / benchtop configurator  
Live page: https://innatefurniture.co.nz/pages/timber-panels

## Current safe status

The live benchtop configurator was recovered after a stale local bundle overwrite. The live site is now back on the correct interaction baseline and includes the later default-size change.

Live Shopify theme:

- `141308166203`

Live Shopify asset recovered:

- `assets/innate-benchtop-configurator.js`

Current verified public JS hash:

- `acccb33c7de5a174031d13d82f586d3ed537e258d3285f3cf74627188bc314d6`

Current live default first-open state:

- Northland Tōtara Clear
- 1800 × 600 × 43 mm
- one piece
- oiled
- deliver-to-me

Current recovered interaction baseline:

- floating selected-panel rotate control is present
- selected panel/card sync helpers are present
- prominent corner/edge resize handles are present
- directional resize cursors are present
- old `Add a benchtop 1200...` warning is absent
- old `innate-benchtop-quote.vercel.app` endpoint is absent
- Mission Control endpoint is present

## What went wrong

A live default-size update was made from the stale local repo:

- `/Users/mack-mini/innate-benchtop-quote`

That stale build added the new 1800 × 600 × 43 defaults, but overwrote newer live refinements:

- selected rotate helper
- active selected-panel/detail-card sync
- enlarged/prominent resize handle treatment
- removed old minimum-size warning
- Mission Control endpoint

The stale asset then contaminated the duplicate theme work too. This has now been corrected on live.

## Recovery proof and backups

Main recovery evidence folder:

- `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-24/live-benchtop-recovery-20260624-165338/`

Important files in that folder:

- `current-live-before-recovery-innate-benchtop-configurator.js` — backup of the regressed live asset before recovery
- `recovered-from-last-good-plus-1800x600x43-totara.js` — recovered asset uploaded to live
- `shopify-live-upload-readback.json` — Shopify Admin API readback proof
- `live-recovery-verification.json` — raw/public/rendered verification results
- `live-recovered-desktop.png` — screenshot proof after recovery
- `live-recovered-mobile.png` — mobile screenshot proof after recovery
- `live-recovered-tablet.png` — tablet screenshot proof after recovery

Original last-known-good backup used as recovery base:

- `/Users/mack-mini/innate-benchtop-quote/.hermes/backups/live-theme-141308166203-innate-benchtop-configurator.20260624-085836.js`

Visual proof that this backup was the correct one Guido meant:

- `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-24/last-known-good-backup-proof/backup-20260624-085836-selected-panel-closeup.png`

Archived reference snapshot, explicitly not source-of-truth unless re-compared with live:

- `/Users/mack-mini/innate-mission-control/reference/archive/theme-assets/2026-06-24-benchtop-recovery-live-141308166203/`

## Guardrails for the next session

Do not use stale local source as truth.

Never build/push from these paths unless they have first been explicitly rebased and the guard passes:

- `/Users/mack-mini/innate-benchtop-quote/src`
- `/Users/mack-mini/innate-benchtop-quote/dist`

Current operating rule:

1. Always duplicate the current live Shopify theme first for preview work.
2. Do not reuse old duplicate/staging themes as implementation bases.
3. Pull or inspect the current live/duplicate asset before editing.
4. Compare the candidate asset to the recovered live baseline before pushing.
5. Local archives are evidence only, not implementation source-of-truth.
6. After website updates, archive or clearly label local copies as historical snapshots.
7. No further live writes without explicit Guido approval.

Relevant workflow file:

- `/Users/mack-mini/.hermes/profiles/website/skills/devops/website-exact-version-control-loop/SKILL.md`

Current website state file:

- `/Users/mack-mini/.hermes/profiles/website/reference/current-website-state.md`

## Required hard guard before any future configurator JS push

In `/Users/mack-mini/innate-mission-control`, run:

```bash
npm run guard:shopify-asset -- --candidate <local-file> --asset-key assets/innate-benchtop-configurator.js
```

The guard must pass. A failure is a blocker, not a warning.

At minimum, the candidate/public asset must preserve:

- `innate-selected-rotate`
- `innate-panel-is-active`
- `innate-panel-card-is-active`
- 1800 × 600 × 43 defaults
- Tōtara default
- old `Add a benchtop 1200...` absent
- old `innate-benchtop-quote.vercel.app` absent
- `innate-mission-control.vercel.app` present

## Where to from here

We are back to square 1, but now on the correct recovered version.

Next task should be done on a fresh duplicate only:

1. Duplicate the current live theme `141308166203`.
2. Pull the new duplicate locally.
3. Confirm duplicate `assets/innate-benchtop-configurator.js` hash matches recovered live hash:
   - `acccb33c7de5a174031d13d82f586d3ed537e258d3285f3cf74627188bc314d6`
4. Re-apply the original 8 mobile/tablet/CTA fixes to the fresh duplicate, not to the stale local source.
5. Run the guard against the changed asset.
6. Verify rendered desktop, mobile, and tablet screenshots.
7. Verify interaction behaviour:
   - rotate present and clickable
   - resize handles visible and correct cursor semantics
   - selected panel/detail card stay in sync
   - old 1200 warning absent
   - defaults are Tōtara 1800 × 600 × 43
   - no horizontal overflow
8. Send Guido the duplicate preview link and screenshot proof.
9. Do not touch live until Guido approves the exact live promotion.

## The original 8 fixes to re-apply safely

These were approved earlier for a duplicate theme, but must now be reapplied to a fresh duplicate from the recovered live baseline:

1. Reduce/compact mobile/tablet canvas height.
2. Stop sticky CTA from covering controls/content.
3. Enlarge mobile touch hit areas for dimension labels/resize handles where needed.
4. CTA logic: do not make “Add delivery address” dominant until delivery step.
5. Make mobile active step clearer, e.g. “Step 1: Size”.
6. Loosen desktop material/control panel density.
7. Verify address/freight result.
8. Tidy Google reviews widget warnings/styling later if still relevant.

Important: apply these as narrow preview fixes. Do not redesign the configurator or replace the JS bundle from stale source.

## Suggested first command sequence for next session

Read workflow/state first:

```bash
sed -n '1,140p' /Users/mack-mini/.hermes/profiles/website/skills/devops/website-exact-version-control-loop/SKILL.md
sed -n '1,80p' /Users/mack-mini/.hermes/profiles/website/reference/current-website-state.md
```

Confirm live theme and duplicate it:

```bash
shopify theme list --store innate-furniture.myshopify.com
shopify theme duplicate --store innate-furniture.myshopify.com --theme 141308166203 --name "Benchtop mobile fixes preview recovered baseline 2026-06-24" --force --json
```

Then pull only the fresh duplicate and verify the asset hash before editing.

## User-facing summary for the next session

“Live has been recovered and verified. Start from a fresh duplicate of live theme `141308166203`, confirm the configurator JS hash `acccb33c...`, then reapply the mobile/tablet fixes on the duplicate only. Do not use `/Users/mack-mini/innate-benchtop-quote` as source-of-truth unless it has been rebased and passes the Shopify asset guard.”
