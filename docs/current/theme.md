# Tuesday Theme — canonical design system

Status: **active, canonical**. Every Tuesday/Mission Control surface must follow this file.
Code source of truth: [`components/mission-control-tokens.ts`](../../components/mission-control-tokens.ts) — if this doc and the code disagree, fix one of them in the same commit.
Complements `tuesday-agent-design-standard.md` (product character); this file owns the concrete values.

## 1. Principles

1. **One system.** No page invents a palette, font, radius, or button. If a token can't express a state, extend the tokens — never inline a new value.
2. **Colour is state, not decoration.** Teal = live/selected/primary-internal. Gold = warm attention, active nav, sync. Sage/green = done/healthy. Clay = blocked/destructive only. Grey = neutral/muted.
3. **Truth beats polish.** Source errors, stale syncs, and empty states are shown plainly, in words, in the same type system.
4. **Mobile is a work queue,** not a shrunken board. Tap targets ≥ 40px (44–64px on kiosk-style surfaces). No horizontal scroll in the main workflow.
5. **Serif identifies, sans operates.** Fraunces for identity (page titles, customer/order names). DM Sans for everything operational (labels, rows, chips, buttons, metrics).

## 2. Typography

Loaded once in `app/layout.tsx` via `next/font` and exposed as CSS variables:

| Variable | Font | Use |
|---|---|---|
| `--font-sans` | **DM Sans** | All operational UI. `DT.sans` resolves here. |
| `--font-display` | **Fraunces** (400/500/600) | Identity: page titles, customer names, section wordmarks. `DT.serif` resolves here. |

Rules:
- Never import another font. Never hardcode a `font-family` string — use `DT.sans` / `DT.serif` or the CSS variables.
- Fraunces weights stay 400–600; it is an identity voice, not a bold display face.
- Operational text sizes: 10–13px labels/chips, 13–15px body rows, 17px+ only on kiosk surfaces.

## 3. Colour tokens (`DT`)

| Token | Value | Meaning |
|---|---|---|
| `pageBg` | `#f5f3ee` | App canvas (warm paper) |
| `cardBg` | `#ffffff` | Cards / work surfaces |
| `headerBg` / `2` / `3` | `#1a1a1a` / `#27221b` / `#141210` | Shell chrome only |
| `teal` / `tealSoft` | `#0c7c7a` | Live, selected, linked, primary internal action |
| `gold` / `goldSoft` | `#c8a96e` | Active nav, sync accents, warm attention (not danger) |
| `sage` | `#6e8a6a` | Done / healthy (large areas) |
| `green` / `greenBg` | `#4f7f59` | Done / healthy (chips, small marks) |
| `clay` | `#9a3b2f` | Blocked, destructive, overdue — danger only |
| `textPrimary → textFaint` | `#22201a → #9a9088` | Four-step text hierarchy; never invent a fifth |
| `border` | `rgba(0,0,0,0.06)` | Default hairline |
| `shadow` / `shadowHover` | see tokens | Cards at rest / interactive lift |
| `radius` / `radiusSm` | `14` / `8` | Cards / controls. No other radii. |

Status chip tones come only from `chipColors()` in `mission-control-ui.tsx`: `neutral · grey · amber · teal · red · green`.

## 4. Component rules

- **Chips** (`<Chip/>`): 10px, weight 700, pill radius. One chip = one fact (status, owner, hours, source). Never paragraphs in chips.
- **Cards**: white, `radius` 14, hairline border, `shadow` at rest. A card is a real object (order, task, lead, payment). No decorative nesting.
- **Buttons**: min-height 40px. Primary internal = teal fill/white text. Secondary = card bg + hairline. Destructive = clay, and quiet (never the biggest thing on screen).
- **Task rows**: tickable circle ≥ 20px (28px kiosk), done = sage fill + strikethrough + 0.75 opacity. Errors appear inline under the row in clay, in words.
- **Overlays/modals**: same tokens; dark scrim only, no new surface colours.
- **Empty/error states**: must say which source responded and whether emptiness is real ("Supabase responded — no X") vs unavailable (clay panel).

## 5. Layout

- Shell: dark header (`headerBg`), gold/sage gradient on the active nav pill, content max-width 1240 (`MC_WIDTH`).
- Page title area: compact — Fraunces title + muted 13px subtitle stating the data source. No hero paragraphs.
- Grids: days/columns use hairline separations, not heavy boxes. Today column may tint `goldSoft`.
- Breakpoints: desktop 1440, tablet-wide 1024, tablet 768, mobile 390 (the visual-audit viewports). Tables must collapse to stacked rows at ≤768 — no horizontal overflow, ever.

## 6. Motion & delight

- Transitions ≤ 200ms, ease, on shadow/transform/opacity only.
- Celebration moments (done-bursts etc.) must be opt-out quiet on workshop surfaces and never block input. No ambient/looping animation.

## 7. Per-surface register

| Surface | Register |
|---|---|
| Workshop-facing (`/production/plan` board, task lists) | Fewest words, biggest targets, colour = state only |
| Guido/admin (leads, costings, freight, quoting) | May show provenance, source labels, denser tables |
| Public (configurator, freight endpoints) | Follows website brand kit, not this file |

## 8. Enforcement checklist (before calling any UI change done)

1. No hex/rgb literal outside `mission-control-tokens.ts` or `globals.css` (existing debt is being burned down — never add more).
2. No `font-family` other than the tokens/variables.
3. Server components import `DT` from **`@/components/mission-control-tokens`** — never from `mission-control-ui` (client module; values silently break in server components).
4. `npm run audit:tuesday-visual -- --port <port>` — zero failures on the touched routes, all four viewports.
5. `npm run verify:tuesday-review-link -- --port <port> --path <route>` passes desktop + mobile before sharing a review link.
