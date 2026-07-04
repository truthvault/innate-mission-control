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
