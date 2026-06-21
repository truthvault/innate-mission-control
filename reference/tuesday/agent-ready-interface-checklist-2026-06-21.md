# Agent-ready interface checklist for Innate / Tuesday / Mission Control

Created: 2026-06-21
Status: v0.1 internal reference, not a permission change
Owner: Hermes/default as front door, Tuesday/Mission Control as operating surface

## Purpose

Make Innate systems usable by agents without making them recklessly autonomous.

Agent-ready does not mean "an agent can do anything". It means each action has:

- a clear source of truth
- a safe read path
- a draft or preview path
- an explicit approval gate where needed
- deterministic evidence readback
- an audit trail
- a rollback or repair path where possible

## Source docs checked

- `reference/INDEX.md`
- `reference/tuesday/README.md`
- `reference/tuesday/foundations.md`
- `reference/tuesday/dashboard.md`
- `reference/tuesday/freight.md`
- Current Hermes/default and Innate Operations approval rules

## Current source-of-truth split

| Area | Current authority | Agent stance |
|---|---|---|
| Leads | Supabase/Tuesday forward source of truth | Read, update customer-touchpoint facts under standing approval, draft replies only |
| Orders | Supabase/Tuesday for approved order spine, Monday still legacy/workshop source until migration gates | Read both when production/workshop state matters, write Supabase only under standing or exact approval, Monday writes need exact approval unless covered by an approved workflow |
| Production tasks | Monday legacy plus Tuesday/Mission Control views | Read/check freely, draft internal actions, do not write Monday without exact approval |
| Accounting | Xero | Read for quote/invoice/payment context, draft only unless exact approval |
| Payments | Xero/Akahu/bank evidence as applicable | Mark paid only after verified settled evidence, read back proof |
| Website/product | Shopify live/admin/theme plus Mission Control references | Read freely, draft recommendations, no publish/write without exact approval |
| Email | Gmail threads plus Sent/Drafts | Read/search freely, create drafts only when requested/approved, never send |
| Files/docs | Drive/local references | Read freely, create requested internal docs, do not share/publish/change permissions without exact approval |
| Freight/dispatch | Supabase/Tuesday, Monday, Xero, carrier evidence | Build packets and internal prompts, no carrier booking or customer/carrier message without exact approval |

## Permission levels

| Level | Meaning | Examples |
|---|---|---|
| 0. Read | Inspect, search, compare, summarise | Gmail thread read, Supabase readback, Monday item lookup, Xero quote status check, Shopify live page check |
| 1. Draft/preview | Prepare private output that is not externally visible | Gmail draft, quote packet, Mainfreight booking preview, Pinpoint email text, Tuesday UI mock, customer reply wording |
| 2. Standing update | Internal source-of-truth update already covered by Guido's standing rules | Supabase lead/order touchpoint after verified customer communication, next_action cleanup, factual order note with readback |
| 3. Exact approval | Any external, risky, team-visible, customer-visible, financial, destructive, or live-system action | Send email, book freight, publish Shopify, write Monday, create/send Xero quote or invoice, schema migration, restart services |
| 4. Forbidden by default | Actions agents should not perform without a new explicit policy change | Sending emails as Guido, paying bills, deleting records, bypassing approval gates, using secrets in prompts/logs |

## What agents can read

Agents may read/check/compare these by default, with source labels and timestamps:

- Gmail threads, Sent, and Drafts via the read-only helper routes
- Supabase/Tuesday leads, orders, order links/events, workflows, freight quote events, dispatch fields
- Monday boards/items/columns for legacy production, stock, customer history, and workflow status
- Xero quotes, invoices, payments, bills, contact records, and PDF/source evidence where available
- Shopify live pages, products, theme IDs, page content, SEO fields, and current theme state
- Drive/Docs/Sheets/source PDFs used for quotes, orders, welcome packs, supplier evidence, or costing
- Local reference files under `reference/`, `docs/current/`, and Hermes skills/references
- Existing scripts, cron definitions, logs, worker result files, git branches/worktrees, and test output
- Carrier/tracking/admin notifications when matched to a specific order with high confidence

Read rule:

- Always state which source was checked.
- Never treat old handovers, notes, drafts, or memories as live state without readback.
- Never print secrets, tokens, connection strings, customer-sensitive raw data dumps, or unnecessary personal details.

