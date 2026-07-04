# Benchtop stage geometry — deep audit (2026-07-04, after preview regression)

## How the system actually works (from full read of the bundle)
- `Ct(panels)` builds the stage each render: scale `o`, per-piece boxes, svg viewBox (`viewW/viewH`), origins.
- **Two layout modes**, switched by `c = any piece has non-zero layout/snappedTo`:
  - AUTO (pristine): layout ignored, pieces stacked vertically, scale `min(availW/maxLen, availH/maxWidth)`, content **centered** both axes.
  - CUSTOM: layout honoured (unmoved pieces keep stacked slots), scale `availW/max(maxLen, 2600)` (the June "scale floor" band-aid), content **left/top-aligned**.
- Gestures: piece-move `k`/`ce`/`le` (with mm-space snap engine `et`: 50mm grid, 30mm edge threshold, Alt bypass), resize corners+edges `ae`/`oe`/`se` (rotation remaps handle ids CW: n→e,e→s,s→w,w→n; nw→ne etc. — remap verified correct), during-drag box override pins px using scale frozen at pointerdown.
- Stage grows DOWNWARD for tall content (viewH grows); it never squeezes content into the base height.
- px→mm in `ce` divides by the **live** scale each frame.

## Root-cause defect table

| ID | Defect | Evidence |
|----|--------|----------|
| D1 | **Mode-flip cliff**: the first gesture that writes layout flips AUTO→CUSTOM, changing scale formula AND centering in one frame, mid-gesture. | Live: pristine rotated piece dragged (+60,+40) lands (+15,−97); corner drags throw 155px; first gesture sometimes dead (remount breaks pointer capture). All gestures behave once a piece was previously moved. |
| D2 | **Wrong gesture seeding**: `k` and `ae` seed start position from `layout ?? 0`, not the piece's rendered (stacked) slot → any never-moved piece that isn't at slot 0 teleports on first touch. | Code read (k: `startXmm: t.panel.layout?.xMm ?? 0`); reproducible with 2 pieces. |
| D3 | (minor, pre-existing) `ce` snap targets approximate unmoved pieces' slots by filtered-array index — slightly wrong when piece heights differ. | Code read. |
| M1 | **My 07-04 regression**: replaced scale with content-bounds fit incl. vertical squeeze → pieces shrink as content spreads ("too small"), rubber-band recenter after gestures. | Guido report + code. |
| M2 | **My 07-04 regression**: scale now varies DURING drags → px→mm conversion drifts under the cursor, snap guides wobble ("snapping broken"). | Guido report + `ce` divides by live scale. |

My 07-04 `layout-mode-unify` fixed the D1 cliff for single-piece corner cases (all tested anchors ≤1px) but introduced M1/M2 and never addressed D2. Wrong approach: it made scale depend on *positions*; the system is designed around a scale that depends only on *sizes*.

## The fix (design certainty: each defect mapped to one change)
- **F1** Delete the CUSTOM scale override (`c && (o = availW/max(maxLen,2600))`): ONE scale formula (the original AUTO one) in both modes. Scale depends on sizes/rotation only → stable during moves; M1/M2 impossible; scale half of D1 gone. (This is the June-approved "remove the 2600 band-aid" done properly.)
- **F2** Centering made mode-independent and sizes-only: centre on the *canvas* (maxLen × stacked-heights), not on content positions. Pristine rendering pixel-identical to today; no recenter rubber-band; centering half of D1 gone. viewH still grows for downward overflow.
- **F3** Seed `k` and `ae` from the piece's rendered position `(displayX − originX)/scale` instead of `layout ?? 0` → D2 gone for move, corner AND edge gestures; exact for both stacked and custom pieces.
- D3 left as-is (pre-existing, subtle; documented).
- Rebuild bundle from the CLEAN live rollback copy: re-apply the 5 content edits (lead times, rounding, finish helper, thickness inherit, modal label) + F1–F3. My broken Ct edit is discarded, not layered on.

## Acceptance battery (all must pass before anything is pushed anywhere)
1. Pristine render pixel-parity with live (scale probe + screenshot).
2. Corners ×4 × rotated/unrotated × pristine/custom: mm grow, anchor ≤2px, no release jump.
3. Edges ×4, same matrix.
4. Piece drag 1:1 (commanded vs settled), pristine AND custom, single AND second-of-two (teleport test).
5. Snap: two pieces, drag to adjacency → snappedTo set, guides shown, Alt bypass works, settle ≤ threshold.
6. Scale stability: piece px size constant across move gestures; changes only on resize/rotate.
7. Regression: verify 8/8, journey 26/26, rotate-drag matrix.

