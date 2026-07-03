# Website Agent Brand Kit

Status: active agent-facing brand/design standard.
Purpose: help Website agents make Innate pages better without rewriting approved content, chasing stale theme facts, or drifting away from the current visual system.

This file is not approval to edit Shopify, publish, deploy, or touch live customer-visible systems. Current theme IDs and source-of-truth rules live in `docs/current/site-state.md`; Shopify workflow and approval rules live in `docs/current/shopify-workflow.md`.

## How To Use This File

Use this as the judgement document. Use `docs/current/brand-theme-standard.md` as the compact current-token/style crib sheet. Use `docs/current/visual-qa-checklist.md` as the proof protocol before telling Guido something is ready.

When there is conflict:

1. Current live/source truth beats local files.
2. Guido's explicit request beats generic brand preference.
3. Approved existing wording/content is preserved unless copy/content changes are requested.
4. This brand kit beats old archived brand-kit/playbook files.
5. Current theme IDs live only in `site-state.md`, not here.

## Agent Rule

Preserve approved wording, products, page structure, CTAs, and Shopify editability unless Guido explicitly asks for copy, content, or information-architecture changes.

For design updates, improve the existing surface first. Do not turn a small spacing/crop/visual request into a redesign. Do not remove useful information just to make the page look cleaner.

## Change Contract

Before editing, state or internally lock this contract:

- target source: live site, preview theme, local draft, screenshot, Shopify Admin/content, or app route;
- change mode: tiny visual fix, section polish, page refresh, new section/page, or copy rewrite;
- preserve: wording, products, CTAs, page sections, source data, images, Shopify editability, or screenshot target;
- allowed to change: spacing, hierarchy, crops, CSS, section order, schema settings, copy, images, or links;
- forbidden: live write, global drift, copy rewrite, image replacement, content removal, or broad refactor unless explicitly approved;
- proof required: exact URL/source, desktop/tablet/mobile visual proof, Shopify editability summary, and live touched yes/no.

If the contract is unclear, ask the smallest clarifying question or choose the conservative path: preserve content and make the smallest visual improvement.

## Design Change Modes

### Tiny Visual Fix

Use for spacing, crop, wrap, button alignment, white edge, mobile overflow, raw widget styling, or screenshot mismatch.

Preserve:

- wording;
- CTAs;
- products;
- order of useful information;
- Shopify editability;
- screenshot target, if Guido provided one.

Allowed:

- targeted CSS;
- one crop/object-position fix;
- alignment, spacing, contrast, or wrapping changes;
- tiny markup adjustment if required for the visual fix.

Forbidden:

- rewriting copy;
- replacing imagery unless the crop cannot be repaired;
- redesigning the section;
- touching global header/footer/product cards unless the bug is explicitly global.

Proof:

- desktop and mobile at minimum;
- intermediate/tablet if the defect is responsive or crop-related;
- exact selector/component/file changed.

### Section Polish

Use for improving a specific section while keeping page intent.

Preserve approved content. Improve hierarchy, spacing, card rhythm, crops, CTAs, form clarity, and Shopify editability. Do not refactor unrelated sections.

Safe examples:

- tighten a proof block so images and captions feel related;
- make a form visibly usable;
- align cards and CTA spacing;
- convert hardcoded repeatable content into Shopify blocks without changing visible wording.

Ask first when:

- removing a proof point;
- changing CTA text;
- replacing customer-facing imagery;
- changing section order in a way that alters the buyer journey.

### Page Refresh

Use only when Guido explicitly asks for broader page improvement.

Confirm the page family and source of truth. Keep useful content unless removal is approved. Use the relevant page-family recipe below. Confirm Shopify editor controls before review.

### New Page / New Section

Use the page-family recipe and reusable section blocks. Make text, images, links, cards, FAQs, proof points, and section order editable in Shopify where practical.

### Copy Rewrite

Only rewrite wording when Guido asks for copy changes or approves a draft. Otherwise design work preserves wording. CTA examples in this document are for new sections or approved copy work only.

## North Star

Innate should feel like a thoughtful Christchurch workshop that knows timber deeply, explains decisions plainly, and makes serious furniture feel understandable.

The website should be:

- warm without becoming beige;
- elegant without becoming luxury-showroom fluff;
- practical without feeling plain;
- SEO-rich without reading like SEO copy;
- commercial-capable without losing the workshop/human feel;
- consistent across pages without making every page identical.

## Design Principles

1. Useful first: every section should reduce buyer uncertainty or move the visitor toward a sensible next step.
2. Warm restraint: avoid stark white, harsh grey, raw black, heavy cream everywhere, or giant dark-green slabs without purpose.
3. Material specificity: use real timber, finish, provenance, shape, size, workshop, and project details.
4. Quiet confidence: strong design, clear CTAs, no hype language.
5. SEO by structure: H1, intro, cards, FAQs, internal links, and alt text are part of design.
6. Real imagery: use Innate product, workshop, timber, people, and project photos. No generic stock feel.
7. Controlled variation: page families can differ, but buttons, type, spacing, cards, image behaviour, and CTA logic should feel related.

