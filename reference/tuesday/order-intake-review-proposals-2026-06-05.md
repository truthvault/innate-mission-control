# Order Intake Review Proposals - 2026-06-05

Read-only pass for `TCR-003`.

No Supabase rows, tasks, payments, invoices, or live app code were changed.

## Current Finding

Tuesday currently has 10 order-intake review rows. Only 7 need a Nick/Guido decision before approval. The other 3 should not be treated as pending new production work:

- Camilla Penney is already approved and active.
- Taylor Vets Ltd is complete/fulfilled and should stay cleared from production intake.
- David Tidey is an approved design-stage/test workflow, not paid production work.

## Recommended Decisions

| Order | Current Evidence | Recommendation | Why |
| --- | --- | --- | --- |
| Kelven Plamondon / INV-1146 | Xero paid; Akahu matched 2026-05-27; timber supply: 3 totara planks and 2 totara panels. | Ready after stale-date cleanup and existing-task check. | This is supply-only, not a table/benchtop build. There are also existing Kelven overlay tasks, so approval should not duplicate them. |
| Raine Wapp / INV-1147 | Xero paid; Akahu matched 2026-06-02; West Coast Beech benchtop panel, 2685x750x33mm, darkwash/oil, Mainfreight 2 Home. | Clean up the draft plan before Nick approves. | Current generic table plan is close but not accurate enough for a benchtop/darkwash workflow. |
| Janette and Michael Sharp / INV-1143 | Xero paid; Akahu matched 2026-05-21; dining table, totara, blackwash, reverse angled steel base. Existing live planner tasks already exist. | Do not approve intake as a new plan. Mark/handle as absorbed into existing planner after approval. | Approving the full intake template would duplicate work Nick already has in the schedule. |
| Hayden & Paula | Manual no-charge remedial; no invoice required; sample-first remedial work. | Keep as manual remedial review. Clean labels/dates/owner only; do not schedule full replacement top yet. | It is not a paid intake order. The full benchtop-like process should only start after sample approval. |
| Sherry Cai / INV-1142 | Xero says paid; invoice says Shopify payment; Akahu has two probable amount-only matches, no exact invoice/customer match. | Keep in Needs review. Do not approve production. Route/confirm as sample/Shopify dispatch. | Payment source is ambiguous and this appears to be samples, not normal production work. |
| Aitkens & Co Ltd / INV-1126 | Xero paid; Akahu evidence probable only and references `INV 0990`; 60 totara A4 menu holders and 60 table numbers. | Keep in Needs review until payment/reference is confirmed, then replace table template with batch/engraving workflow. | It is not a table, and the current template would be wrong for a batch hospitality order. |
| Abigail Richards / Michael Calder / INV-1029 | Xero paid; no Akahu match stored; order status is already `in_production`; three recycled rimu benchtops with clear finish and sink/stove cutouts. | Keep in Needs review; reconcile with existing production state before adding tasks. | It is likely legacy/in-progress work. A new generic template could duplicate or contradict Nick's current plan. |

## Proposed Draft Plans

### Kelven Plamondon

Status decision: `Ready, but check existing Kelven tasks first`.

Suggested plan if not already done:

| Step | Task | Owner | Hours | Notes |
| --- | --- | --- | --- | --- |
| 1 | Material + spec check | Nick | 0.5 | Confirm totara plank/panel quantities, raw/dressed finish, and collection/delivery. |
| 2 | Timber pulled | Dylan | 1.0 | Pull/count/check the 3 planks and 2 panels against invoice line items. |
| 3 | Pack / wrap | Dylan | 0.5 | Strap/label/protect the supply pack. |
| 4 | Customer update | Guido | 0.25 | Confirm collection/delivery with Kelven. |

### Raine Wapp

Status decision: `Clean draft, then ready for Nick`.

Suggested benchtop plan:

| Step | Task | Owner | Hours | Notes |
| --- | --- | --- | --- | --- |
| 1 | Material + spec check | Nick | 0.75 | Confirm 2685x750x33mm, West Coast Beech, darkwash/oiled finish, delivery address, and whether stock panel/lamination is already available. |
| 2 | Timber pulled | Dylan | 1.0 | Pull/check the panel or timber stock. Flag if lamination/PO is required before machining. |
| 3 | Cut / machine / prep | Nick | 1.5 | Machine/trim/prep benchtop to size and finish-ready state. |
| 4 | Sand and coat | Dylan | 1.0 | Sand and apply first darkwash/oil finish stage. |
| 5 | Second coat | Dylan | 1.0 | Continue finish build. |
| 6 | 4th coat (blackwash final) | Dylan | 1.0 | Use this only if darkwash process needs the darker multi-coat path; otherwise Nick can change to clear-final/third coat. |
| 7 | QC + photos | Nick | 0.75 | Check dimensions, finish, underside/edges, and photograph before wrap. |
| 8 | Book freight | Nick | 0.5 | Book Mainfreight 2 Home to 13 Olive Road, Penrose, Auckland. |
| 9 | Pack / wrap | Dylan | 1.0 | Protect for freight. |
| 10 | Customer update | Guido | 0.25 | Confirm freight/update with Raine. |

### Janette and Michael Sharp

Status decision: `Absorb into existing planner, do not approve new intake template`.

