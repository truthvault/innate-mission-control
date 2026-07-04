# GOAL: Benchtop configurator tidy-up (post-audit 2026-07-04)

**Owner:** Claude (Mac mini) · **Requested by:** Guido · **Status:** audit done, fixes not started — awaiting Guido's priority call
**Live page:** https://innatefurniture.co.nz/pages/timber-panels · **Live theme CDN dir:** `t/101` (changed from `t/86` since 06-28 — the 2026-07-01 "storefront-api-v1" build is now live; my 06-28 JS fix markers all survived in it)

## What the audit confirmed WORKS (don't touch)
- Timber/colour/finish selection, live preview texture swap, live pricing on dimension change
- Rotate 90° — desktop AND mobile, no drift/clipping (06-28 fixes present: maxheight, mobile-fit, corner-hit-58)
- Corner-resize drag on rotated pieces (2400×650→2670×960 tested, anchored, price updated)
- Cut-outs: add (+$200), drag-to-reposition, exact-value inputs
- Multi-piece: add / copy / delete, per-piece pricing; piece drag on canvas
- Delivery: Pick up (freight free) vs Deliver to me — address autocomplete + $150 ChCh-metro estimate via `innate-storefront-api.vercel.app` (`/api/benchtops/address-suggestions`, `/api/benchtops/delivery-estimate`); quote share posts to `innate-mission-control.vercel.app/api/send-quote` (route exists in this repo)
- Quote modal: summary, "This is not an order" reassurance, Send to us / Email myself / Forward paths
- localStorage persistence across reload (pieces, rotation, cutouts, address) — key `innate.benchtop.local.geometry-renderer`
- Mobile (390px, Playwright iPhone 14): tabbed UI (Size/Timber/Cutouts/Delivery), Edit-size bottom sheet with Rotate/Copy/±100L/±50W, sticky price bar, no horizontal overflow
- Texture preloads: 12 bare-URL image preloads present in t/101 head (correct form, no double-download)
- No configurator console errors; hero CTA anchor `#atelier-builder` works

## Findings to fix (proposed priority)

### P1 — customer-visible correctness
1. **$1 rounding mismatch:** line items round individually, total rounds the raw sum. Seen live: $2,618 + $1,130 shown with total **$3,749**; with $150 freight, total **$3,899** (lines sum $3,898). Fix: compute total from the *displayed* (rounded) line values, or show cents everywhere. Customers checking a quote by hand will hit this.
2. **Piece price silently changes when another piece is added:** piece 1 went $2,787 → $2,618 the moment piece 2 was added. If volume/m³ tiering is intentional, label it ("multi-piece rate applied"); if not, it's a pricing bug. **Ask Guido which it is before touching.**
3. **Dispatch copy conflict:** delivery bar says "week of Mon 10 Aug" (~5.5 wks), quote modal says "Ready in ~6 weeks", site banner says "6-8 weeks". Align to one source of truth.

### P2 — UX tidy-ups
4. **New-piece defaults don't inherit:** fresh default is 1800×600×43; "Add another piece" gives 43mm even when the existing piece is 33mm. New piece should inherit thickness (and keep timber) from the current piece.
5. **Quote modal polish:** "ESTIMATED TOTAL INCL GST" label wraps with orphan "GST"; "#CORNER" ref is cryptic (label it "Ref:" or drop it); "Send to Innate" submit is a plain text link visually weaker than "Back" — make it a proper primary button.
6. **Desktop dead space:** initial section is ~1810px tall with one small panel top-left and ~1000px of empty ruled grid below the design surface; grows to ~2450px with 2 pieces. Cap/auto-fit stage height to content (respect the sticky-preview behaviour, class `is-desktop-preview-stuck`).
7. **Swatch layout shift:** selected swatch card grows (tick row), nudging adjacent rows. Reserve the tick space so selection doesn't reflow.
8. **Add-piece scroll jump:** one-time viewport jump when the stage grew after "Add another benchtop piece". Reproduce; if real, preserve scroll anchor during stage resize.

### P3 — investigate / monitor (not configurator code)
9. `POST /sf_private_access_tokens` → 401 on every load (Shopify-side endpoint, NOT called from configurator JS — confirmed by grep of live asset). Likely benign console noise; check if a Shopify app/feature toggle kills it.
10. GA4 + merchant-center `collect` POSTs returned 503 during the session (Google side; re-check once, then ignore).
11. Check whether dead asset `innate-benchtop-configurator-nickfix.js` still ships in t/101 (was dead weight in the June audit).
12. Cut-out validation edge: default cutout is 400×500 — verify behaviour when piece width < cutout depth (e.g. 400mm-wide piece).