## What agents can draft or preview

Agents can prepare private artifacts without further approval when the task asks for them:

| Draft/preview | Required inputs | Required proof before reporting ready |
|---|---|---|
| Customer email draft | Latest Gmail thread, Sent/Draft state, Supabase/Monday/Xero context as relevant | Gmail readback shows `DRAFT`, not `SENT`, correct recipient/thread/subject/body/signature |
| Quote packet | Customer request, spec, quantity, location, costing/source evidence, Xero precedents | Calculator/source totals checked, assumptions labelled, no Xero send |
| Xero quote/invoice wording | Current template, quote spine, email trail, Xero contact/history | Draft/preview only unless exact approval covers Xero mutation |
| Order/freight packet | Supabase order, Monday state, address/contact, package dimensions, payment, QC/photos/welcome/gift/provenance gates | Missing fields listed, no Mainfreight/Pinpoint/customer action taken |
| Pinpoint/local delivery email text | Customer/order, destination, timing, Sophia/Pinpoint source, delivery constraints | Draft only, no email sent |
| Customer pickup instructions | Order ready state, workshop address, pickup window, payment/QC/welcome gates | Draft only, workshop address checked as 281 QEII Drive |
| Mission Control/Tues UI proposal | Current lane brief, source-of-truth split, user role | Screenshot/mock/spec clearly marked draft or preview |
| Internal briefing | Source links, evidence, owner, next action | Distinguish checked vs inferred vs blocked |

## What agents can update under standing approval

These are internal source-of-truth updates that can be made when the source evidence is verified and the change is within existing rules:

- Supabase/Tuesday lead or order notes after Guido reports or asks to inspect a customer communication.
- Supabase/Tuesday lead details discovered from verified Gmail/customer threads, such as email, phone, location, requested item, budget/timing, and next action.
- Supabase/Tuesday order/customer-touchpoint updates after verified customer-visible events, such as sent email, phone call, visit, quote accepted/declined, delivery conversation, payment acknowledgement, ready-for-balance, ready-for-delivery, or customer-impacting supplier blocker.
- Payment status/date only after a verified settled payment match from the approved payment source.
- Internal next_action cleanup when the latest sent/customer/source evidence proves the old next action is stale.
- Internal reference/skill updates when a workflow lesson, correction, or durable operating rule is discovered.
- Local/private draft or report files requested by Guido.

Standing update readback requirement:

1. Read the before state or source evidence.
2. Write the smallest factual change.
3. Read the row/file back.
4. Report changed fields, proof, and remaining gap.

## Actions requiring exact Guido approval

Agents must stop and ask for exact approval before:

- sending any email, SMS, Telegram, customer message, supplier message, Pinpoint message, Mainfreight/customer notification, or team-visible message
- publishing or editing live Shopify/website content, products, themes, redirects, or public pages
- pushing staging/live theme changes unless the exact scoped push was approved
- creating, sending, voiding, approving, paying, or changing Xero quotes, invoices, bills, or payments
- booking Mainfreight, Pinpoint, Courier IT, courier, delivery, pickup, or any carrier service
- writing to Monday unless the workflow has explicit approval for that exact write
- creating/changing Supabase schema, migrations, RLS, credentials, storage policies, or production config
- restarting gateways/services, changing Hermes/provider/gateway/cron config, or changing scheduled jobs
- deleting files, records, drafts, emails, database rows, themes, products, logs, or customer data
- sharing Drive files, changing permissions, inviting users, or expanding Nick/Dylan/team access
- making public Vercel/review links for Nick/team-visible use unless explicitly requested and verified
- committing, merging, deploying, or pushing code that affects live systems without approval
- changing customer price, margin, discount, delivery promise, production date, or payment terms

## Evidence that must be read back

