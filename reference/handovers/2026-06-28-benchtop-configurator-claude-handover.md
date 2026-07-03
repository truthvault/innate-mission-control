# Benchtop Configurator Handover For Claude

Prepared for: Claude or another fresh implementation agent
Prepared by: Codex
Prepared at: 2026-06-28 NZT
Owner: Guido / Innate Furniture

## Read This First

This handover is intentionally long and explicit because the work is in a fragile state. The current duplicate is closer than live in several ways, but it is not good enough, and Guido has correctly decided that a fresh set of eyes should take over.

The main unsolved problem is the live design surface resize behavior for rotated panels. In particular:

- When a panel is rotated 90 degrees, dragging the black bottom resize line should make the benchtop longer visually downward.
- It must not make the panel visually wider or narrower.
- It must not cause the panel to jump or drift.
- It must not make the yellow/background work surface climb upward into the "LIVE DESIGN SURFACE" eyebrow.
- It must work with multiple panels and cut-outs.

Guido's latest screenshot and instruction:

- Screenshot: `/Users/mack-mini/.codex/attachments/9849aad9-7706-4129-bab9-b8ca6a002667/Screenshot 2026-06-28 at 12.24.58 AM.png`
- User report: "When dragging the black line to make the benchtop bigger towards the bottom, it makes the benchtop wider instead and moves it around."

Codex attempted several narrow patches. The latest targeted proof says the specific bottom-handle case is improved in an isolated probe, but the broader behavior still needs a careful fresh review. Do not assume the current duplicate is production-ready.

## Absolute Source-Of-Truth Rules

These are non-negotiable operating rules from Guido and the weekend stabilization docs.

1. Never rely on old local Shopify theme files as source of truth.
2. Local theme trees are stale by default and should be treated as archived or forensic only.
3. Website work must start from:
   - the live rendered Shopify page, and
   - a fresh duplicate of the live theme, or
   - an explicitly approved current staging/duplicate theme.
4. Do not push to live without Guido's exact approval for the exact scoped file(s).
5. Do not touch Claude's separate duplicate theme for the dining table/homepage work.
6. Do not overwrite another agent's duplicate.
7. For this work, do not use the plain live URL as evidence of duplicate behavior unless the URL includes the preview theme ID and you verify the loaded CDN asset path/hash.

Relevant stabilization doc:

`/Users/mack-mini/.hermes/reference/platform/weekend-stabilization-2026-06-26.md`

Relevant hard rule from root agent context:

Website/Shopify hard rule, corrected by Guido 2026-06-27: never rely on local Shopify theme files for website source-of-truth or implementation. Local Shopify theme trees are stale by default and must stay archived/forensic only. Website work must start from the live rendered Shopify page and a fresh duplicate of the live theme, or an explicitly approved current staging theme.

## Theme IDs And URLs

Live theme:

- Live theme ID recorded in this work: `141308166203`
- Do not push to this without explicit approval.

Codex benchtop duplicate:

- Theme ID: `141492912187`
- Role: unpublished
- Preview URL: `https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141492912187&_ab=0&_fd=0&_sc=1`
- CDN asset path in the duplicate should show `cdn/shop/t/92/assets/innate-benchtop-configurator.js`

Claude separate duplicate for dining table/homepage:

- Theme ID: `141492486203`
- Do not touch this theme from the benchtop work.

Important: If the browser URL is only:

`https://innatefurniture.co.nz/pages/timber-panels`

then it is likely the live theme, not the duplicate, unless a preview cookie is actively in effect. Always verify the actual loaded script URL/hash.

## Current Local Experimental Path

This is not source of truth by itself. It is the local copy of the Codex duplicate work and can be used for forensic comparison only after verifying against the remote duplicate.

Theme local path:

`/Users/mack-mini/.hermes/work/fresh-shopify-theme-duplicates/benchtop-configurator-live-duplicate-20260627-141492912187`

Main asset edited:

`/Users/mack-mini/.hermes/work/fresh-shopify-theme-duplicates/benchtop-configurator-live-duplicate-20260627-141492912187/assets/innate-benchtop-configurator.js`

Backup from before the rotated-resize work:

`/Users/mack-mini/.hermes/work/fresh-shopify-theme-duplicates/innate-benchtop-configurator.before-rotated-resize-20260627.js`

