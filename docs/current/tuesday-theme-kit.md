# Tuesday Theme Kit

Status: draft reference, not yet an implementation mandate.
Owner: Tuesday / Mission Control.
Created: 2026-06-27.

Purpose: define the visual and interaction system Tuesday should use before agents make broad UI changes. This document exists to stop ad-hoc styling, pill/control ambiguity, mobile formatting regressions, and agent-led redesign drift.

This is **not** a live UI change. Do not apply these rules to production screens until Guido approves the specific component migration or precision change.

## 1. North Star

Tuesday should feel like Innate's internal operating room: warm, calm, source-backed, practical, and clearly usable under pressure.

It should be close enough to the Innate website that the brand family is obvious, but it should not become a marketing page. Tuesday is an operations cockpit for production, leads, cash/action visibility, and source-backed decisions.

### Desired feel

- Crafted warmth from Innate's website: paper, forest, restrained rust, calm typography.
- App clarity from a command centre: obvious controls, visible source state, readable dense data.
- Workshop usefulness: Nick and Dylan can act without decoding the system.
- Guido oversight: the app shows enough source/provenance to trust decisions.

### Non-negotiables

- Truth before polish.
- Source state stays visible when stale, missing, risky, or uncertain.
- Colour means role/state, not decoration.
- Shape means role. A badge must not look like a button. A field must not look like a badge.
- Mobile is a work queue/agenda, not a squeezed desktop board.
- No broad UI styling migrations without desktop, tablet, and mobile proof.

## 2. Relationship To Innate Website Brand

Tuesday should be **website-adjacent**, not website-cloned.

Use the website brand standard for shared family traits:

- Calm, crafted, practical, warm, modern, humble.
- Forest/paper/warm-card/rust foundations.
- Restrained buttons.
- Obvious forms.
- Real workshop/material feel.
- Avoid all-beige, all-green, all-rust, or otherwise one-note pages.

Tuesday adapts those traits for an internal app:

| Website brand trait | Tuesday translation |
| --- | --- |
| Forest green CTA | Primary/selected action family; likely darker green-teal rather than bright marketing green. |
| Paper background | App page background and low-noise workspace. |
| Warm card surface | Operational cards, modals, source panels. |
| Rust accent | Tiny metadata/rules/emphasis, not main action colour. |
| Restrained rectangular buttons | Buttons should not be confused with badges or read-only chips. |
| Obvious forms | Fields in process templates/intake/review surfaces must read as editable. |
| Real craft | Subtle warmth and typography, not decorative textures that reduce clarity. |

## 3. Font Direction

Approved direction: move Tuesday closer to the website's fonts.

Website standard:

- Display: Cormorant Garamond.
- Body/buttons/forms/nav/proof text: Maven Pro.

Current Tuesday:

- Identity/headings: Fraunces.
- Operations/body: DM Sans.

Recommended Tuesday direction:

- **Cormorant Garamond** for customer/order identity, page identity, and occasional large human-facing headings.
- **Maven Pro** for operations: body, nav, task rows, badges, controls, forms, source labels, data, and buttons.
- Avoid Cormorant for tiny labels, dense task rows, form fields, table-like data, and status badges.
- Do not migrate fonts globally until representative screens are tested at desktop, tablet, and mobile.

Open question for implementation stage:

- Whether Tuesday should fully retire Fraunces/DM Sans, or run a staged migration route-by-route.

## 4. Token Architecture

Tuesday needs three token layers.

### 4.1 Primitive tokens

Raw values. These are not normally used directly in component styling.

Examples:

```text
primitive.color.forest.900 = #0c201c
primitive.color.forest.800 = #163832
primitive.color.paper.000 = #fbf8f2
primitive.color.surface.warm = #fffaf3
primitive.color.rust.600 = #9a4f35
primitive.radius.2 = 2px
primitive.radius.8 = 8px
primitive.radius.12 = 12px
primitive.radius.full = 999px
```

### 4.2 Semantic tokens

Meaningful app roles.

