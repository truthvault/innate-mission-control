# Shared AI Context Setup

Date: 2026-06-13

## Canonical Rule

The Mac mini is the canonical Innate/Hermes operating machine.

Local files on the Mac mini are the live source for active context, code, auth-adjacent setup notes, logs, caches, backups, worktrees, and generated state.

iCloud Drive is not the master live context location. It may be used only as a convenience mirror, transfer surface, or MacBook Air control-surface aid after the Mac mini source has been verified.

Legacy iCloud mirror folder, not canonical:

`/Users/guidoloeffler/Library/Mobile Documents/com~apple~CloudDocs/Innate Shared AI Context/innate-shopify-air`

## What May Be Mirrored

- `AGENTS.md`
- `docs/current/`
- `docs/README.md`
- `docs/automation-control-register.md`
- project `.codex` hooks

These are stable context/rule files for Codex and Hermes. If mirrored to iCloud for another Mac, treat the Mac mini copy as the source to verify against before relying on or changing the mirror.

## What Must Not Use iCloud As Live State

Do not put these in the iCloud mirror as live state:

- auth tokens
- API keys
- browser sessions
- caches
- logs
- live theme backups
- old worktrees
- security/private folders
- active Shopify theme code folders

Shopify live/staging remains the source of truth for website code.

## Why

Codex on the Air, Codex on the Mac mini, and Hermes should be able to read the same rules and handovers, but active work should not split into competing iCloud and Mac mini truths.

When in doubt, check the Mac mini source first.

## MacBook Air / Other Mac Links

If the Air repo or another Mac points these paths at iCloud, treat those links as convenience access only:

- `AGENTS.md`
- `.codex`
- `docs/current`
- `docs/README.md`
- `docs/automation-control-register.md`

## Setup On Another Mac

Do not make another Mac a second source of truth.

If iCloud links are used for convenience, keep local backups first and verify linked files against the Mac mini source before relying on them.

For website work, always start by reading:

1. `AGENTS.md`
2. `reference/INDEX.md`
3. `docs/current/site-state.md`
4. `docs/current/shopify-workflow.md`
5. `docs/current/website-agent-brand-kit.md`
6. `docs/current/brand-theme-standard.md`
7. `docs/current/visual-qa-checklist.md`
8. `docs/current/website-visual-audit-protocol.md`
9. `docs/current/known-failure-modes.md`
10. `reference/website-change-log.md`
11. `/Users/mack-mini/.hermes/profiles/website/skills/devops/website-exact-version-control-loop/SKILL.md`

Do not use retired local pointers such as `reference/brand-kit.md` or `reference/innate-website-implementation-playbook.md` as active instructions. Current website brand and implementation guidance lives in `docs/current/`.