Current local asset hash after last precision edit:

`cbf57bdc533a0f10cff9d0a3f73213c042a64e6a500133a5b21661465831093f`

Current remote duplicate asset hash was verified by targeted Playwright proof as:

`cbf57bdc533a0f10cff9d0a3f73213c042a64e6a500133a5b21661465831093f`

Do not treat this asset as "good". Treat it as "latest experimental state with one targeted pass and unresolved broader risk".

## Shopify CLI Command Pattern Used

When pushing the single asset to the duplicate, Codex used:

```bash
SHOPIFY_CLI_AGENT_INFO='n:Codex|v:1|p:OpenAI' \
SHOPIFY_CLI_AGENT_IDS='s:codex|r:benchtop-rotated-bottom-precision-20260628|i:mac-mini' \
shopify theme push \
  --store innate-furniture.myshopify.com \
  --theme 141492912187 \
  --path /Users/mack-mini/.hermes/work/fresh-shopify-theme-duplicates/benchtop-configurator-live-duplicate-20260627-141492912187 \
  --only assets/innate-benchtop-configurator.js \
  --nodelete \
  --json
```

For future Claude work, if using a fresh duplicate, replace the theme ID and path. Do not reuse the Codex duplicate unless Guido explicitly wants that.

## Asset Guard Command Used

Codex used this guard before pushes:

```bash
npm run guard:shopify-asset -- \
  --candidate /Users/mack-mini/.hermes/work/fresh-shopify-theme-duplicates/benchtop-configurator-live-duplicate-20260627-141492912187/assets/innate-benchtop-configurator.js \
  --asset-key assets/innate-benchtop-configurator.js
```

Run from:

`/Users/mack-mini/innate-mission-control`

The guard checks required markers such as:

- `phase12-hardening-runtime-20260623`
- `innate-selected-rotate`
- `innate-panel-is-active`
- `innate-panel-card-is-active`

And forbidden markers such as:

- `Add a benchtop 1200`
- `innate-benchtop-quote.vercel.app`

The guard passing only means the file resembles the intended asset and avoids known forbidden stale code. It does not mean the UX works.

## Summary Of What Codex Changed

This is high-level. The file is minified/bundled, so changes were made as mechanical replacements in the asset, not via source modules.

### 1. Rotated cursor class

Added a rotated class to the resize group:

`panel-resize--rotated`

Purpose:

- Let CSS distinguish unrotated and rotated resize cursors.
- Make the cursor direction match the visual handle direction rather than the local SVG class direction.

### 2. Explicit cursor CSS

Added CSS for edge and corner cursors.

Unrotated intent:

- `n/s`: `ns-resize`
- `e/w`: `ew-resize`
- `nw/se`: `nwse-resize`
- `ne/sw`: `nesw-resize`

Rotated intent:

- local `n/s`: visually horizontal, cursor `ew-resize`
- local `e/w`: visually vertical, cursor `ns-resize`
- corners remapped accordingly

Had to use `!important` because later theme CSS had more forceful template-level cursor rules.

### 3. Corner group cursor inheritance

Cursor rules were expanded to apply to the corner groups as well as the transparent corner rects, so the visible corner circles inherit the right cursor when hovered.

### 4. Top-anchored slab preview

Added CSS so `.slab-preview` aligns to the top instead of centering vertically inside the stage.

Why:

- Before this, when the SVG grew taller, it grew upward and downward around its center.
- That made the yellow/background design surface climb into the "LIVE DESIGN SURFACE" eyebrow.

### 5. Fixed top gutter in layout math

Changed the internal layout calculation from an older top origin around:

`st + P / 2`

to a fixed top gutter roughly:

`st + P + 18`

Why:

- Keep the design surface and panel layout anchored down from the eyebrow.

### 6. Desktop stage height and overflow override

Added a specific CSS override for the embedded benchtop preview on desktop:

- `height: 720px`
- `min-height: 720px`
- `max-height: none`
- `overflow: visible`

Why:

- The bottom resize handle was inside the SVG but outside the actual `.stage__preview` box, so pointer hit testing found the page background instead of the handle.
- The first generic override lost to later theme rules. A more specific selector was required.

### 7. SVG preserveAspectRatio changed

