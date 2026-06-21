# Current Site State

Last updated: 2026-06-20

## Source Of Truth

- Live site: `https://innatefurniture.co.nz`
- Live theme: `141308166203` — "Codex embedded configurator preview proof 20260..."; published live on 2026-06-20 for the benchtops mobile configurator test. Previous live theme `141243383867` is now unpublished and is the rollback theme.
- Current broad tidy-up sandbox: `141105463355` — "Fable 5 tidy-up 2026-06-12"; unpublished.
- Surface-specific unpublished previews:
  - `140732760123` — "Benchtops live cache refresh 2026-05-28 18:45"; now unpublished as of the 2026-06-17 theme-role check. Do not treat as live without rechecking.
  - `140760219707` — "Innate benchtops cohesion preview - 2026-05-29"; use only for that preview lane unless re-assigned.
  - `141161726011` — "Configurator preview 2026-06-14"; unpublished, ownership must be re-checked before edits.
  - `141230374971` — "Dining mobile overhaul preview 2026-06-17"; unpublished, ownership must be re-checked before edits.
- App asset-holder themes `125474406459`, `126853546043`, and `127132139579` are unpublished and must not be deleted or touched.
- Custom-domain `/pages/timber-panels` may temporarily serve stale Shopify full-page cache with old `t/83` asset URLs even after the `141308166203` publish; verify raw/browser output before claiming the visible custom-domain page has switched.
- Local files are not source of truth for live problems unless they were just pulled from, or compared with, the exact target theme.

## Working Rule

If Guido points at the live website, inspect the live rendered page, Shopify admin/content, and exact live theme asset first. Do not start from local files.

If Guido asks for preview/sandbox work, confirm the exact theme ID and role first. Do not assume `140760219707` is the general staging target; it is currently an unpublished benchtops cohesion preview.

If Hermes or another agent may have changed the site, assume local files are stale until proven otherwise.

## Current Goal

Keep the website clean, consistent, functional, fast enough, and easy to edit in Shopify. Do not redesign content-heavy pages unless Guido explicitly asks for a redesign.

## Current References

- Homepage: main brand feel, calm spacing, proof/reviews style, warm paper background.
- Dining tables page: buying-page structure, product clarity, accordions, proof rows, practical density.
- Contact and About: quieter trust/utility pages, not loud hero pages.

## Hard Rule

Never push live without explicit approval.