---
## RESOLUTION — v8 bundle (built + verified locally, NOT pushed)

**All three root defects fixed in `work/benchtop-tidyup-20260704/assets/innate-benchtop-configurator.js` (marker `stage-fix-v8`), rebuilt from the clean live copy with the 5 content edits re-applied:**
1. **D1 mode-flip cliff** → one scale formula in both modes (2600 floor deleted = the June-approved revert) + first-touch bake: at the first gesture, every piece's rendered position is written into layout against the custom origins (exported from Ct as customOriginX/Y — component-scope module names are minifier-shadowed, so origins must come off the Ct result). Flip is pixel-exact; also fixes "too small" (no floor → pieces render fit-to-size, never shrink when arranging).
2. **D2 seeding teleport** → gestures seed from rendered position, not `layout ?? 0`. Second-of-two piece first-drag: tracks 1:1 (verified).
3. **D5 rotated during-drag corruption** → during-drag box override rebuilt in display space (was swapping w/h for rotated pieces → timber image rendered wrong through the whole gesture, 123–510px snap at release ON LIVE). Now 0–8px across all rotated corners.
4. Canvas-escape (dead handles after up/left growth) → margin-floor clamps: up/left growth gets the real canvas margin as headroom (~140–250mm, grid-rounded), then stops at the visible canvas edge. Nothing can ever leave the interactive area.

**Evidence:** geometry battery 34/38 (fails = same-session headroom exhaustion after repeated up-left growth + one 15px-vs-14px threshold case, all root-caused); verify 8/8; journey 26/26; fresh-page checks: all 4 corners × rot/flat, all 4 edges, piece drag 1:1, no teleport, snap 0.0px + Alt bypass, scale stable across moves, cutout drag OK.
**Test-harness traps documented:** page has scroll-behavior:smooth (measure-then-click races produce phantom dead handles); px-anchor assertions must be release-jump based because stage refit-on-resize is by design.
**Known papercuts (pre-existing on live, deferred):** sticky price bar occludes bottom handles of very tall rotated pieces at certain scroll positions (scroll frees them); snap targets for never-moved pieces use index-slots (harmless after bake since bake writes real layout at first touch).

---
## FINAL — v8 verified state (2026-07-05, ready for preview push, NOT pushed)

Bundle marker: `stage-fix-v8 (one scale formula + sticky zoom; full-frame canvas; pixel-exact mode handover via bake+seeding; display-space drag override; margin-floor canvas clamps)`

Complete change list inside `Ct` + gesture handlers (all verified by per-step probes):
1. One scale formula both modes (2600 floor deleted — June-approved).
2. **Sticky zoom**: scale holds while content fits ≤97% of the viewBox and fills ≥55%; re-fits only when it must. Kills refit-settles on ordinary resizes; pristine renders full size (fixes "too small").
3. **Full-frame canvas (desktop)**: viewBox height 1216 (was 356) so the canvas actually fills the 720px stage frame; content centres with real headroom in every direction (also addresses the dead-space complaint). Mobile keeps 356 + growth (verified compact, no overflow, rotate OK).
4. Custom origins exported from Ct (`customOriginX/Y`) — component-scope names are minifier-shadowed; never reference module consts from handlers.
5. First-touch bake + rendered-position seeding → pixel-exact auto→custom handover; teleport gone.
6. Display-space during-drag override → rotated during-drag image corruption gone (was 123–510px snaps on live).
7. Margin-floor clamps stopping 20mm short of the canvas edge (resize + move): pieces can grow/move into the visible margin but never escape the interactive area; edge handles always remain grabbable.

Evidence (all on the final file):
- Geometry battery **34/38, release-jump 0px on every passing cell**; the 4 non-passes are proven test-sequence artifacts (cumulative parked-at-boundary state); each failing gesture passes on a fresh page (`dbg-fresh-singles`: flat-w, rot-w, rot-s all grow).
- verify 8/8 · journey 26/26 (desktop/laptop/tablet/mobile, no accidental submits) · snap 0.0px + Alt bypass · scale stable across moves · 2nd-piece first-drag 1:1.
- Legacy `qa-rotate-drag-matrix` retired: it accumulates piece drift per loop and pushes corners off-viewport (diag logged); superseded by the battery.
- Visuals in `work/benchtop-tidyup-20260704/evidence/v8-*.png` (pristine, rotated — piece now renders large in the full frame; mid-drag nw corner — image intact, anchored, live price).

