# Tuesday Visual Audit Protocol

Status: active Tuesday proof protocol.
Purpose: make Tuesday agents prove the exact Mission Control screen across desktop, tablet, and mobile before claiming a UI change is ready.

This protocol is read-only unless Guido separately approves a scoped code/data/live change.

## When To Use

Use this for:

- broad Tuesday visual QA;
- "scan Tuesday";
- formatting or polish checks;
- review-link verification after a UI change;
- desktop/tablet/mobile proof before reporting ready;
- any frustrated report that the app is rough, wrong, old, or regressed.

For small Production Plan mobile work, also use the mobile work queue skill. For live/deploy incidents, also use the reliability control loop.

## Required Source Proof

Before visual judgement, prove the exact source:

- local worktree path;
- actual dev-server port;
- Tailscale/review URL if Guido will open it remotely;
- exact route;
- whether it is local, preview, or live;
- expected visible text from the changed screen.

For Guido-facing local review links, run:

```bash
npm run verify:tuesday-review-link -- --port <actual-dev-server-port> --expect "<changed visible text>" --require-selector "<changed selector>"

This must pass the Mac mini Tailscale URL in both desktop and mobile Chromium. A localhost-only check, raw HTTP 200, or logged-out/login-page render is not acceptable proof.
```

Do not give `localhost` as the review link for Guido. Use the Mac mini Tailscale hostname/IP and the actual worktree port.

## Default Visual Audit

Run from `/Users/mack-mini/innate-mission-control`:

```bash
npm run audit:tuesday-visual -- --port <actual-dev-server-port>
```

Or against a full review/live URL:

```bash
npm run audit:tuesday-visual -- --base-url http://<mac-mini-tailscale-host>:<port>
```

For a focused route:

```bash
npm run audit:tuesday-visual -- --port <port> --url /production/plan
```

The command saves:

- `report.md`
- `report.json`
- `screenshots/*.png`

under:

```text
reference/evidence/YYYY-MM-DD/tuesday-visual-audit-YYYYMMDD-HHMMSS/
```

## Default Route Set

The scanner covers:

- `/production/plan`
- `/production/stock`
- `/production/samples`
- `/production/dispatch`
- `/leads`
- `/freight-quotes`
- `/costings`
- `/quoting`
- `/today`

Add routes with `--url` for changed pages, experiments, or newly added tabs.

## Required Viewports

The scan uses:

- desktop: 1440 x 1000;
- tablet-wide: 1024 x 900;
- tablet: 768 x 900;
- mobile: 390 x 844.

Do not skip intermediate widths. Tuesday often fails in the awkward middle between desktop and phone.

## What The Scanner Checks

The scanner records and flags:

- route status and final URL;
- login/auth page accidentally rendered;
- app/runtime error text;
- missing expected route labels;
- horizontal overflow;
- visible elements causing overflow;
- too-small common action targets;
- clipped text candidates;
- weak visible form fields;
- console/page errors and failed requests;
- first-screen route identity;
- full-page screenshots for every route/viewport.

These are automated guardrails. After the scan, the agent must still review screenshots with `docs/current/tuesday-agent-design-standard.md`.

## Pass / Fail

Do not call a screen ready if:

- the exact route cannot be loaded;
- the wrong app, login page, or 404 is shown;
- the review URL is not tied to the actual port/worktree;
- mobile has horizontal overflow;
- a changed screen was not checked on desktop and mobile;
- screenshots were generated but not reviewed;
- source/provenance is uncertain.

Warnings are not automatic blockers, but they must be skimmed. A warning pattern that affects the requested change becomes a blocker until fixed or named as a caveat.

## Handoff Shape

```text
Tuesday visual QA

Scope:
- worktree:
- base/review URL:
- routes:
- viewports:

Result:
- pass/fail:
- evidence:

Checked:
- review-link verifier:
- desktop:
- tablet/intermediate:
- mobile:

Live/data touched:
- no

Caveats:
- ...
```