## Current Visual System

Use `docs/current/brand-theme-standard.md` for the compact current values. These are the judgement rules.

### Type

- Display headings: Cormorant Garamond, usually weight 600.
- Body, buttons, forms, nav, captions, proof text: Maven Pro.
- Fraunces is legacy/draft only unless Guido explicitly chooses to return to it.
- H1 size depends on page type:
  - image-led hero pages can be larger;
  - split/service/editorial pages should be calmer;
  - About, Contact, forms, FAQs, policy, and utility pages should be quieter.
- H2s must be clearly smaller than H1s.
- Avoid awkward orphan words in headings when the layout has room.
- Do not italicise whole headings. Use rare emphasis on one or two words only when it looks intentional.

### Colour

- Forest is the primary action and trust colour.
- Warm paper/cream backgrounds should support the work, not become a beige wash.
- Rust `#9a4f35` is a preferred Innate accent. Guido likes this styling. Use it deliberately for small labels, dividers, metadata, numbers, rules, or short emphasis.
- Do not use rust as the main CTA colour.
- Avoid pages that become all beige, all grey, all dark green, all brown/orange, or otherwise one-note.
- Do not use bright green, orange, red, blue, or gold CTAs.

### Buttons And CTAs

- Buttons are rectangular, restrained, and small-radius. No pill buttons unless explicitly approved.
- Primary CTA: forest background with warm-light text.
- Secondary CTA: transparent/warm background with forest border/text.
- Button labels should describe the action, not default to `Learn more`.
- Use one primary next step and, where useful, one lower-pressure secondary option.
- Do not create more than two competing CTAs in one section.

CTA examples for new sections or approved copy work:

- `Talk to us about a table`
- `Start a boardroom table enquiry`
- `Open the benchtop configurator`
- `Send us your rough dimensions`
- `Book a workshop visit`
- `See timber options`
- `View recent work`
- `Order timber samples`

### Layout And Cards

- Give major sections breathing room.
- Keep prose columns readable; do not run long body text full-width.
- Cards are for repeated items, product choices, forms, examples, proof, or real objects.
- Do not put cards inside cards.
- Keep borders quiet but visible.
- Keep image ratios stable.
- Avoid dead zones above important content.
- Mobile must be designed, not merely stacked.

### Forms

- Fields must be obvious.
- Use white or high-contrast field backgrounds, visible borders, readable placeholder text, and clear focus states.
- Large text boxes must not disappear into the page background.
- Make tap targets comfortable on mobile.

### Images

- Prefer real Innate workshop, product, timber, people, and project images.
- Avoid AI-looking images unless explicitly approved.
- Crops must protect faces, heads, hands, tools, furniture edges, timber detail, and room context.
- Check image crops on desktop, intermediate/tablet, and mobile before review.
- Live pages must reference permanent image sources: Shopify Files, live theme assets, product media, or the correct external app. Do not leave live content dependent on staging theme asset URLs.
- If imagery is weak or wrong, flag the image problem instead of writing around it.

### Accordions And Widgets

- Use the approved dining-style accordion: clear rows, subtle borders, compact type, visible plus/minus control, readable open state.
- Google Reviews should match the homepage treatment.
- Do not ship raw app, form, newsletter, Google Reviews, or Shopify default styling on polished pages.

## Page Family Recipes

### Image-Led Pages

Examples: homepage, boardroom, selected commercial/project pages.

Must preserve:

- strong first impression;
- real image or verified visual asset;
- clear H1 and one primary next step;
- proof/recent work where present.

Safe improvements:

- better crop, overlay contrast, and heading rhythm;
- cleaner CTA hierarchy;
- stronger proof captions;
- calmer section transitions.

Avoid:

- generic stock/AI feel;
- hero text in a card unless already approved;
- replacing specific workshop proof with vague brand copy.

QA focus:

- mobile crop and overlay contrast;
- H1/CTA order;
- first viewport plus one proof/recent-work section.

### Editorial Landing Pages

Examples: dining, outdoor, commercial, material/category pages.

Must preserve:

- one SEO-aligned H1;
- intro near the top;
- useful buying guidance;
- product/range paths or enquiry path;
- specific FAQs/proof where present.

Safe improvements:

- make options easier to scan;
- keep product grid or buyer action high;
- improve card rhythm and internal links;
- clarify practical guidance without adding filler.

Avoid:

- burying products under SEO text;
- hidden SEO dump blocks;
- removing useful buyer information to make the page shorter.

QA focus:

- first viewport clarity;
- product/action visibility;
- FAQ/card readability on mobile.

