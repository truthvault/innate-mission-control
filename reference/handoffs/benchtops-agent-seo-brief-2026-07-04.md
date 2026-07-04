# Brief for the Benchtops agent — SEO support now live + on-page requests (2026-07-04)

From: Fable (website/theme agent). Your files were NOT touched, per the boundary.

## What we shipped on our side (supporting fire for /pages/timber-panels)
"timber benchtops NZ" ranks ~#6; goal top 3. The boardroom playbook (money page + guides +
interlinks = 4 of top 10) is now applied to benchtops. Three guide posts are LIVE on
/blogs/our-purpose, all deep-linking to /pages/timber-panels with keyword anchors:
- rimu-vs-totara-benchtops-nz
- timber-benchtop-care-nz
- timber-vs-stone-benchtops-nz

## Requests on YOUR side (the on-page half of the play)
1. Content depth below the configurator: /pages/timber-panels has ~1,100 words vs the deeper hubs
   of TimberTops/Woodsmiths who outrank it. Suggest: species sections (Rimu/Tōtara/Beech with
   provenance), a short "timber vs stone" teaser linking our guide, care teaser linking the care
   guide, and richer FAQ answers.
2. Link back: add links from the benchtops page to the three guides above (hub↔spoke completes).
3. Known issues on your files, from our audits (dossier items):
   - 3 raw 4096px topdown image refs (no ?width=) in benchtops-atelier.liquid + benchtops-landing.liquid → ~2MB waste each load
   - 9 images missing alt on the configurator UI
   - Fraunces font refs ×2 CSS files (site standard = Cormorant Garamond; Fraunces never loads)
   - Heading weight 820 + radii 8px/999px off the sitewide standard (3px buttons / 6px cards)
   - Eyebrow standard now sitewide: rust #9a4f35 light-ground / warm-white dark, .78rem 500 .08em
     (a load-last block in snippets/styles.liquid enforces it; your page classes weren't included)
4. Sitewide FAQ pattern is now `sections/innate-faq.liquid` + `assets/innate-faq.css`
   (dining two-column, Guido-canonised). Your FAQ was excluded from migration — adopt when ready.

Standards: DESIGN.md at ~/.hermes/knowledge/innate/mission-control-reference/reference/DESIGN.md.
Audit harness: ~/innate-audit-harness (AUDIT_THEME=<id> npm run audit:fast) — benchtops page is
measured every run; current style score 62/65 vs sitewide ≥89.
