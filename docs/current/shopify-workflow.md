# Shopify Workflow

## First Question

What is the source?

- Live issue: inspect live site and live theme first.
- Preview/sandbox issue: inspect the exact preview theme first.
- Local draft: local files are allowed, but they are only draft files.

## Before Editing

- Name the lane: page-only, global theme, product/admin content, or SEO/admin.
- Name the exact files or admin objects in scope.
- Pull or inspect the exact target files before changing them.
- Do not use old patch folders as source.
- For `assets/innate-benchtop-configurator.js`, run `npm run guard:shopify-asset -- --candidate <local-file> --asset-key assets/innate-benchtop-configurator.js` before any preview or live push. A failing guard means the candidate is stale or drops protected behavior; stop and rebase onto the latest approved asset.
- For page work, list the Shopify editor controls that will remain available: sections, blocks, images, text, links, FAQs, cards, forms, and anything that can be reordered.
- If the change uses new images, state where the permanent image asset will live: Shopify Files, live theme asset, product media, or external app. Do not rely on staging theme asset URLs for live pages.

## While Editing

- Keep changes scoped.
- Preserve wording unless copy changes are explicitly approved.
- Prefer shared standards, but do not make global changes unless approved.
- Keep content editable in Shopify wherever practical. A polished page should still behave like a usable Shopify theme page, not a locked custom build.
- Hard-code only layout structure, reusable styling, accessibility labels, schema constants, and tiny UI labels that should not be edited day to day.

## Preview / Sandbox

- Push only explicit files to the exact approved preview/sandbox theme. Current broad tidy-up sandbox is `141105463355`; `140760219707` is an unpublished benchtops cohesion preview, not the default staging target.
- The project hook blocks stale benchtop configurator JS pushes. Do not bypass it with an override; fix the source candidate instead.
- Visually check desktop and mobile.
- Use the status: `Ready for Guido review` only after staging and visual QA are complete.
- Before review, confirm the main page content can still be edited in Shopify and say which controls are available.

## Live

- Push live only after Guido explicitly approves.
- Push only approved files to the verified live theme. As of the 2026-06-20 benchtops mobile configurator publish, the live theme is `141308166203` (`Codex embedded configurator preview proof 20260...`); previous live theme `141243383867` is unpublished rollback. Re-check theme roles before every live write.
- Reopen/check the live page after pushing.
- After live image changes, confirm the images load from a permanent source rather than a staging-only theme URL.

## Cleanup

At the end, state:

- What changed.
- What was checked.
- Whether live was touched.
- How the changed page can be edited in Shopify.
- Any files or old notes left behind.