Examples:

```text
color.bg.page
color.bg.surface
color.bg.field
color.text.primary
color.text.muted
color.action.primary.bg
color.action.primary.text
color.action.secondary.border
color.status.warning.bg
color.status.blocked.text
color.source.stale.text
radius.card
radius.control
radius.field
radius.badge
radius.full
```

### 4.3 Component tokens

Component-specific decisions. Component tokens should not be reused across unrelated components.

Examples:

```text
button.primary.default.background
button.primary.hover.background
button.primary.disabled.opacity
field.default.background
field.focus.border
badge.warning.background
statusPill.blocked.text
modal.sheet.mobile.borderRadius
```

Rule: a badge token must not style a button, and a button token must not style a read-only fact chip.

## 5. Colour System

### 5.1 Brand family

Candidate palette direction:

| Role | Candidate | Notes |
| --- | --- | --- |
| Page paper | `#fbf8f2` / current `#f5f3ee` | Warm low-noise background. |
| Surface/card | `#fffaf3` / `#ffffff` | Use white for fields and high-clarity surfaces. |
| Forest primary | `#163832` | Website connection, headings, strong app chrome. |
| Dark forest | `#0c201c` | Shell/deep contrast, not raw black. |
| Green-teal action | TBD blend | Should be less bright than current Tuesday teal but clearer than forest on small controls. |
| Rust accent | `#9a4f35` | Metadata, tiny emphasis, not main CTA. |
| Ink | `#131311` / current `#22201a` | Avoid raw black. |
| Muted text | warm grey/brown family | Must remain readable. |

### 5.2 Operational state colours

Keep operational state colours separate from decoration.

| State | Colour family | Meaning |
| --- | --- | --- |
| Primary/action/selected | forest/green-teal | Clickable primary or selected. |
| Healthy/done | sage/green | Done, OK, healthy source. |
| Watch/attention | amber/gold | Needs attention, not danger. |
| Blocked/danger/destructive | clay/red | Risk, destructive, blocked. |
| Stale/source warning | amber or source-specific warning | Source issue, not decorative. |
| Disabled/read-only | warm grey | Not active; must not imply hidden action. |

Rules:

- Rust is not the main CTA colour.
- Amber/gold is for attention/watch and sync accents, not arbitrary warmth.
- Clay/red is for blocked/destructive only.
- Colour alone must not be the only signifier of status or clickability.

## 6. Radius And Shape System

This is the key fix for current pill ambiguity.

| Token | Shape | Use |
| --- | --- | --- |
| `radius.none` | 0 | Rare, table/grid edges only. |
| `radius.xs` | 2-4px | Dividers, tiny inset elements. |
| `radius.sm` | 6-8px | Inputs, small controls, compact rows. |
| `radius.md` | 10-12px | Buttons, fields, toolbar controls. |
| `radius.lg` | 14-18px | Cards, panels, modals. |
| `radius.full` | 999px | Badges, avatars, dots, progress markers; rarely buttons. |

### Shape meaning rules

- **Buttons:** soft rectangles by default, not pills.
- **Fields:** rectangular/soft-rect with obvious border and field background.
- **Badges/status chips:** small capsules are allowed because they are labels, not actions.
- **Segmented controls:** may use pill-like connected group styling if the group clearly reads as a filter/view switcher.
- **Read-only facts:** prefer labelled rows over pills. Use fact chips only when they cannot be confused with actions.
- **Icon-only controls:** must have clear affordance, label/tooltip/aria, and enough size.

Hard rule:

> Pill shape should mostly mean “label/status”, not “button”, unless it is inside a clearly grouped segmented control or explicitly approved for a tiny toolbar pattern.

## 7. Control Shape Hierarchy

