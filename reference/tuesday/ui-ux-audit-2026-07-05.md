# Tuesday UI/UX audit — boards deep-dive (2026-07-05)

Method: fresh headless captures of every board at desktop/tablet-wide/tablet/mobile
(`reference/evidence/2026-07-04/tuesday-visual-audit-20260704T132835/`), reviewed
against `docs/current/theme.md`, the page contracts, and each board's primary user.
Scanner status at capture: 0 hard failures, 497 soft warnings.

## Systemic patterns (these repeat on every board)

### S1 — Chip inflation (the biggest quality drain)
Chips are stamped identically on nearly every row, so they carry no signal:
- Plan rail: **"Needs costing match" on all 14 orders**
- Samples: **"Tracked" under every one of ~30 cells** and every top-up row
- Leads: **"HOT" on 26 of 28 rows**
- Costings: "No approved price" chip **plus** "No approved current price" text on all 27 rows
Rule proposed for theme.md: *a chip that would appear on more than ~2/3 of visible
rows is a column default, not a signal — show only the exceptions.*

### S2 — Same object, multiple places
- Plan: every order appears in the left rail **and** the week grid.
- Leads: the same lead can appear **three times on one screen** (Protect-cash card,
  Do-Today card, list row — e.g. Tim & Steph Prestidge).
One object should live in one place; priority views should *filter/sort the list*,
not clone cards above it. This doubles scroll and creates "which one is true?" doubt.

### S3 — Contradictory status stacks
Cards show "Ready for workshop" (green) + "Blocked" (red) + "Past due" (red) + "Needs
costing match" (amber) simultaneously. Four states, no hierarchy. Each card needs ONE
dominant resolved status; the rest become quiet qualifiers or move into the detail.

### S4 — Mobile flagship is a squeezed desktop
On 390px, the plan board's CURRENT WEEK renders as **five ~55px columns** with
truncated titles ("Mi… work", "seco coat?") — the exact anti-pattern the design
standard forbids. The compact agenda path exists in code but the current-week grid
does not stack. Also: a phone user must scroll past the intake rail + 14 order cards
(~5 screens) before reaching any task.

### S5 — Source honesty gaps during parallel-run
Supabase hygiene fixes don't reach Monday-fed widgets: the plan rail still shows
Tennent "2 May · Past due" and /today shows "Due Fri, 1 May" (both cleared in
Supabase). Until cutover, any Monday-cached widget needs its own quiet source tag
("Monday cache") or these contradictions will erode exactly the trust the parallel
run is meant to build.

### S6 — Load gates instead of first paint
`/production` renders a full-screen "Loading Tuesday state" gate; the plan intake
rail sits on "Loading…". Server-render the first useful content (the architectural
fix already planned) or at minimum show real skeleton rows.

### S7 — Navigation orientation
The header nav shows only the production group (Orders/Stock/Samples/Processes).
On Leads, Costings, Freight, Today there is **no active indicator anywhere** — you
only know where you are from the page title. Today (Guido's cockpit) is buried while
Processes (rare admin) is top-level.

### S8 — Redundant copy
Samples has two nearly identical subtitle lines; "Raine Wapp · July 6–9 · Raine
Wapp"; leads shows "Overdue: Fri 26 Jun" chip next to a red "Fri, 26 Jun" date;
samples top-up shows "Out" chip + "No stock ready" text. Every duplicated fact is
paid for in reading time on every visit.

## Confirmed bug (P1)

**Default view inversion on /production/plan.** A plain URL (no `?mode=`) renders
**Schedule as "Current view"** with the Orders card offering "Open orders list →".
`page.tsx` correctly passes `initialPlanViewMode="orderRows"`; the client ends up in
schedule mode anyway (suspect the client-side state/history-restoration around the
`planViewMode` state or the toggle's active comparison). This contradicts Nick's
recorded feedback ("Orders should be the default") and silently defeats the repaired
test, which only guards the URL-parse ternary. Needs a trace + a render-level test.

## Board-by-board

| Board | Grade | Keep | Fix first |
|---|---|---|---|
| Plan — Orders view | B− | Rich rail context, capacity bars, watch/blocked framing | Default-view bug; S2 duplication; S1/S3 chips; always-visible Done/Edit ×20 cards; cryptic "1h/7h" chips unlabeled |
| Plan — Schedule week | B | Clear columns, per-person lanes, capacity | "Drop task" affordances always visible; belongs unified with Orders view state |
| Plan — mobile | D | Order cards readable | S4: week grid unusable; content order buries tasks |
| /production overview | ? | — | Full-screen load gate; couldn't capture loaded state (S6) |
| Stock | B− | Honest read-only banner, explains emptiness | Six zero-KPI cards = placeholder theatre; collapse to one "not live yet" hero |
| Samples | **A−** (best) | Species×finish matrix, plain-language promise rules, ranked top-up queue | Duplicate subtitle; "Tracked" ×30; "1/3 ready full sets" unclear; legend repeated tiny |
| Leads | B− | Dense, action-first framing, honest "closed hidden 131" | S2 triplication; HOT inflation; two unreconciled money KPIs ($11,870 vs $62,499); mid-word truncation of next steps |
| Today | B+ | Calm 3-column daily brief, source-trust footer | Monday-stale dates (S5); "task fragments" jargon; repetition; no nav orientation |
| Costings | B− | A→Z directory, source-backed framing, honest KPI row | Same fact twice per row ×27; A–Z rail overkill for 27 items; KPI pairs read contradictory without a hint |
| Freight | C | Good KPI header | 75 identical full-height cards ≈ 10,000px scroll; needs a dense table/day grouping with expandable rows |
| Quoting | n/a | Scanner: 0 warnings | Light page; audit when it grows |

## Ranked work order

**P1 (trust + daily use)**
1. Fix the plan default-view inversion (+ a render-level regression test).
2. Mobile plan: stack the current-week grid into the agenda path; reorder mobile
   content to tasks-first (contract: Nick privileges doing the work).
3. One-object-one-place: rail/Do-Today/Protect-cash become filters or section
   headers of the single list — on plan and leads.
4. Chip diet: adopt the S1 rule in theme.md and apply to plan rail, samples,
   leads, costings.

**P2 (clarity)**
5. Status resolution: one dominant state per card (Blocked beats Ready; Past-due
   modifies, not competes).
6. Per-widget source tags on Monday-cached widgets during parallel-run (S5).
7. `/production` first-paint server render (S6).
8. Leads money story: reconcile/label the two KPIs; stop mid-word truncation
   (wrap 2 lines).
9. Freight: table view grouped by day, rows expandable.

**P3 (polish)**
10. Copy sweep (S8 duplicates), samples legend once, stock placeholder collapse,
    costings A–Z removal, "1/3 full sets" wording.
11. Navigation: active indicator for all groups; consider promoting Today.
12. Mine the 497 scanner warnings (contrast/tap-target clusters on freight+costings).

Nothing here has been changed yet — this document is the audit deliverable.