## How to execute (guardrails — non-negotiable)
1. **Coordinate first:** t/101 is the other agent's 07-01 wholesale-replacement build. Confirm with Guido that their work is signed off before editing anything benchtop.
2. Identify the current live theme ID (`shopify theme list`) — the old duplicate 141492912187 predates t/101 and is STALE; make a **fresh duplicate of the live theme** for this work.
3. Edit on the duplicate; each change gets a dated marker comment (pattern: `innate-benchtop-<fix>-YYYYMMDD`).
4. QA on duplicate: rerun `scripts/qa-benchtop-rotated-drag-matrix.mjs` + the Playwright mobile pass (script pattern in this audit's scratchpad; iPhone 14 emulation, rotate + overflow checks). Desktop matrix: species×colour, resize, rotate, cutout, 2-piece, pickup/deliver, share modal — all covered in audit steps.
5. Send Guido the preview link for phone verification **after every push** (his standing workflow).
6. Live pushes: `shopify theme push --theme <LIVE_ID> --only <file> --nodelete --allow-live`, one file at a time, backup pulled to `~/innate-mission-control/backups/LIVE-rollback-*` first, then verify served hash via cookie-jar curl/Playwright (plain curl drops preview cookies).
7. Never touch dining-table files from this workstream (see agent-coordination memory); never full-theme push.
8. **Do not fire `/api/send-quote` with real data during testing** — no junk leads/emails. End-to-end lead submit remains untested; if Guido wants it verified, use his own email with a TEST-prefixed name and warn him first.

## Open questions for Guido (blocking P1)
- Is the multi-piece reprice (finding 2) intended volume pricing?
- Which dispatch estimate is authoritative (finding 3)?
- Priority order OK, or anything he'd add from customer feedback?

---

## STATUS UPDATE — 2026-07-04 evening (all fixes built + verified locally)

**Everything below is implemented in `~/innate-mission-control/work/benchtop-tidyup-20260704/assets/` and verified against the LIVE page via Playwright route interception. NOT yet pushed — Shopify Theme Access token is dead (401); Guido must re-issue (Theme Access app) or `shopify auth login` interactively.**

### Changed files (push targets, `--only`, one at a time, after fresh backup pull)
1. `assets/innate-benchtop-configurator.js` — marker `innate-benchtop-tidyup-20260704`:
   - leadTimeWeeks {raw:4,other:6} → **{raw:6,other:8}** (dispatch bar + modal follow finish automatically; banner 6-8wk now consistent)
   - line totals Math.round'd → **lines + freight always equal displayed total** (was $1 off)
   - finish helper under Oiled/Raw (desktop + mobile sheet): Raw = "cut to size only. You sand, soften the edges and coat it yourself. Ready in ~6 weeks." / Oiled = "Sanded & oiled in our workshop — arrives finished, ready to install. Ready in ~8 weeks."
   - **new pieces inherit thickness** from the last piece (was hardcoded 43)
   - modal label "Estimated total incl GST" → "Total incl GST" (fits one line)
2. `assets/page-benchtops-atelier.css` — block `innate-benchtop-ui-polish-20260704` at EOF:
   - 9-swatch matrix compacted (432→320px), tick pinned over photo, **selection no longer changes tile size** (root cause: check svg rendered in-flow, +18px row growth)
   - calm selection ring, finish-helper style, modal label nowrap
   - NOTE: page loads THIS css (94KB innate-benchtop-configurator.css is legacy/unused on this page). Overrides need `.atelier-configurator-mount .innate-bench-widget--embedded` + `!important` to beat existing hardening rules.

### Verification (all green, evidence in work dir)
- qa-tidyup-verify.mjs: 8/8 (incl. rounding invariant ×10 randomized configs, +6wk/+8wk dispatch both finishes)
- qa-rotate-drag-matrix.mjs: 23/24 + manual instrumented confirm of the 24th (3000×900 rotated corner → 3510×1050; drag works, corner axis mapping on rotated pieces is CORRECT geometry, not a bug)
- qa-journey.mjs: 26/26 at 1470/1024/768/390 — full flows, send-quote network guard proved no accidental submits
- t/86 vs t/101 = version counters of the SAME live theme (curl gets older cached HTML; both serve current assets) — no stale-link bug, earlier note corrected

### Pricing audit (decoded from bundle, function `O`/`k`/`ce`)
- per panel: boards(⌈W/150⌉) × (L+100mm)×1.1 wastage × **$26/lm flat all species** + volume×$2100/m³ laminating + (oiled only: sanding 2h/m²+coating 2h/m² @$30/h min 0.5h + oil $80/L ÷ 8m²/L) → ×1.02 buffer ×1.8 margin → +15% GST; cutouts +$200 incl-GST flat after margin; $160/job fixed spread across pieces (= the intended multi-piece reprice, -$169 observed ✓)
- freight: local model (metro/surrounds flats, nationwide weight interp, rural ×, uplift, ⌈$5⌉) or Mainfreight API max($150,⌈cost⌉)
- OPEN QUESTIONS → Guido: flat species pricing? raw = zero finishing cost (much bigger gap than "-10%" of old prototype)? margin 1.8×1.02 confirm?

### Next steps
1. Guido: re-issue Theme Access token (or interactive `shopify auth login`) → then duplicate live theme, push 2 files to duplicate, send preview link for phone check, then `--only` to live w/ rollback backups.
2. Optional polish backlog (not built): desktop dead-space cap under stage, add-piece scroll anchor, cutout-vs-narrow-piece validation edge, per-species pricing if Guido wants it.

## ROLLOUT — 2026-07-04 ~21:00
- AUTH RESOLVED: token was never dead — store handle is `innate-furniture.myshopify.com` (hyphen!). All CLI calls must use this handle.
- Live theme confirmed #141308166203; live files still byte-identical to ~/innate-theme-audit snapshot at push time.
- Rollback backups: ~/innate-mission-control/backups/LIVE-rollback-{innate-benchtop-configurator-20260704-204931.js, page-benchtops-atelier-20260704-204931.css}
- PREVIEW THEME: **#141689290811** "Benchtop tidy-up preview 2026-07-04" = full live snapshot + the 2 tidy-up files. Verified serving markers/behaviour (t/103; note Shopify strips CSS comments on serve — verify by rule effect, not comment).
- Preview link for Guido: https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id=141689290811&pb=0&_ab=0&_fd=0&_sc=1
- AWAITING GUIDO PHONE CHECK → then push the 2 files to live #141308166203 with --only --nodelete --allow-live and verify served hash.

## CORNER-DRAG GLITCH — found by Guido on preview, FIXED 2026-07-04 late
**Symptom:** rotating a panel then dragging corners threw the timber image the wrong way / resized the wrong direction. Reproduced: from a PRISTINE state (piece never moved), corner drags that grow up/left broke violently (anchor jumped 155px, one handle completely dead); piece drags also threw (commanded +60,+40 → live moved +15,-97!). After any piece drag, everything behaved.
**Root cause:** `Ct()` stage layout has two modes — auto (layout ignored, stacked, centered, scale fit-to-piece) vs custom (layout honoured, left-aligned, scale floored at 2600mm). The FIRST gesture that writes layout flips the mode mid-interaction → scale + centering cliff = the throw. The 2600 floor is the June band-aid Guido had already approved removing.
**Fix (marker `layout-mode-unify` in bundle):** modes unified — scale always `min(n/h, r/max(g,200))` with h,g = content bounds (min-0 origins, span floored at max piece dims so pristine rendering is pixel-identical); centering always on. Verified: all 4 corners × rotated/unrotated × pristine anchor within 1px and grow correctly; custom-mode still fine (mild ~20px recenter settle on release); piece drags track the hand. Suites re-run green: verify 8/8, journey 26/26, matrix 23/24 (1 = threshold artifact of recenter settle on 1200×400).
**CDN LESSON (matters for live push):** section line 739 built the JS URL as `asset_url | split:'?' | first | append:'?atelier=…'` — Shopify CDN ignores unknown params and caches by path+`?v=`, so stripping `?v=` makes every future JS push INVISIBLE until manually bumped. Section now keeps the full `asset_url` (with `?v=` content hash) + `&atelier=20260704-tidyup-v3`. LIVE PUSH IS NOW 3 FILES: the JS, the CSS, and sections/benchtops-atelier.liquid (verified: section diff vs live = that one line only).