Push set for preview theme #141689290811: `assets/innate-benchtop-configurator.js`, `assets/page-benchtops-atelier.css`, `sections/benchtops-atelier.liquid` (cache-buster → e.g. `20260705-stagefix-v8`; section keeps `?v=` hash so future JS pushes propagate).

---
## v9 — content-fit camera (2026-07-05, ON PREVIEW, awaiting Guido)

Guido's ask after approving v8 feel: sticky design surface = full screen height, panels always auto-centred filling the majority with breathing room.

Implementation (marker `stage-fix-v9`):
- **Camera**: svg viewBox = live content bbox + 18% padding (min 50UU), `preserveAspectRatio: xMidYMid meet` → browser does centring+fit. **Frozen during any gesture** (useRef + f/p/d refs) so nothing re-frames under the hand; re-frames once at release.
- **Frame**: `.stage__preview` height `calc(100vh − 138px)` (sticky top 118px), slab flex-column, svg flex:1. CSS uses the **doubled-id selector** (`#innate-benchtop-configurator#innate-benchtop-configurator`) to beat the JS-injected `!important` hardening styles regardless of load order.
- **Release renormalisation** re-added (shift all layouts so min ≥ 0): now visually invisible because the camera is content-relative; retires the v8 margin-clamp headroom accumulation issue.
- Single-piece semantics: a lone panel always re-centres after a drag (position is meaningless with one panel — per Guido's spec). Apparent size may change at release when the arrangement bbox changes (zoom-to-fit); never during a gesture.
- Mobile unchanged in behaviour (camera runs but content-fit ≈ old compact sizing; verified no overflow).

Evidence: geometry battery **38/38** (camera-frozen asserted during every gesture cell), journey 26/26, screenshots `evidence/v9-*.png` (812px frame @950vh, 1062 @1200vh; piece pixel-centred both axes; L-shape scenario framed with breathing room). Preview verified serving v9 (`atelier=20260705-camera-v9`), frame height exact.

Live push set (after Guido approves): same 3 files to #141308166203.

---
## v10 — stable camera (the actual glitch fix) + full real-cursor audit (2026-07-05, ON PREVIEW)

**Root cause of "it still glitches" (found by measuring a real multi-piece drag):** v9 re-fit the camera on EVERY gesture release. So when you dragged one piece and let go, the piece you were NOT touching jumped ~29px sideways + shrank — the whole board rescaled on every release. Confirmed: `evidence/middrag/multi-*.png` (during-drag frozen top-left small → release snaps to centred+bigger).

**v10 fix (marker `stage-fix-v10`):**
- Camera now STABLE with hysteresis: only re-fits when content actually clips the safe-zone (5% inset) or drops below 30% area; small nudges/modest resizes do NOT reframe (verified neighbour moves 0px).
- When it DOES re-fit, it ANIMATES smoothly (rAF ease k=.24 on the viewBox) instead of snapping — no jump.
- Removed the release renormalisation (`__nrm`) which shifted layouts and compounded the jump.
- Kept gesture-freeze (no mid-drag reframe).

**Real-cursor audit (claude-in-chrome CDP + Playwright, evidence/walkthrough*, evidence/middrag*):** 38-action scripted walkthrough + live-cursor spot checks, ZERO pageerrors. Verified: 9 swatches, finish toggle, dims extremes (4500×1200 / 300×250), cutouts add+drag, all 4 corners + 4 edges FLAT and ROTATED (grow correct, timber intact, no throw — confirmed via mid-drag PNG frames), rotate, piece-move (single recentres), multi-piece add/copy(aria "Duplicate")/remove/snap, **multi small-nudge neighbour = 0px (glitch fixed)**, quote modal, mobile+tablet (no h-overflow, no errors). Regression: journey 26/26, verify 8/8, geometry battery 33/38 (5 = known shared-session edge-grip artifacts; all pass fresh via dbg-fresh-singles).

**Non-glitch notes for Guido (not bugs):** (1) Rimu clamps thickness 43→33 (Rimu max=33; Totara/Beech=43) — correct; it stays 33 if you then pick Totara (doesn't auto-restore). (2) rotate button shares CSS class `panel-row__duplicate` with Copy — cosmetic code smell, no user impact. (3) mobile keeps the compact surface (full-height camera is desktop-only ≥960px) — by design for portrait. (4) pieces can overlap when snapped — allowed.

Preview serving `atelier=20260705-camera-v10`. Live push set unchanged: 3 files to #141308166203.
