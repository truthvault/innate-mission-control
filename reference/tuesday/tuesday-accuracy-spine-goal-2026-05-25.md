# Tuesday accuracy spine before UI

Date: 2026-05-25  
Owner: Tuesday agent  
Status: active north-star goal

## North star

Tuesday is Innate’s future operating system, replacing Monday over time. It must be real-time, ridiculously simple, zero-clutter, and trustworthy enough that Guido can mostly ask Hermes what matters instead of inspecting dashboards.

## Immediate priority

Do not build more average UI. Build the accuracy/source-of-truth spine first. A polished but wrong Tuesday destroys trust.

## What to accomplish next

1. Audit Supabase/Tuesday leads and orders against Monday, Xero, Akahu/bank evidence, and relevant Gmail context where needed.
2. Treat Supabase/Tuesday as the intended canonical source of truth, but verify it before trusting it.
3. Treat Monday as a legacy/workshop mirror to be phased out, not a permanent source of truth.
4. Add/strengthen read-only reconciliation that detects:
   - missing orders/leads;
   - stale or contradictory statuses;
   - unpaid/paid/balance-due mismatches;
   - Monday vs Tuesday drift;
   - Xero invoice/document gaps;
   - Akahu/bank payment evidence gaps;
   - items needing Guido/Nick review.
5. Use confidence labels everywhere:
   - verified;
   - probable;
   - missing evidence;
   - review needed.
6. Keep background jobs silent unless broken or urgent. They should make Hermes/Tues smarter, not give Guido more reports.
7. Feed findings into the eventual single short daily control report.
8. Only after the data is reliable, build the Guido “what needs me?” view and Nick/person-based views.

## Rules

- No customer/team-visible changes without approval.
- No Supabase/Monday/Xero/Akahu/Gmail mutations unless explicitly approved.
- No new cluttered dashboard.
- Prefer small verified improvements.
- Run tests/build/smoke before shipping.
- Report concisely: changed, checked, not changed, blocked, next approval.

## Success looks like

Guido can ask “what needs me?” and trust the answer because Tuesday can show where every important fact came from, how confident it is, and what still needs human review.