| Component | Default shape | Visual weight | Clickable? | Notes |
| --- | --- | --- | --- | --- |
| Primary button | Soft rectangle | High | Yes | One dominant action per area where possible. |
| Secondary button | Soft rectangle outline | Medium | Yes | Lower than primary; still clearly a button. |
| Tertiary/quiet button | Low-fill rectangle or text button | Low | Yes | For toolbars/dense rows. |
| Danger button | Soft rectangle, clay/red | Medium/high | Yes | Destructive or irreversible actions. |
| Text link/action | Text + underline/icon where needed | Low | Yes | Use for navigation/source links. |
| Nav item | Tab/nav style | Medium | Yes | Route change, not form action. |
| Filter/segmented control | Connected group/tab | Medium | Yes | Must show selected state clearly. |
| Status badge | Small pill/capsule | Low/medium | No | State only. |
| Source badge | Small label/capsule or inline metadata | Low | Usually no | If it opens source, style as link/action. |
| Fact row | Label + value row | Low | No | Default for invoice/date/value facts. |
| Fact chip | Small capsule | Low | No | Use sparingly; must not look actionable. |
| Input field | Rectangular field | Medium | Editable | Visible field background/border/focus. |
| Select/dropdown | Field + chevron | Medium | Editable | Must not look like a badge. |
| Textarea | Larger rectangular field | Medium | Editable | Must not disappear into card background. |

## 8. Component Catalogue

Tuesday's theme kit must eventually document these components.

### 8.1 App shell

- Mission Control shell.
- Tuesday mark.
- Top nav.
- Mobile menu.
- Sync/source badge.
- Page header.
- Refresh/reload control.
- Page tabs/view switchers.

### 8.2 Actions

- Primary button.
- Secondary button.
- Tertiary/quiet button.
- Danger/destructive button.
- Icon button.
- Text/link action.
- Disabled/inactive button.
- Loading button.
- Button group.
- Toolbar action.

### 8.3 Inputs/forms

- Text input.
- Number input.
- Search input.
- Textarea.
- Select/dropdown.
- Checkbox/toggle.
- Date field.
- Editable row field.
- Inline edit state.
- Validation/error/help text.

### 8.4 Labels/status

- Status badge.
- Source badge.
- Priority badge.
- Risk badge.
- Count badge.
- Small metadata label.
- Read-only fact row.
- Fact chip, if still needed.

### 8.5 Navigation/filtering

- Tabs.
- Segmented controls.
- Filter chips.
- Sort controls.
- View toggles.
- Mobile filter drawer/sheet.

### 8.6 Cards/surfaces

- Order card.
- Task card.
- Lead card.
- Intake review card.
- Source/provenance card.
- KPI card.
- Warning/exception panel.
- Empty state.
- Loading/skeleton state.

### 8.7 Production Plan-specific components

- Order rail card.
- Pending order/intake card.
- Intake review modal.
- Suggested production plan task row.
- Schedule board task card.
- Mobile agenda row.
- Process template card.
- Process template task row.
- Drag/drop target.
- Completion/hide dialog.
- Customer mirror/source links.
- Invoice/document link section.

### 8.8 Feedback/state patterns

- Loading.
- Empty.
- Error.
- Stale source.
- Unsaved changes.
- Saved confirmation.
- Disabled because source is missing.
- Destructive confirmation.
- Success/done state.
- Warning/watch state.
- Blocked/risk state.

### 8.9 Mobile patterns

- Mobile work queue.
- Mobile agenda.
- Bottom sheet/modal behaviour.
- Sticky action bar.
- Tap target rules.
- Collapsed provenance/source details.
- One-action-per-row clarity.

## 9. Component Documentation Template

Every component entry should eventually follow this template.

```md
## Component name

Purpose:
- What this component is for.

Use when:
- ...

Do not use when:
- ...

Anatomy:
- Label
- Container
- Icon
- State marker
- Supporting text

Variants:
- primary / secondary / quiet / danger etc.

States:
- default
- hover
- focus
- active/pressed
- selected
- disabled/inactive
- loading
- error

Shape:
- radius token
- height
- padding
- border

Colour:
- semantic/component tokens only

Copy:
- label rules

Accessibility:
- keyboard
- aria
- minimum touch target
- contrast

Examples:
- good
- bad
```

