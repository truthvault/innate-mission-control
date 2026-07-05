# Innate Shopify Operating Rules

These rules exist because Innate's live Shopify site, staging themes, and old local theme folders can drift apart.

## Agent approval rules — BINDING, shared with Hermes (read first)

Every agent working in this repo (Claude, Codex, any worker) operates under the
**same** approval policy as Hermes. Canonical source of truth — read and apply it,
do not rely on memory:

- `/Users/mack-mini/.hermes/reference/platform/approval_policy.md`
- `/Users/mack-mini/.hermes/AGENTS.md`

Hard rules (these override any convenience or "reduce workload" goal):

1. **No external sends, ever, from automation** — no email, SMS, Xero invoice/quote
   send, customer message, or payment. Agents PREPARE drafts; Guido does the final
   send himself. Never build a feature or script that sends to a customer without a
   per-item human approval step.
2. **Approval before anything durable, live, or customer-visible** — deploys,
   publishes, record create/edit/delete in Gmail/Xero/Monday/Shopify/GitHub/Vercel,
   cron/config/provider changes, migrations, restarts, deletes. This includes
   generating and loading a production plan: prepare → show Guido → he approves →
   then it becomes real. Nothing auto-loads into the workshop unreviewed.
3. **Draft boundary** — internal drafts (local file/preview/dry-run) are free.
   Anything that creates or updates a visible external record is a state change and
   needs approval.
4. **Supabase/Tuesday writes** need exact approval, except the narrow standing
   exception (a customer-touchpoint record Guido reports/requests/confirms — smallest
   matching write + read-back). Schema changes / broad migrations still need approval.
5. **Proof gates** — no "done/fixed/ready" without direct proof from the exact source
   touched, not from a verifier changed in the same run.
6. **Deterministic scripts first, then AI.** The app runtime contains no AI
   (`npm run check:no-ai-runtime`). AI only suggests; a human confirms; a manual path
   always exists. See `docs/current/tuesday-roadmap.md` (engine vs copilot).

Design rule for every Tuesday feature: **draft / prepare → Guido approves → act.**

## Start Here

Read these current docs before website work:

1. `reference/INDEX.md`
2. `docs/current/site-state.md`
3. `docs/current/shopify-workflow.md`
4. `docs/current/website-agent-brand-kit.md`
5. `docs/current/brand-theme-standard.md`
6. `docs/current/visual-qa-checklist.md`
7. `docs/current/website-visual-audit-protocol.md`
8. `docs/current/known-failure-modes.md`
9. `reference/website-change-log.md`
10. `/Users/mack-mini/.hermes/profiles/website/skills/devops/website-exact-version-control-loop/SKILL.md`
11. `/Users/mack-mini/.hermes/profiles/website/skills/productivity/shopify-storefront-operations/references/draft-preview-qa-loop.md`

Old dated notes are historical. Do not treat them as current instructions unless they are explicitly referenced by the user.

## Operating Skill And Tools

- Use the Website Agent `website-exact-version-control-loop` skill for source-of-truth lock, visual target lock, tiny design-change loops, and screenshot proof.
- Use the Website Agent `shopify-storefront-operations` skill when available for Shopify product/page/theme operations, previews, backups, approval gates, and storefront verification.
- Do not rely on retired local wrappers such as `scripts/innate-preflight.sh`, `scripts/innate-scoped-theme.sh`, or the old `innate-shopify-ops` skill unless they are restored and verified in this repo.
- For Shopify CLI theme operations, confirm the exact target theme role in `docs/current/site-state.md`, use `--only` exact-file scope, and keep live publishing behind an explicit approval plus the project hook override.
- Project hooks in `.codex/hooks.json` add source-of-truth context, block unscoped theme pushes, block stale benchtop configurator asset pushes, and guard against live pushes without a deliberate override.
- Before pushing `assets/innate-benchtop-configurator.js`, run `npm run guard:shopify-asset -- --candidate <local-file> --asset-key assets/innate-benchtop-configurator.js`. If it fails, rebase onto the latest approved/live asset; do not push the local bundle.

## Read-Only Checks

- Read-only inspection is always allowed by default.
- Do not ask before checking, listing, searching, querying, comparing, or verifying data without changing it.
- Prefer connected plugins/connectors for read-only checks when that avoids local sandbox approval friction.
- Ask only before actions that write, mutate, authenticate, push, publish, delete, incur meaningful cost, expose secrets, or otherwise change local or external state.

## Local App Review Links

- Guido often reviews Mission Control from a MacBook Air connected to the Mac mini over Tailscale.
- `localhost` in Guido's browser means the MacBook Air, not this Mac mini. For local Mission Control/Tuesday review links, use the Mac mini's Tailscale address or hostname, verify the URL responds, and provide that as the clickable link.
- Before sending Guido a local Tuesday review link, run `npm run verify:tuesday-review-link -- --port <actual-dev-server-port>` or set `TUESDAY_PORT`; add `--expect "<visible changed text>"` and `--require-selector "<selector>"` when proving a specific UI change, and only share the exact Tailscale URL it verifies. This verifier must pass desktop and mobile Chromium; a raw HTTP 200 is not enough.
- For Tuesday design/polish proof, also follow `docs/current/tuesday-visual-audit-protocol.md` and use `npm run audit:tuesday-visual -- --port <actual-dev-server-port>` or a focused `--url` scan.

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
- Before preview/sandbox work, confirm the exact theme ID and role in `docs/current/site-state.md`.

## Push Discipline

- Do not push live without explicit approval.
- For staging or live pushes, push only the specific files in scope.
- After a live push, reopen/check the live page that changed.

## Visual Checks

For visual/theme work, inspect desktop and mobile before saying it is ready for review. Do not rely only on code inspection.

For whole-site consistency scans or broad design QA, run `npm run audit:website-visual -- --base-url https://innatefurniture.co.nz` from this repo, then review the saved report and screenshots before reporting the site as visually clear.

For Tuesday/Mission Control consistency scans or broad design QA, load `docs/current/tuesday-agent-design-standard.md`, run `npm run audit:tuesday-visual -- --port <actual-dev-server-port>` from this repo, then review the saved report and screenshots before reporting Tuesday as visually clear.
