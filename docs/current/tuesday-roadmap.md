# Tuesday Roadmap — Engine vs Copilot

Status: active strategic plan (2026-07-05). Guido's constraint: **nothing Tuesday
needs to run may depend on any AI — including Claude.** AI is a collaborator that
builds and assists; it is never a runtime dependency. This document plans every
improvement around that line and is executable by any competent builder (a future
Claude session, a Hermes coding worker, a human dev, or Guido) — nothing here needs
Claude specifically.

## The design law

Two layers, kept strictly separate:

- **The engine — runs forever, zero AI.** Everything that touches money, orders,
  tasks, production, stock, the board Nick & Dylan use, and the data behind it.
  Plain deterministic code + Innate's real business systems (Supabase, Xero,
  Monday, Shopify, Mainfreight, Resend, Google, Slack). If every AI on earth
  switched off tomorrow, the engine keeps running untouched.
- **The copilot — helpful, disposable.** Anything that drafts, suggests, analyses,
  or summarises. Hermes writing a reply, an agent building a feature, a suggested
  customer update. If it vanishes, the business never stops — you just type more.

**The test for any feature:** *"If every AI switched off, does this still work?"*
If it must keep working → it belongs in the engine → it is deterministic code, no
AI. If it is genuinely just help → it is copilot → a human confirms it, and a
manual path always exists alongside it.

## The approval law (binding, shared with Hermes)