## 10. Choose The Right Component

| Need | Use | Do not use |
| --- | --- | --- |
| Save/approve/refresh/complete/hide | Button | Badge/fact chip. |
| Navigate to a route/source URL | Link/nav item | Button, unless it performs an in-app action first. |
| Change current view/filter | Tab or segmented control | Free-floating status badge. |
| Show state like Watch/Blocked/Synced | Badge/status label | Button. |
| Show invoice/date/value/source fact | Fact row | Button-shaped pill. |
| Let user type | Input/textarea | Fact chip. |
| Let user choose from options | Select/dropdown | Badge. |
| Show source evidence | Link if opens source; source label if read-only | Generic text with no affordance. |
| Show risk | Warning panel/badge | Decorative colour only. |
| Explain why disabled | Inline help/error text | Silent disabled button only. |

## 11. Formatting Safety Rules

Do not call a Tuesday theme/component change ready unless these are true:

- No new ad-hoc `borderRadius: 999` unless the component role allows `radius.full`.
- Buttons and badges do not share the same full visual recipe.
- Fields have visible backgrounds, borders, placeholders, and focus states.
- Button labels do not wrap into multiple lines.
- Common mobile actions are about 40px+ high unless they are non-interactive labels.
- Mobile has no horizontal overflow.
- Tablet/intermediate widths are checked, not just desktop and phone.
- Colour is not the only signal of status or action.
- Source/stale/risk states remain visible.
- Destructive actions are visually distinct and have confirmation or clear consequence language.
- Any component migration has before/after screenshots and route-specific proof.

## 12. Current Tuesday Inventory Snapshot

Read-only code scan on 2026-06-27 found:

| File | Signals |
| --- | --- |
| `app/production/plan/PlanClient.tsx` | 114 buttons, 33 inputs, 9 textareas, 19 selects, 307 `borderRadius` uses, 143 `borderRadius: 999` uses. Main risk area. |
| `app/leads/LeadsClient.tsx` | 15 buttons, field controls, multiple chips/status patterns. |
| `app/costings/CostingsClient.tsx` | Several inputs/selects and source/status patterns. |
| `components/mission-control-shell.tsx` | Global shell/nav/menu/refresh controls; currently several pill-like controls. |
| `components/mission-control-ui.tsx` | Shared `DT`, `Chip`, `KpiCard`; currently minimal component abstraction. |

Implication: start with documentation and inventory before changing visuals. The highest-value implementation target is not a page repaint; it is extracting and applying a small set of shared components/tokens that prevent ambiguity.

## 13. Migration Strategy

Do not migrate everything at once.

Recommended phases:

1. Approve this theme kit direction.
2. Inventory current components and classify each ambiguous pill/control as:
   - keep;
   - convert to button;
   - convert to badge;
   - convert to fact row;
   - convert to input/select;
   - leave for later.
3. Create shared theme tokens and component primitives in `components/mission-control-ui.tsx` or a new theme module.
4. Apply to one low-risk control family first, likely buttons vs badges in `/production/plan`.
5. Verify desktop, tablet-wide, tablet, and mobile.
6. Only then continue route-by-route.

## 14. Open Decisions Before Implementation

These should be resolved before broad styling changes:

1. Exact Cormorant/Maven usage split.
2. Exact primary action colour: website forest, current teal, or blended green-teal.
3. Whether any standalone pill buttons remain approved.
4. Whether nav items keep capsule styling or become tabs/rectangular controls.
5. Which route becomes the pilot: likely `/production/plan` intake review modal or process templates.
6. Whether to standardise tokens as TypeScript objects first, CSS variables first, or both.

## 15. Approval Boundary

This document can guide discussion and planning now.

It does **not** approve:

- live UI changes;
- broad refactors;
- font migration;
- colour migration;
- replacing current Production Plan layouts;
- deploying to Vercel.

Each implementation step still needs a scoped precision request, focused verification, and explicit live approval.