Existing Tuesday/Monday overlay already shows Janette planning tasks such as spec/material check, select/pull totara, cut/top prep, sand/coat, second coat, and final coat. The safest cleanup is not a new task plan. Instead:

- Keep invoice/order details available.
- Show this order as already in the live production plan.
- Only add missing future tasks if Nick explicitly says they are missing.
- Do not generate another full table template from the intake row.

### Hayden & Paula

Status decision: `Manual no-charge remedial; sample-first only`.

Suggested sample-stage plan:

| Step | Task | Owner | Hours | Notes |
| --- | --- | --- | --- | --- |
| 1 | Confirm sample spec | Nick | 0.5 | Confirm target: face-laminated Northland totara, light whitewash/pale French oak tone, avoid warm/yellow. |
| 2 | Make whitewash sample | Dylan | 1.5 | Make the sample before any full replacement top is scheduled. |
| 3 | QC + photos | Nick | 0.75 | Check tone/finish and photograph. |
| 4 | Customer update | Guido | 0.25 | Guido sends/updates Hayden & Paula and waits for sample approval. |

Future full replacement top, only after sample approval:

- Material + spec check.
- Pull timber / confirm stock.
- Send PO or confirm lamination if required.
- Cut / machine / prep.
- Sand and coat.
- Second coat.
- 3rd or 4th coat depending on final colour.
- Engraving if required.
- QC + photos.
- Pack / wrap.
- Book freight.
- Customer update by Guido.

### Sherry Cai

Status decision: `Needs payment/source review; probably sample/Shopify, not production`.

Do not approve yet. Confirm whether Shopify order `#1333` is the payment source and whether samples have already gone. If work is still needed:

| Step | Task | Owner | Hours | Notes |
| --- | --- | --- | --- | --- |
| 1 | Material + spec check | Nick | 0.25 | Confirm 3 timber samples and any label/finish requirement. |
| 2 | Pack / wrap | Dylan | 0.5 | Pack sample set. |
| 3 | Customer update | Guido | 0.25 | Confirm sample dispatch/update. |

### Aitkens & Co Ltd

Status decision: `Needs payment/reference review; then batch/engraving plan`.

Do not approve as a table. Confirm why Akahu reference is `INV 0990` for `INV-1126`. If payment is accepted, use a batch hospitality workflow:

| Step | Task | Owner | Hours | Notes |
| --- | --- | --- | --- | --- |
| 1 | Material + spec check | Nick | 1.0 | Confirm 60 menu holders, 60 table numbers, totara, tung oil, dimensions, numbering/engraving proof. |
| 2 | Timber pulled | Dylan | 1.0 | Pull/check totara stock for batch quantities. |
| 3 | Cut / machine / prep | Nick | 2.0 | Machine menu-holder grooves and table-number blanks/bases. |
| 4 | Engraving | Nick | 1.5 | Proof and laser engrave table numbers. |
| 5 | Sand and coat | Dylan | 2.0 | Batch sand and tung-oil first finish stage. |
| 6 | Second coat | Dylan | 1.0 | Continue oil/finish stage if required. |
| 7 | QC + photos | Nick | 1.0 | Count all 120 pieces, check engraving/order consistency, photograph proof. |
| 8 | Pack / wrap | Dylan | 1.5 | Batch pack by type/number sequence. |
| 9 | Customer update | Guido | 0.25 | Confirm dispatch/collection update. |

### Abigail Richards / Michael Calder

Status decision: `Needs reconciliation before approval`.

Do not approve until existing in-production status is reconciled. If Nick confirms a new clean plan is needed, use a benchtop-specific plan:

| Step | Task | Owner | Hours | Notes |
| --- | --- | --- | --- | --- |
| 1 | Material + spec check | Nick | 1.0 | Confirm three recycled rimu benchtops, clear finish, 2790x600x42 with sink/stove cutouts, 1300x900x42, 700x450x42. |
| 2 | Timber pulled | Dylan | 1.0 | Confirm panels/timber already available or what still needs laminating/prep. |
| 3 | Cut / machine / prep | Nick | 2.0 | Size panels and prepare cutout locations/templates. |
| 4 | Custom cutouts | Nick | 1.5 | Sink/stove cutouts for the large benchtop. |
| 5 | Sand and coat | Dylan | 1.5 | Sand and first clear finish stage. |
| 6 | Second coat | Dylan | 1.0 | Continue clear finish. |
| 7 | 3rd coat (clear final) | Dylan | 1.0 | Final clear coat path, not blackwash. |
| 8 | QC + photos | Nick | 1.0 | Check dimensions, cutouts, finish, and delivery readiness. |
| 9 | Pack / wrap | Dylan | 1.0 | Protect all three benchtop pieces. |
| 10 | Book freight | Nick | 0.5 | Delivery to 20 Aberdeen St, Christchurch. |
| 11 | Customer update | Guido | 0.25 | Guido sends customer update. |

## Proposed Safe Implementation Order

1. Do not approve or write any of the above yet.
2. First fix the UI/data rule so approved/complete/special rows do not look like fresh pending orders.
3. Add an `absorbed_existing_plan` or similar review outcome for Janette-style rows, so old planner work is not duplicated.
4. Add a `sample/shopify/manual_review` path for Sherry-style rows.
5. Update draft tasks one order at a time only after Guido approves that specific order's proposed plan.

