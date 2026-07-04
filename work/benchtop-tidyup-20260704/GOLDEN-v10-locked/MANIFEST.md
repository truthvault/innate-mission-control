# 🔒 GOLDEN LOCK — Benchtop configurator v10 (2026-07-05)

This directory is an **immutable snapshot** of the exact working configurator that
Guido approved. Its purpose: **never lose the rotated-panel drag feature again.**

Guido fought for months to get this working. It has regressed multiple times. If a
future change breaks it, `VERIFY.sh` fails loudly and you restore from here.

## The protected feature
A **rotated (90°) benchtop panel can be dragged from all four corners** and it
resizes accurately:
- dragging a corner outward grows the panel (correct mm),
- the opposite corner stays anchored (no throw / jump during the drag),
- the timber image never flips or corrupts mid-drag,
- on release the camera re-frames smoothly (animated) and keeps the piece centred.

Also locked in (the full v10 behaviour):
- Stable camera — moving/resizing one piece does NOT move the others (the "glitch"),
- smooth animated re-fit only when content genuinely needs it,
- all content edits (lead times 6/8wk, whole-dollar rounding, Raw helper, thickness
  inherit, "Total incl GST"), compact 9-swatch picker, full-height desktop surface.

## What's in here (the 3 live files, byte-frozen)
| File | Pushes to (live theme #141308166203) |
|------|----------------------------------------|
| `innate-benchtop-configurator.js`  | `assets/innate-benchtop-configurator.js` (marker `stage-fix-v10`) |
| `page-benchtops-atelier.css`       | `assets/page-benchtops-atelier.css` (block `innate-benchtop-stage-camera-20260705`) |
| `benchtops-atelier.liquid`         | `sections/benchtops-atelier.liquid` (cache-buster `atelier=20260705-camera-v10`) |

Checksums are in `CHECKSUMS.md5`. The working copies live one level up in
`../assets/` and `../sections/`; these golden copies are the reference of record.

## Verify the feature is still intact
```bash
cd GOLDEN-v10-locked
./VERIFY.sh                 # checks working files == golden AND runs the canary
```
Or run the canary against any target:
```bash
NODE_PATH=~/innate-mission-control/node_modules node lock-rotated-corners.mjs                  # the golden bundle
PREVIEW_THEME=141689290811 NODE_PATH=~/... node lock-rotated-corners.mjs                        # the deployed preview
LIVE=1 NODE_PATH=~/... node lock-rotated-corners.mjs                                            # production
```
Exit 0 = feature intact. Exit 1 = REGRESSION — do not ship; restore from golden.

## Restore (if a future edit breaks it)
```bash
cp GOLDEN-v10-locked/innate-benchtop-configurator.js ../assets/
cp GOLDEN-v10-locked/page-benchtops-atelier.css       ../assets/
cp GOLDEN-v10-locked/benchtops-atelier.liquid         ../sections/
```
Then push the 3 files to the live theme with `--only … --nodelete --allow-live`.

## Git
Committed and tagged `benchtop-golden-v10` in the `innate-mission-control` repo.
`git checkout benchtop-golden-v10 -- work/benchtop-tidyup-20260704/GOLDEN-v10-locked`
restores this snapshot from anywhere.

## Rule for future work
**Before pushing ANY benchtop change to live, `./VERIFY.sh` must pass.**
If you only touch pricing/copy/CSS, run it anyway — the camera/gesture code is
fragile and has broken from unrelated edits before.