Changed:

`preserveAspectRatio="xMidYMid meet"`

to:

`preserveAspectRatio="xMidYMin meet"`

Why:

- Try to keep SVG content top-aligned inside the SVG viewport.
- This alone did not solve the remaining bottom-handle issue.

### 8. Rotated handle mapping attempts

Codex attempted to map visual handles to visual directions instead of local edge names.

Rendered mapping observed for a 90 degree rotated panel:

- visual top is local `w`
- visual bottom is local `e`
- visual right is local `n`
- visual left is local `s`

PointerDown mapping currently in the experimental asset:

- local `n` calls handle `e`
- local `s` calls handle `w`
- local `w` calls handle `n`
- local `e` calls handle `s`

Corner mapping currently in the experimental asset:

- local `nw` to visual `ne`
- local `ne` to visual `se`
- local `sw` to visual `nw`
- local `se` to visual `sw`

This mapping was intended to make the resize math operate in visual terms.

### 9. Layout-mode scale floor

Latest precision edit changed layout-mode scale behavior from:

`c&&(o=n/i)`

to:

`c&&(o=n/Math.max(i,2600))`

Where:

- `c` means layout mode is active.
- `o` is the scale.
- `n` is the available horizontal stage width.
- `i` is based on max panel/display width.

Why:

- During a rotated bottom-handle drag, data length was increasing correctly, but the canvas was rescaling at the same time.
- That made the panel visually shift and appear wider/narrower.
- The scale floor made the targeted bottom-line case visually stable in the isolated proof.

Risk:

- This is a blunt stabilizer.
- It may be too broad.
- It may affect multi-panel composition or large kitchens.
- It has not been proven by the full matrix after the precision edit.

## Evidence Timeline

### Early proof that preview and live were different

Codex verified that the plain live URL was loading a different asset from the duplicate preview:

Live normal URL:

- `https://innatefurniture.co.nz/pages/timber-panels?_ab=0&_fd=0&_sc=1`
- CDN theme: `t/86`
- hash at the time: `6586effaefb288deed1c0c9d0673b52d2b22a042239eaec7e74f251c53f5080f`

Preview URL:

- `https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141492912187&_ab=0&_fd=0&_sc=1`
- CDN theme: `t/92`
- hash at the time: `dbf6d5cf5f616d9e0275a9aef554e61dda3ec1206d629e4c4288b58dab19ba38`

This matters because screenshots from plain URL may have been live theme, not the duplicate.

### Focused visual handle proof, earlier pass

Evidence:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-27/benchtop-computer-request-rotated-visual-handles-20260627T080318Z/results.json`

Result:

- `ok: true`
- all 8 visual edge/corner drags passed at that time
- asset hash then: `dbf6d5cf5f616d9e0275a9aef554e61dda3ec1206d629e4c4288b58dab19ba38`

Do not over-trust this. Later CSS/layout fixes changed the behavior.

### Multi-panel/cutout/breathing proof, earlier pass

Evidence:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-27/benchtop-computer-request-multipanel-cutout-breathing-20260627T080501Z/results.json`

Result:

- `ok: true`
- `multiPanelOk: true`
- `panelDragOk: true`
- `cutoutVisibleOk: true`
- `cutoutDragOk: true`
- `rotatedEdgeOk: true`
- `noClip: true`
- `minMargin: 14.033...`

Again, this was before later changes.

### Full matrix earlier pass, before later changes

Evidence:

`/Users/mack-mini/innate-mission-control/reference/evidence/20260627-benchtop-rotated-drag-matrix/20260627T080532Z/results.json`

Result:

- `ok: true`
- `problemCount: 0`
- `kitchenJourneyOk: true`
- `mobileOk: true`

This was before the current batch of cursor/surface/layout changes and should be used only as historical context.

### Cursor/surface exact proof

Evidence:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-27/benchtop-rotated-cursor-surface-20260627T100226Z/results.json`

Result:

- `ok: true`
- cursor directions correct
- slab/style top anchoring correct
- SVG top stayed fixed during downward drag

Asset hash:

`401395638b09420d04b335e1f3874d940d6682ad60374837edaf8df97d3aa559`

This proof is relevant to the eyebrow/surface-upward issue, but not enough for full resize confidence.

### Final quick proof before precision scale edit

Evidence:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-27/benchtop-final-quick-proof-20260627T105459Z/results.json`

