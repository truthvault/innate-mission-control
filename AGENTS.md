# Innate Shopify Operating Rules

These rules exist because Innate's live Shopify site, staging themes, and old local theme folders can drift apart.

## Start Here

Read these current docs before website work:

1. `reference/INDEX.md`
2. `docs/current/site-state.md`
3. `docs/current/shopify-workflow.md`
4. `docs/current/brand-theme-standard.md`
5. `docs/current/visual-qa-checklist.md`
6. `docs/current/known-failure-modes.md`
7. `reference/brand-kit.md`
8. `reference/innate-website-implementation-playbook.md`
9. `reference/website-change-log.md`

Old dated notes are historical. Do not treat them as current instructions unless they are explicitly referenced by the user.

## Operating Skill And Tools

- Use the `innate-shopify-ops` skill when available for Innate website, Shopify theme, staging, live, or visual QA work.
- Run `scripts/innate-preflight.sh` before multi-file website work or any day-start website push.
- Use `scripts/innate-scoped-theme.sh` for Shopify CLI theme operations. It supports exact-file pulls and staging pushes only; live publishing remains a manual approval gate.
- Project hooks in `.codex/hooks.json` add source-of-truth context, block unscoped theme pushes, and guard against live pushes without a deliberate override.

## Read-Only Checks

- Read-only inspection is always allowed by default.
- Do not ask before checking, listing, searching, querying, comparing, or verifying data without changing it.
- Prefer connected plugins/connectors for read-only checks when that avoids local sandbox approval friction.
- Ask only before actions that write, mutate, authenticate, push, publish, delete, incur meaningful cost, expose secrets, or otherwise change local or external state.

## Local App Review Links

- Guido often reviews Mission Control from a MacBook Air connected to the Mac mini over Tailscale.
- `localhost` in Guido's browser means the MacBook Air, not this Mac mini. For local Mission Control/Tuesday review links, use the Mac mini's Tailscale address or hostname, verify the URL responds, and provide that as the clickable link.
- Before sending Guido a local Tuesday review link, run `npm run verify:tuesday-review-link` and only share the exact URL it verifies.

## Live Website Questions

When the user refers to the live website, a live URL, or a problem they can see on innatefurniture.co.nz:

- Treat the live website as the source of truth.
- Inspect the rendered live page and the exact live Shopify theme asset before using local theme files.
- Do not use local files as evidence unless they have just been pulled from, or compared with, the exact target theme.
- State which source was checked: live theme, staging theme, Shopify admin/content, or local workspace.
- If local files differ from live, say so clearly and stop treating them as authoritative.

## Theme IDs

- Live/main theme: `141308166203` — verified 2026-06-21 by read-only Shopify theme list as `main`.
- `140732760123` is now unpublished (`Benchtops live cache refresh 2026-05-28 18:45`); do not treat it as live.
- Broad tidy-up sandbox: `141105463355` — unpublished.
- `140760219707` is an unpublished benchtops cohesion preview, not the default staging target.
- Before preview/sandbox work, confirm the exact theme ID and role in `docs/current/site-state.md` or `reference/brand-kit.md` Appendix B.

## Push Discipline

- Do not push live without explicit approval.
- For staging or live pushes, push only the specific files in scope.
- After a live push, reopen/check the live page that changed.

## Visual Checks

For visual/theme work, inspect desktop and mobile before saying it is ready for review. Do not rely only on code inspection.