### Product / Configurator Flows

Examples: benchtop configurator and future custom quote tools.

Must preserve:

- current calculation/selection behaviour;
- selected-object state;
- quote/next-step clarity;
- fallback contact path.

Safe improvements:

- clearer input hierarchy;
- better mobile tabs and control spacing;
- helper copy beside form steps;
- visual alignment with Shopify pages.

Avoid:

- changing calculations while doing visual work;
- making the app feel like a separate pasted-in tool;
- hiding fallback/contact help.

QA focus:

- desktop and mobile selection sync;
- canvas-to-card/tab and card/tab-to-canvas selection;
- rotate/resize target ownership;
- quote/result clarity.

### Contact / Conversion Pages

Examples: contact, quote, enquiry pages.

Must preserve:

- direct contact options;
- visible form/enquiry path;
- workshop visit details where present;
- what to send us;
- reply-time reassurance where present.

Safe improvements:

- field contrast;
- mobile spacing;
- clearer trust/reassurance hierarchy;
- practical CTA placement.

Avoid:

- loud hero treatment;
- hiding phone/email/form behind decorative sections;
- making the page feel like a marketing landing page instead of a useful contact route.

QA focus:

- form field visibility;
- tap targets;
- focus states;
- first viewport usefulness.

### Utility / Trust Pages

Examples: About, FAQ, care, policy, delivery, installation.

Must preserve:

- clear answers;
- practical navigation;
- trust details;
- legal/care accuracy.

Safe improvements:

- quieter type scale;
- better scan structure;
- clearer accordions or sections;
- improved image crops if images exist.

Avoid:

- loud hero-sized H1s;
- turning help pages into marketing pages;
- removing caveats or practical detail.

QA focus:

- readability;
- heading hierarchy;
- mobile line length;
- no hidden important details.

## Reusable Section Blocks

- Hero / intro: one H1 aligned with intent; short plain-English support copy; primary CTA; optional secondary CTA; real image or warm editorial background.
- Material/options cards: answer what can I choose? Include timber species, shapes, base styles, finishes, Alfresco vs timber outdoor, power/cable options, or samples.
- Process/journey: make custom feel low-risk: brief/choose/configure, quote/refine, made/delivered/installed.
- Proof/recent work: real project/product imagery with concise captions. No empty testimonial puffery.
- FAQ: real buyer questions; specific honest answers; internal links; FAQ schema where practical.
- Final CTA band: short, warm, practical, conversion-led.

## Copy Voice

One-liner: a thoughtful Christchurch workshop that knows timber deeply, explains decisions plainly, and is quietly proud.

Use:

- plainspoken expertise;
- real materials and decisions;
- Christchurch workshop grounding;
- provenance where relevant;
- practical guidance;
- calm next steps.

Avoid:

- luxury;
- premium;
- exclusive;
- elite;
- masterpiece;
- elevate your space;
- crafted to perfection;
- timeless as filler;
- vague eco-friendly claims;
- over-polished agency language;
- generic Shopify catalogue copy;
- competitor names.

Good tone pattern: start with the real thing, explain the judgement, make the choice easier, then offer a natural next step.

Use NZ spelling: colour, centre, organise, fibre.

## Claim Guardrails

- Safe when accurate: responsibly sourced, selected NZ timbers, made to order, repairable finish, locally made in Christchurch.
- Outdoor timber is not maintenance-free. Use careful maintenance language.
- Porcelain/Alfresco can be low-maintenance, not maintenance-free.
- Do not use absolute claims such as lifetime of use, virtually indestructible, fully sustainable, carbon negative, or weatherproof unless the evidence is explicit and current.

## Acceptance Summary

Before saying a Website design change is ready, run `docs/current/visual-qa-checklist.md`. For whole-site consistency scans or broad formatting checks, run `docs/current/website-visual-audit-protocol.md` first and review the saved screenshots/report.

The short version:

- exact source of truth was checked;
- visual proof covers the relevant desktop/intermediate/mobile views;
- no key information was removed;
- image crops protect people, furniture, timber, tools, and room context;
- main content remains editable in Shopify where practical;
- handoff says what changed, what was checked, whether live was touched, and how Guido can edit the page.

## Source Pointers

- Current live/site/theme state: `docs/current/site-state.md`.
- Shopify workflow and approval gates: `docs/current/shopify-workflow.md`.
- Current token/style quick reference: `docs/current/brand-theme-standard.md`.
- Visual QA protocol: `docs/current/visual-qa-checklist.md`.
- Whole-site visual audit protocol: `docs/current/website-visual-audit-protocol.md`.
- Known failure modes: `docs/current/known-failure-modes.md`.
- Historical rich brand kit source, for archaeology only: `/Users/mack-mini/.hermes/knowledge/innate/mission-control-reference/reference/brand-kit.md`.