| Action type | Minimum readback proof |
|---|---|
| Gmail draft | Draft ID/thread ID, recipient/cc, subject, `DRAFT` present, `SENT` absent, latest-thread fit, signature present |
| Gmail sent verification | Message ID/thread ID, `SENT` state, Date filtered to NZ time where day-bounded, recipient/cc/subject |
| Supabase/Tuesday write | Row ID, changed fields before/after, updated_at or event ID, exact source evidence |
| Monday write | Board/item ID, changed column ID/value, item readback link, source reason |
| Xero context | Quote/invoice number, contact, status, total, currency/GST basis, payment state, PDF/source if relevant |
| Xero mutation | Exact approval text, dry-run/preview, created/updated ID, status, totals, email/send state, PDF/readback |
| Shopify/theme change | Theme ID/role, exact files/objects changed, backup path, preview/live URL, visual/public check result |
| Freight booking | Carrier, service, account mapping, collection/delivery address, package lines, booking/consignment/tracking ref, labels/docs |
| Payment update | Source, transaction ID/reference, settled date, amount, payer/contact match, invoice/order link |
| Worker/code task | Worktree path/branch, process/job ID, changed files, diff summary, tests/checks output, dirty-tree status |
| Cron/job | Job ID, schedule, prompt/script, delivery target, run output or dry-run proof |
| Local doc/reference update | File path, created/changed section, readback confirms content, no customer-visible side effect |

## Logs and audit trail that already exist

| Existing trail | Use |
|---|---|
| Supabase `orders`, `order_links`, `order_events` where available | Order source-of-truth and order event history |
| Supabase `leads` and related lead fields | Lead source-of-truth, though event/link coverage may still be incomplete |
| Mission Control/Tues references under `reference/tuesday/` | Durable lane and design decisions |
| Gmail Drafts/Sent/thread state | Email action proof and stale-draft checks |
| Xero record history/status/PDFs | Accounting proof and quote/invoice state |
| Monday item links/column values | Legacy production/workshop state |
| Shopify `reference/website-change-log.md` and theme backups | Website/theme change proof |
| Git branches/worktrees and diffs | Code change proof |
| Hermes cron output and script logs | Scheduled job proof |
| Priority alert and ready-dispatch guardrail outputs | Internal alerting state |
| Worker result files/process IDs | Background worker evidence |
| Drive/Docs revision history | Document source and edit history where Drive is used |

## Audit gaps to close

- A single `agent_action_events` table or equivalent log covering all agent reads, drafts, writes, approvals, and readbacks.
- A stable lead/order event model for all customer touchpoints, not just mutable notes/next_action.
- A cross-system correlation ID for each agent job, draft, source update, or carrier/quote packet.
- A standard evidence packet schema saved with every worker result.
- A redaction layer for secrets and sensitive customer data before worker prompts/logs.
- A permission/capability registry that every script/tool can check before mutation.
- A rollback/repair note field for each approved write where rollback is possible.

## APIs, scripts, and docs missing for a clean agent interface

### Highest priority

- `agent-interface.json` now exists as the first machine-readable capability map for Mission Control. Next step is enforcement: load/validate it from scripts or app code, and keep it aligned with this checklist.
- Read-only API/view for today's active business state: hot leads, waiting customers, active orders, production blockers, freight blockers, cash/payment blockers, and stale drafts.
- Write-safe API for approved Supabase/Tuesday touchpoint updates, with required source evidence and automatic readback.
- Central `agent_action_events` audit table with fields like: actor, profile, action, permission_level, source_system, entity_type, entity_id, before, after, evidence_refs, approval_text, result, created_at.
- Dispatch readiness API/view that exposes QC, photos, welcome sheet, provenance card, gift board, payment, route, address/contact, package dimensions, carrier, collection date, tracking/ref, and blocker state.
- Approval queue UI in Mission Control where drafts/packets can be reviewed, approved, rejected, or edited.

### Next priority

- Stable Monday field map and sync policy docs for production/order fields still controlled by Monday.
- Xero quote/invoice dry-run helper that returns totals, status, contact, PDF evidence, and send-state without sending.
- Freight carrier adapter interface: Mainfreight preview first, live booking later, Pinpoint/local email packet, pickup packet.
- Gmail draft helper contract: required signature, latest-thread check, stale-draft detection, no send path.
- Payment verification helper: Akahu/Xero/bank evidence, settlement gate, invoice/order matching, duplicate prevention.
- Shopify read-only live-source checker with exact theme/page/product evidence and explicit write gate.
- Worker prompt templates per lane: Leads, Quoting, Orders, Freight, Stocktake, Dashboard, Website, Content.

### Useful later