Result:

- `ok: true`
- asset hash: `d01390b1c8b26b75efa41df4e30c563414377d8edb8ab0835de64a1fe936d071`
- markers present:
  - rotated class
  - top align
  - visual resize
  - surface height
  - preserve top
- stage:
  - `height: 720px`
  - `minHeight: 720px`
  - `overflow: visible`
- computed cursors:
  - edges: `n/s = ew-resize`, `e/w = ns-resize`
  - corners: rotated cursor values matched the intended visual directions

This proof was useful for cursor/stage state, not for the exact bottom-line drag.

### Full matrix after many changes, still failing

Evidence:

`/Users/mack-mini/innate-mission-control/reference/evidence/20260627-benchtop-rotated-drag-matrix/20260627T105038Z/results.json`

Result:

- `ok: false`
- asset hash: `139cfa5ed34e7855781dbcc53d02ef3fffbc12a952f215c8160657ad6be3a4ff`
- `kitchenJourneyOk: true`
- `mobileOk: true`
- remaining failures were bottom-related:
  - desktop handle `s`
  - desktop handle `sw`
  - desktop handle `se`

Representative problems:

- south/bottom drag moved the opposite top edge too much
- vertical edge drag shifted the panel sideways
- vertical visual edge did not increase visible height
- corner drag did not increase both visible width and height

This matrix was before the latest scale-floor precision edit.

### Latest targeted bottom-handle proof after precision scale edit

