# Benchtop configurator tracked progress

Updated: 2026-06-24 22:21 NZST  
Owner context: Innate Website Agent / Shopify / benchtop configurator  
Live page: https://innatefurniture.co.nz/pages/timber-panels

## Current status

Status: **read-only audit complete; no website or Shopify changes made.**

The background audit finished after ~24 minutes. It inspected the live Benchtop Configurator and produced evidence for the next fix/prototype decision.

## Live source checked

- Live Shopify theme: `141308166203`
- Live asset: `assets/innate-benchtop-configurator.js`
- Public live asset SHA-256: `acccb33c7de5a174031d13d82f586d3ed537e258d3285f3cf74627188bc314d6`
- Public page tested: `https://innatefurniture.co.nz/pages/timber-panels`

Note: one worker reported the task baseline as `accb33...`; the recovered baseline/handover and live fetch both show `acccb33...`. Treat `acccb33...` as the current checked hash.

## Progress log

### 1. Live functionality audit — complete

Scope: public live storefront only. No Admin/theme writes.

Viewports checked:

- Desktop: `1440 × 1000`
- Tablet: `820 × 1100`
- Mobile: `390 × 1000`

Confirmed:

- Default state still matches recovered baseline: Northland Tōtara Clear, oiled, `1800 × 600 × 43`, one piece.
- Add-to-8 works by visible panel count.
- Resize and cutout pricing paths update.
- No document-level horizontal overflow was found in the focused states.

Top confirmed failures:

1. Desktop overlap drag can move the wrong panel.
2. Desktop edge/corner drag can push/teleport panels off the preview.
3. Tablet piece-tab selection can select the wrong piece.
4. Tablet rotation can rotate the wrong piece.
5. Mobile piece rail can hide the active selected tab after adding pieces.

Evidence folder:

- `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-24/benchtop-worldclass-audit-readonly/`

Important files:

- `final-focused-audit-report.md`
- `focused-audit-results.json`
- `focused-desktop-drag-edge.png`
- `focused-desktop-drag-corner.png`
- `focused-tablet-selection-drift.png`
- `focused-mobile-selection-ok.png`
- `live-innate-benchtop-configurator.js`

### 2. Implementation / test-harness audit — complete

Scope: recovered live asset, archived evidence, and read-only live fetch.

Findings:

- The configurator is a React quote state rendered mostly through SVG.
- State persists in localStorage key `innate.benchtop.v4` and sometimes URL hash.
- Selection sync is partly handled outside React by an imperative `innate-selected-object-v5` script.
- Current weak points are likely scale/origin recalculation during gestures, no snap hysteresis, independent-axis snapping, rotated-resize math, index-based selection sync, and mobile/tablet fit invariants.

Recommendation:

- Build a proper Playwright geometry suite before substantial fixes.
- Do not patch the minified recovered live bundle for major geometry work.
- If source cannot be recovered/rebased safely, rebuild the geometry core as deterministic functions plus renderer.

Created evidence:

- `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-24/benchtop-worldclass-audit-readonly/report.md`
- `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-24/benchtop-worldclass-audit-readonly/benchtop-geometry-harness-draft.mjs`
- `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-24/benchtop-worldclass-audit-readonly/harness-run/benchtop-geometry-harness-result.json`

### 3. Strategic technical direction research — complete

Recommendation:

- Keep Shopify/pricing/freight/Mission Control shell.
- Stabilise the current SVG/DOM surface short-term.
- Prototype a replaceable design surface in React-Konva against the same quote/pricing payload.
- Do not replace the core with external configurator platforms at this stage.

Rationale:

- React-Konva gives stronger drag/resize/rotate/snapping/touch foundations than the current custom SVG surface.
- Innate should own the quote JSON/domain model, not bury business logic inside canvas objects.
- External 3D/configurator platforms are likely too costly and restrictive for the current benchtop-only quoting problem.

## Current decision point

Recommended next move:

1. Create a fresh duplicate of the current live theme.
2. Pull/inspect the duplicate configurator asset and confirm it matches live hash `acccb33c7de5a174031d13d82f586d3ed537e258d3285f3cf74627188bc314d6` before editing.
3. Add a small, deterministic Playwright geometry harness to reproduce the confirmed failures.
4. Patch only the smallest preview-theme fixes needed for wrong-target selection/drag/rail visibility.
5. Run the Shopify asset guard before any preview push.
6. Verify desktop/tablet/mobile rendered behaviour with screenshots and interaction checks.
7. Only then show Guido a preview link. Live promotion remains a separate approval.

## Approval gates

No approval needed for:

- Reading live/public pages.
- Writing private internal reports/evidence.
- Building local test harnesses.
- Drafting a preview plan.

Approval needed for:

- Creating/editing a duplicate Shopify theme preview.
- Any Shopify theme asset push, even to preview.
- Any live theme/customer-visible change.

Live work requires separate exact live approval.

## Open risks / blockers

- Current active implementation source-of-truth is still not safely identified as a clean editable source tree.
- Existing local `innate-benchtop-quote` source is a stale-source risk and must not be used as authoritative unless rebased and guard-checked.
- Major geometry fixes should not be made directly in the minified live asset.

## Next visible checkpoint

If Guido approves preview-theme implementation work, the next checkpoint report should show:

- duplicate theme ID and role,
- duplicate asset hash before edits,
- exact patch scope,
- guard result,
- desktop/tablet/mobile screenshots,
- whether each confirmed failure is fixed, still failing, or deferred.