- Internal `auth.md`-style discovery file for Innate agent tools, not public web signup, but a machine-readable map of allowed internal capabilities.
- Lane-specific eval tests: can the agent classify source-of-truth, stop before send, produce evidence, and update only allowed fields?
- Human-readable approval phrases embedded in each high-risk preview, for example: `Approve creating this Gmail draft only` or `Approve Mainfreight booking for INV-____ with these package lines`.
- Role-based access levels for Guido, Hermes/default, Tuesday worker, Website worker, Content worker, Nick, Dylan, and external collaborators.
- Data retention policy for freight quote events, customer addresses, logs, screenshots, and worker outputs.

## Lane-by-lane checklist

### Dashboard

- [ ] Shows source health and last refresh time.
- [ ] Pulls from lane summaries, not invented dashboard statuses.
- [ ] Separates customer-waiting, cash, production, freight, and data-quality exceptions.
- [ ] Each card has source links and proof timestamp.
- [ ] Draft actions are clearly draft-only.
- [ ] No customer/team-visible action button bypasses approval.

### Leads

- [ ] Read Gmail/Supabase/Monday/Xero history before classifying priority.
- [ ] Supplier/admin/bookkeeping emails are excluded from customer-priority queues unless tied to a customer blocker.
- [ ] New verified lead details update Supabase/Tuesday under standing approval.
- [ ] Customer replies create draft replies, not sends.
- [ ] Every lead row has next_action, owner, source evidence, and stale-draft check.

### Quoting

- [ ] Quote packet reads customer request, latest thread, costing source, prior Xero records, and source invoice/cost evidence.
- [ ] Markup vs margin is explicit.
- [ ] Quote totals and GST are arithmetic-checked.
- [ ] Xero create/send requires exact approval.
- [ ] Customer price anchors are preserved unless Guido approves repricing.

### Orders / Production

- [ ] Read Supabase/Tuesday and Monday before status claims.
- [ ] Classify live order by payment gate, lifecycle, product family, fulfilment path, and special constraints.
- [ ] Updates separate status, next_action, customer-visible promise, and internal note.
- [ ] Monday writes require exact approval or approved sync workflow.
- [ ] Readback proves both source-of-truth state and legacy/workshop state when both matter.

### Freight / Dispatch

- [ ] Completion triggers readiness validation, not blind booking.
- [ ] Checks QC, photos, AI photo review, welcome sheet, provenance/species card, gift board, payment, route, address, phone, email, dimensions, weight, package count.
- [ ] Builds Mainfreight/Pinpoint/pickup packets as previews first.
- [ ] No booking or carrier/customer message without exact approval.
- [ ] Tracking/consignment refs are read back after carrier confirmation.
- [ ] Freight quote-vs-actual gets recorded for future margin control.

### Stocktake / Purchase Orders

- [ ] Read current stock and supplier state before suggesting purchase.
- [ ] Draft POs or supplier emails only.
- [ ] Supplier constraints affecting customer promise are captured as order/lead notes when relevant.
- [ ] Supplier/admin messages do not enter customer-priority queues by keyword alone.
- [ ] Actual ordering/payment requires exact approval.

### Website / Shopify

- [ ] Live site/theme/admin state checked before claims about the live website.
- [ ] Local files are not treated as live unless pulled/compared with the target theme.
- [ ] Staging/live theme IDs verified before push.
- [ ] Visual checks cover desktop and mobile before ready-for-review claims.
- [ ] Live publish remains exact approval only.

## Minimum acceptance test for any new agent-facing action

Before a new button, script, worker, or API is considered agent-ready, answer:

1. What entity does it act on?
2. Which source of truth does it read?
3. What permission level is it?
4. What inputs are required?
5. What fields can it change, if any?
6. What actions are explicitly forbidden?
7. What proof must be read back?
8. Where is the audit event stored?
9. What is the safe failure mode?
10. What exact approval phrase is needed if it crosses into Level 3?

If any answer is missing, the interface is not agent-ready yet.

## Recommended build order

1. Done as internal reference: write `reference/tuesday/agent-interface.json` for current lanes and capabilities.
2. Add `agent_action_events` audit table or equivalent central log.
3. Build read-only daily state API/view.
4. Build standing-approved Supabase touchpoint update helper with readback and audit event.
5. Build dispatch readiness API/view and packet preview.
6. Build Mission Control approval queue for drafts/packets.
7. Only then consider live carrier/API/send integrations behind exact approval and audit gates.