Evidence:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-28/benchtop-bottom-handle-precision-20260627T123756Z/results.json`

Result:

- `ok: true`
- asset hash: `cbf57bdc533a0f10cff9d0a3f73213c042a64e6a500133a5b21661465831093f`
- scenario:
  - one rotated panel
  - length `1000`
  - width `420`
  - bottom black line dragged downward by about 90px
- before:
  - length input: `1000`
  - width input: `420`
  - visible box width: `98.86627197265625`
  - visible box height: `208.34942626953125`
- after:
  - length input: `1480`
  - width input: `420`
  - visible box width: `98.86691284179688`
  - visible box height: `298.9580078125`
- deltas:
  - width delta: `0.000640869140625`
  - height delta: `90.60858154296875`
  - center X delta: `-0.0010528564453125`
  - center Y delta: `45.304901123046875`

Interpretation:

- This targeted case now behaves correctly in headless Playwright.
- This does not prove the whole configurator is fixed.
- The full matrix was not rerun after this latest scale-floor patch.

## Current State In Plain English

The duplicate is better than it was, but still not trustworthy.

What seems improved:

- Rotated handle cursor directions are now much more coherent.
- The visible bottom black line in the isolated one-panel case now extends the panel down rather than changing width.
- The stage no longer appears to climb into the eyebrow in the targeted proof.
- The bottom handle can receive pointer events after the desktop preview height override.

What remains risky:

- The full drag matrix has not been green after the latest precision edit.
- The scale-floor patch is broad and could change composition behavior for larger layouts.
- Multi-panel cases with rotated bottom drag may still have layout/scale surprises.
- Cut-outs after resizing were not re-verified after the final scale-floor patch.
- Mobile and tablet after the final scale-floor patch were not re-verified.
- Because the asset is minified, every mechanical replacement is harder to reason about than a source-level fix.

## Strong Recommendation For Claude

Do not continue by piling more minified patches on top of Codex's experimental asset unless Guido explicitly asks for a tiny surgical patch.

Preferred takeover strategy:

1. Start from a fresh duplicate of the current live theme, unless Guido explicitly approves using the current Codex duplicate.
2. Treat Codex's duplicate as a reference for symptoms, CSS selectors, and evidence only.
3. Find the original source for `innate-benchtop-configurator.js` if it exists in a build repo or theme source pipeline.
4. If source exists, fix the geometry in source and rebuild.
5. If only the minified asset exists, first unminify/prettify it into a review-only copy, then patch the minified asset only after the logic is understood.
6. Build a small deterministic harness for rotated resize before editing:
   - one rotated panel
   - one rotated panel with a cut-out
   - two panels with one rotated
   - three-panel kitchen layout with island/cutout
7. Only then modify the duplicate.

If Claude decides to continue from the Codex duplicate:

- First verify the remote duplicate hash is still `cbf57bdc533a0f10cff9d0a3f73213c042a64e6a500133a5b21661465831093f`.
- Run the latest bottom-handle precision proof.
- Run the full matrix immediately after.
- If full matrix fails, do not keep patching broadly. Inspect the exact failed case and make one tiny change.

## Likely Root Cause

There are several coordinate systems being mixed:

1. Panel data dimensions:
   - `panel.length`
   - `panel.width`

2. Display dimensions:
   - for rotated panels, display width and height are swapped
   - `yt(panel)` returns displayed width in mm
   - `bt(panel)` returns displayed height in mm

3. Local SVG rectangle coordinates:
   - `e.x`, `e.y`, `e.w`, `e.h`
   - these are pre-transform local panel coordinates

4. Visual/root SVG coordinates:
   - pointer coordinates from `getScreenCTM().inverse()`
   - these are in root SVG coordinates after the panel group has been rotated

5. CSS/rendered browser coordinates:
   - `getBoundingClientRect()`
   - these include SVG scaling, page scroll, sticky positioning, overflow clipping

The panel group is rotated with:

`rotate(90 ${e.displayX+e.displayW/2} ${e.displayY+e.displayH/2})`

This means a local edge class does not match its visual location after rotation.

Observed rendered mapping for a 90 degree rotated panel:

- local `n` appears visually right
- local `s` appears visually left
- local `w` appears visually top
- local `e` appears visually bottom

The bottom black line in Guido's screenshot is local `e` on a rotated panel. It should semantically mean "visual bottom", which should increase `panel.length` and visually extend downward.

The bug happened because:

- the data update increased length, but
- the layout scale and/or anchoring changed at the same time, so
- the browser view made the panel appear to change width and move.

The latest scale-floor patch stabilized the isolated one-panel case by preventing layout mode from re-scaling based on the current max panel width/height during resize. This may or may not be the right durable fix.

## Current Relevant Code Fragments

The asset is minified. These fragments are reference anchors.

### Rotation helper

```js
vt=e=>e.rotationDeg===90
yt=e=>vt(e)?e.width:e.length
bt=e=>vt(e)?e.length:e.width
xt=e=>{if(vt(e.panel))return`rotate(90 ${e.displayX+e.displayW/2} ${e.displayY+e.displayH/2})`}
```

### Layout scale floor, latest precision edit

Current experimental code contains:

```js
c&&(o=n/Math.max(i,2600))
```

This replaced:

```js
c&&(o=n/i)
```

Reason:

- Stop the visual scale from changing while a rotated bottom resize increases length.

Risk:

- This is a broad scale policy change.
- It may not be appropriate for all layouts.

### Bottom visual handle path

The visual bottom line on a rotated panel is the rendered local `e` edge:

```js
className:`panel-resize__edge panel-resize__edge--e`
```

Current pointerDown mapping:

```js
onPointerDown:t=>ae(t,e,vt(e.panel)?`s`:`e`)
```

This means local `e` on a rotated panel is mapped to visual `s`.

### Resize math, relevant current shape

Current experimental resize calculation has a visual-handle interpretation:

```js
let r=t.startLenMm,
    i=t.startWidthMm,
    o=t.cursorRotated?t.handle.includes(`n`)||t.handle.includes(`s`):t.handle.includes(`e`)||t.handle.includes(`w`),
    s=t.cursorRotated?t.handle.includes(`e`)||t.handle.includes(`w`):t.handle.includes(`n`)||t.handle.includes(`s`);

t.cursorRotated
  ? (
      o && (
        t.handle.includes(`s`)
          ? r=(n.y-t.startDisplayY)/t.scale
          : t.handle.includes(`n`) && (r=(t.startDisplayY+t.startDisplayH-n.y)/t.scale)
      ),
      s && (
        t.handle.includes(`e`)
          ? i=(n.x-t.startDisplayX)/t.scale
          : t.handle.includes(`w`) && (i=(t.startDisplayX+t.startDisplayW-n.x)/t.scale)
      )
    )
  : ...
