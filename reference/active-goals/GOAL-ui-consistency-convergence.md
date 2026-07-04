# GOAL — UI/UX consistency convergence (every page obeys DESIGN.md)

Set by Guido 2026-07-04. Supersedes page restructuring plans until done: **no page gets
restructured** — same sections, same order, same content, same copy. Only the *rendering layer*
converges: type, colour, radii, eyebrows, buttons, hovers, spacing outliers, image specs. The test
is feel: click any two pages and they're unmistakably the same hand.

## Mission statement
Every in-scope page of innatefurniture.co.nz renders per DESIGN.md
(~/.hermes/knowledge/innate/mission-control-reference/reference/DESIGN.md), verified by the
harness (~/innate-audit-harness) and by side-by-side vision review, without any structural,
content, or copy change.

## Hard guardrails
1. NO sections added, removed, or reordered. NO copy edits. NO template restructuring.
2. If a fix requires restructuring to satisfy a rule (e.g. G6 CTA placement), it is OUT of this
   goal — log it for the later page-overhaul phase instead.
3. Benchtops page + configurator files: measure and dossier only, never edit.
4. Footer: measure only (its redesign is a separate approved mini-project; don't half-fix it).
5. Duplicate-first, backups, diff-checks, only Guido promotes to live. Load DESIGN.md first.
6. Every visible delta gets listed for Guido per pass — he approves by preview, not by trust.

## Method — converge by DIMENSION across all pages, not page by page
(Fixing one dimension sitewide keeps pages mutually consistent at every step; fixing page-by-page
creates temporary incoherence and re-work.)

Pass 1 — TYPOGRAPHY: all H2/H3 section headings → Cormorant Garamond 600 (home's CG-500 set,
  boardroom 650, materials 800, product-FAQ Maven 700, benchtops-excluded 820); flag app-owned
  raw-serif headings (dining review app) and fix via app settings/CSS inheritance if safely
  possible; rationalise heading clamp() outliers TOWARD the DESIGN scale only where the visual
  delta is imperceptible (>10% size change = list for Guido first).
Pass 2 — EYEBROWS: one colour per page from {forest, rust, warm-white-on-dark}; tracking → .08em;
  size → ~.78rem. (Today: home mixes gold/rust/ink-tints on one page; three ink families sitewide.)
Pass 3 — SURFACES & BANDS: remaining rogue section backgrounds → sanctioned table; dark bands →
  forest-ink or moss only (kill the #fffdf8/#f5f1e9/#101c18-class stragglers in per-page CSS).
Pass 4 — COMPONENTS: residual radius outliers (0/2/8/18px on buttons+inputs+cards) → 3px token;
  chips stay 999px; ALL button hover/focus states verified (text never invisible, standard:
  solid-forest→forest-ink hover, glass→.52 tint).
Pass 5 — IMAGERY SPEC: remaining >300KB rendered images (dining rimu-tabletop set 367–605KB,
  home GLB poster excluded as it's functional) → recompressed in place, same art, no swaps.
Pass 6 — SIBLING FEEL CHECK (vision): standard-viewport screenshots of all 12 pages, reviewed as
  a GRID against each other + DESIGN.md; anything that reads as a different site gets logged
  (fix if rendering-layer, defer if structural).

## Verification & done criteria
- Harness fast pass after every dimension; full run at the end. NO page's style score drops, ever.
- DONE when, on every in-scope page: zero G2 heading-font violations (app-owned ones dossiered),
  zero rogue surfaces (G4), zero CTA colour/radius/label/hover violations (G5), eyebrow spec met
  (G7), zero >500KB images + dining set ≤300KB (G8), axe contrast clean (G15) — and the Pass-6
  grid review reads as one coherent site to both Fable and Guido.
- Rules explicitly excluded from this goal (structural): G6 placement, page-pattern section
  ordering, footer everything, copy-layer G12 beyond what's already live.
- Ship: per-pass previews → Guido approval → single promotion ritual at the end (or per-pass if
  he prefers), post-promotion harness on live.

## Standing habit
Any decision made while executing this goal gets written into DESIGN.md the same day.