Every feature here obeys the same approval policy Hermes runs under
(`/Users/mack-mini/.hermes/reference/platform/approval_policy.md`; also in this
repo's `AGENTS.md`). Two rules override any "reduce workload" goal:

- **Nothing is sent to a customer from automation, ever.** Agents prepare drafts;
  Guido does the final send himself.
- **Nothing durable, live, or customer-visible happens without Guido's approval** —
  including creating and loading a production plan.

So the shape of every step below is: **prepare / draft → Guido approves → act.**
"Automatic" means the *preparation* is automatic, not the commitment.

## Current state (verified 2026-07-05)

- **The live app has zero AI in it.** Runtime code (`app/`, `lib/`) makes no calls
  to Anthropic, OpenAI, or any LLM — verified by grep and by the guard script
  below (`npm run check:no-ai-runtime`; CI wiring pending, see Enforcement). It
  talks only to Innate's business systems.
- **CI, `/api/health`, rollback, and the Hermes maintenance watchdog** are all
  deterministic and Claude-independent.
- The only Claude dependency that ever existed (the morning report, via Claude's
  own scheduler) has been migrated to a Hermes cron job (`~/.hermes/cron/`,
  deterministic Python, no LLM).

So the engine/copilot split is already true today. This roadmap keeps it true while
making Tuesday do far more.

## The foundation — in order, all ENGINE, all AI-free

### 1. One order, two truths (data model) — the unlock  ✅ STEP 1a DONE (2026-07-05)

**Problem:** `orders.status` tries to express two independent things at once —
*where's the payment* and *where's the workshop*. Payment automation and workshop
reality then overwrite each other on one field (proven 2026-07-05: manual workshop
fixes to Fowler/Kidd reverted to `awaiting_payment` within minutes).

**Fix:** split into two fields, each moved by one owner, neither touching the other:

- `payment_stage` — `quote` / `deposit_paid` / `balance_due` / `paid_in_full`.
  Derived deterministically from Xero invoices + Akahu payments. The reconcile
  pipeline owns this.
- `workshop_stage` — `not_started` / `materials` / `in_production` / `finishing` /
  `curing` / `qc` / `ready` / `dispatched`. Advanced deterministically as Nick &
  Dylan tick production tasks. The board owns this.

**Migration:** add both columns; backfill from today's `status` + `finished_date` +
task history; change the intake/reconcile code to write only `payment_stage`;
change the board to read and show both. Keep `status` as a derived convenience for
one release, then retire it.

**Progress:** columns `payment_stage` + `workshop_stage` added to `orders` and backfilled on live DB 2026-07-05 (migration order_stage_split_add_columns; SQL in reference/tuesday/supabase-order-stage-split-schema-2026-07-05.sql). Additive, reversible, app still reads `status` unchanged. STILL TODO: board reads/shows both; intake writes ONLY payment_stage; board advances workshop_stage on task completion; then retire `status`.

**Why first:** every screen and every automation below assumes the state is
trustworthy. It is not until this lands. Deterministic; no AI.

### 2. Orders build themselves (auto-intake + auto-plan)

When a deposit is confirmed paid (Xero invoice + Akahu match — already
deterministic), Tuesday should **prepare a DRAFT production plan** from the process
templates — POs, timber pull, laminate wait, CNC gate, coats, cure, QC, pack,
dispatch — with dates computed from supplier lead times and Nick/Dylan availability.

The draft sits in a clearly-marked "proposed plan" state. **Guido (or Nick)
approves it in one tap; only then does it become the live workshop plan.** Nothing
auto-loads unreviewed — that is the hard rule (see the approval law above).

The plan logic already exists as deterministic code (`lib/production/
workshop-process-rules.ts`). This is code reading a template, **not an AI guessing.**

**Result:** the moment a deposit lands, the plan is drafted and waiting for a
one-tap approval, instead of Guido building it by hand. Kills the manual setup time
and the duplicate-order class, while keeping a human in the loop. Deterministic; no AI.

### 3. Milestone triggers → customer updates (mostly engine)

Deterministic triggers on stage changes **prepare a templated draft** (plain text +
merge fields, no AI) and surface it for a one-tap send **that Guido makes himself**:

- `deposit_paid` → draft "order confirmed, here's what happens next"
- `qc` / `ready` → draft "your table's ready, let's arrange delivery"
- `dispatched` → draft tracking + care instructions

**Hard rule (approval law above): nothing is sent to a customer from automation.**
The trigger writes the draft and puts it in Guido's approve-and-send queue; the send
is always a human tap. Templates cover the common cases; AI may polish a
non-standard one, and if AI is gone the templates and manual path still work.

**Result:** follow-ups stop depending on Guido's memory — the right message is
pre-written and waiting for his tap — without ever sending unreviewed. This is the
biggest single cut to his workload (slow follow-up is Innate's top revenue risk).

### 4. The dead-simple workshop view (engine)

Once 1–2 are solid: a Nick/Dylan kiosk that reads `workshop_stage` + today's tasks
— big targets, tick to advance the stage, nothing else. Pure app code. This is the
adoption unlock; the earlier attempt failed because it floated on shaky data, not
because it was too simple.

### 5. Polish (engine)

Clutter and consistency. Already guarded by the theme-drift ratchet and the QA
crawler — so this layer can't regress silently.

## What stays copilot — and must never move into the engine

- Hermes drafting replies, quotes, or summaries (assist; manual always works).
- Any agent (Claude included) building or fixing Tuesday — a **development-time**
  activity, never a runtime one.
- Anything that "suggests / analyses / summarises / drafts."

## Enforcement — the rule is mechanical, not honour-system

- **No-AI-in-the-engine guard** (`npm run check:no-ai-runtime`): fails the
  build if any file under `app/` or `lib/` imports or calls an AI SDK
  (anthropic / openai / claude / gemini / etc.). This is the same style of guard as
  the theme-drift ratchet — it makes "the engine has no AI" impossible to violate
  by accident, forever. TO WIRE INTO CI (needs a GitHub token with `workflow`
  scope — the automation token used on 2026-07-05 lacked it): add this after the
  "Theme drift ratchet" step in `.github/workflows/ci.yml`:
  `- name: No AI in the engine\n        run: npm run check:no-ai-runtime`
- CI already runs: read-only Monday guard, page contracts, planning tests, theme
  ratchet, lint, typecheck, build. The QA crawler and health watchdog cover
  runtime. A competent builder can execute this whole roadmap safely against those
  gates, with sub-minute rollback documented in `tuesday-deploy-runbook.md`.

## Build order summary

1. Split `status` → `payment_stage` + `workshop_stage` (migration + intake + board).
2. Auto-generate the production plan from templates on deposit-paid.
3. Milestone-triggered templated customer emails (+ optional AI drafting on top).
4. Nick/Dylan kiosk reading `workshop_stage`.
5. Ongoing polish, guarded by the ratchet + crawler.

Every step is normal Next.js + Supabase + SQL. None of it requires Claude.