```

Meaning:

- For a rotated panel, visual north/south changes length.
- Visual east/west changes width.
- It uses display coordinates rather than local box coordinates.

This is conceptually closer, but may still be fragile.

## What I Would Do Differently From Here

If starting clean, I would not try to keep patching from this exact bundle first.

I would implement a clear geometry model:

1. Represent each panel in world/layout coordinates as an axis-aligned display rectangle:
   - `displayXmm`
   - `displayYmm`
   - `displayWmm`
   - `displayHmm`

2. For resize, map the grabbed visual handle directly to display-rectangle changes:
   - visual top: decrease `displayYmm`, increase `displayHmm`
   - visual bottom: increase `displayHmm`
   - visual left: decrease `displayXmm`, increase `displayWmm`
   - visual right: increase `displayWmm`

3. Convert the new display rectangle back to panel dimensions:
   - if unrotated:
     - `panel.length = displayWmm`
     - `panel.width = displayHmm`
   - if rotated:
     - `panel.width = displayWmm`
     - `panel.length = displayHmm`

4. Update layout:
   - `layout.xMm = displayXmm`
   - `layout.yMm = displayYmm`

5. Render from the display rectangle, not from a rotated local rectangle that then needs post-hoc compensation.

This would avoid the current tangle where local edge classes, visual edge positions, data dimensions, and CSS scaling all interact.

## Suggested Claude Plan

### Phase 1: Verify current state, do not edit

1. Open the duplicate preview:

   `https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141492912187&_ab=0&_fd=0&_sc=1`

2. Verify the asset script:

   - should load from `cdn/shop/t/92`
   - should hash to `cbf57bdc533a0f10cff9d0a3f73213c042a64e6a500133a5b21661465831093f`

3. Reproduce Guido's screenshot manually or with Playwright:

   - one rotated panel
   - drag bottom black line downward
   - observe whether it extends down or changes width/moves

4. Run the targeted proof:

   `results.json` reference:

   `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-28/benchtop-bottom-handle-precision-20260627T123756Z/results.json`

5. Run the full matrix:

   ```bash
   BENCHTOP_QA_URL='https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141492912187&_ab=0&_fd=0&_sc=1' \
   BENCHTOP_PREVIEW_THEME_ID=141492912187 \
   node /Users/mack-mini/innate-mission-control/scripts/qa-benchtop-rotated-drag-matrix.mjs
   ```

Do not edit before this.

### Phase 2: Decide whether to continue current duplicate or start fresh

Recommended:

- Start fresh from live.
- Use current duplicate only as a symptom/reference.

Acceptable if Guido asks:

- Continue current duplicate but only with one surgical change at a time.

### Phase 3: Build a small debug harness

Use Playwright to capture after each drag:

- `panel.length`
- `panel.width`
- `layout.xMm`
- `layout.yMm`
- SVG bounding boxes
- handle class under mouse
- `elementsFromPoint`
- `getCTM` for the panel group
- rendered `getBoundingClientRect` before/after

Make sure the harness stores:

- URL
- asset URL
- asset hash
- before screenshot
- after screenshot
- JSON state

### Phase 4: Fix at the geometry layer

Avoid more CSS-only compensation unless the issue is definitively hit-testing or clipping.

For the bottom handle issue, the durable fix should likely be:

- map the pointer delta to visual display rectangle delta
- update dimensions/layout consistently
- keep scale stable during active resize
- only recompute scale after commit if desired, but ideally never in a way that changes the apparent direction mid-drag

## Exact Known Failure Mode From Guido's Screenshot

In the screenshot, the panel is rotated, and the bottom black line is centered between the bottom corner circles.

Expected behavior:

- dragging that line downward should make the panel taller on screen
- top edge should remain stable
- left/right width should remain stable
- corner circles should stay attached to the new bottom corners

Observed bad behavior before latest precision edit:

- length data increased, but visually width changed and the panel moved
- this was because scale/layout recomputed while resizing

Latest targeted proof says this exact one-panel case improved after the scale-floor patch, but Guido says it still does not work well manually. Trust Guido's eyes over the isolated probe.

Possible reasons the automated proof can pass while manual UX feels bad:

- the proof uses one panel, while Guido may be using multiple panels
- the proof scrolls/positions differently
- the proof drags a precise SVG rect center, while manual pointer starts on/near the visible black line/corner overlap
- the proof tests only one drag distance
- the proof does not test repeated drag/resize after prior moves
- the proof does not test with another panel influencing layout scale
- the proof does not test all viewport sizes or page zoom/device pixel ratios

## Files And Scripts To Know

Main asset:

`/Users/mack-mini/.hermes/work/fresh-shopify-theme-duplicates/benchtop-configurator-live-duplicate-20260627-141492912187/assets/innate-benchtop-configurator.js`

Guard script:

`/Users/mack-mini/innate-mission-control/scripts/guard-shopify-asset-source.mjs`

Full matrix script:

`/Users/mack-mini/innate-mission-control/scripts/qa-benchtop-rotated-drag-matrix.mjs`

Earlier smoke/deep scripts worth inspecting:

`/Users/mack-mini/innate-mission-control/scripts/dogfood-benchtop-live-surface-focused.mjs`

`/Users/mack-mini/innate-mission-control/scripts/dogfood-benchtop-live-surface.mjs`

`/Users/mack-mini/innate-mission-control/scripts/qa-benchtop-preview-desktop-smoke.mjs`

## Most Relevant Evidence Directories

Latest targeted bottom proof:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-28/benchtop-bottom-handle-precision-20260627T123756Z`

Latest full matrix before scale-floor patch:

`/Users/mack-mini/innate-mission-control/reference/evidence/20260627-benchtop-rotated-drag-matrix/20260627T105038Z`

Final quick proof before scale-floor patch:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-27/benchtop-final-quick-proof-20260627T105459Z`

Cursor/surface proof:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-27/benchtop-rotated-cursor-surface-20260627T100226Z`

Earlier broad pass, before later edits:

`/Users/mack-mini/innate-mission-control/reference/evidence/20260627-benchtop-rotated-drag-matrix/20260627T080532Z`

Earlier rotated visual handles proof:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-27/benchtop-computer-request-rotated-visual-handles-20260627T080318Z`

Earlier multi-panel/cutout/breathing proof:

`/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-27/benchtop-computer-request-multipanel-cutout-breathing-20260627T080501Z`

## Known Bad Direction From Codex

Avoid repeating this pattern:

- changing a broad CSS/layout rule
- running one targeted proof
- declaring fixed
- then discovering the full matrix regressed

This happened repeatedly.

What worked better:

- exact `elementsFromPoint` hit-testing at the handle center
- checking computed CSS rules and which selector wins
- measuring before/after rendered panel box
- checking actual input values for length/width after drag
- verifying the served remote asset hash, not local assumptions

## Claude Should Be Skeptical Of These Codex Assumptions

1. The scale-floor patch may be a workaround, not a fix.
2. The visual handle remapping may be conceptually right but implemented in the wrong layer.
3. The 720px desktop height override may be masking a deeper SVG sizing issue.
4. The minified asset may be the wrong place to solve this if source exists.
5. A one-panel pass does not imply multi-panel/cutout pass.
6. A headless Playwright pass does not necessarily match manual pointer feel.

## What Not To Do

- Do not push live.
- Do not touch theme `141492486203`.
- Do not rely on stale local theme source.
- Do not continue from this handover without verifying the duplicate asset hash.
- Do not call the current state fixed.
- Do not broaden scope into dining table/homepage.
- Do not edit several unrelated layout systems at once.
- Do not optimize aesthetics before geometry is correct.

## What To Tell Guido Before Editing

Suggested concise message:

"I have read the handover. I am not going to push live or touch Claude's other duplicate. I am going to verify the current duplicate behavior and asset hash first, then either start from a fresh live duplicate or make one surgical geometry change on the benchtop duplicate, depending on what the proof shows."

## Current Best Preview Link

`https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141492912187&_ab=0&_fd=0&_sc=1`

Remember:

- This is not live.
- It is not cleanly approved.
- It contains experimental Codex patches.
- It should be treated as a reference or staging branch, not a final candidate.

## Current Bottom Line

Codex got closer but did not earn a "done" claim. The latest isolated bottom-handle probe passes, but Guido's manual observation says the UX still feels wrong. Claude should approach this as a geometry reset/debug task, not as a final polish task.

The safest next move is not another broad patch. It is a clean verification pass and a source-level or model-level correction of rotated-panel resize geometry.
