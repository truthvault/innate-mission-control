# Tuesday Ultimate Stock tab architecture

Created: 2026-06-18
Owner: Tuesday / Innate Mission Control
Finance lens: Midas / Xero
Status: architecture and implementation lead brief, no production schema/UI changes yet

## Correction / direction

Stock and WIP should be owned in **Tuesday**, not Monday.com.

Monday.com can be treated as legacy evidence/import source during transition, but the target system is Tuesday as the operating source of truth for stock quantities, allocations, usage, and month-end stocktake reconciliation.

Xero remains the accounting and price-observation authority for bills, supplier contacts, official purchase costs, invoices, payments and financial reporting. Tuesday should consume Xero data and turn it into operational stock intelligence.

## North star

Build the most automated, accurate and low-human-effort stock system possible for Innate:

> Xero bills and receipts create/update stock quantities and material costs. Costing sheets and production orders reserve and consume stock. Monthly physical stocktake reconciles reality. Tuesday shows real-time quantity, availability, value, source evidence, variance and action queue. Xero receives clean monthly stock/WIP summary evidence for Tineke/accountant review.

## Core principles

1. **Tuesday owns operational reality**
   - What material exists.
   - Where it is.
   - What it is reserved for.
   - What has been consumed by active jobs.
   - What needs counting, purchasing, or review.

2. **Xero owns financial evidence**
   - Bills received.
   - Supplier line descriptions.
   - Supplier contacts.
   - Price observations.
   - Official accounting reports and journals.

3. **Humans handle exceptions, not routine data entry**
   - A normal supplier bill should suggest or update stock automatically.
   - A costing sheet should reserve/consume expected materials automatically.
   - Physical stocktake should only resolve variances, not rebuild the stock register.

4. **Every quantity/value must have provenance**
   - Source bill, stocktake, costing sheet, manual adjustment, supplier-held confirmation, or variance approval.
   - No unexplained numbers.

5. **Stock and WIP are separate but connected**
   - Stock on hand = owned material/components not yet consumed.
   - Reserved stock = stock promised to jobs but not yet used.
   - WIP = material/labour/freight value consumed/incurred for jobs not yet complete or fully recognised.

## Target user experience

### Stock tab overview

A single cockpit with:

- Total stock value at approved/current cost
- Available stock value
- Reserved stock value
- WIP material value
- Supplier-held stock value
- Variance requiring review
- Items below reorder point
- Recently receipted goods
- Jobs consuming stock this week
- Month-end stocktake status

### Main stock table

Columns:

- Material / item name
- Category: timber, steel, finish, hardware, fabric, beanbag fill, packaging, other
- Species/material detail
- Dimensions/spec
- Unit: lm, m2, each, litre, kg, set, sheet, panel
- Quantity on hand
- Quantity reserved
- Quantity available
- Quantity consumed this month
- Current unit cost ex GST
- Stock value ex GST
- Location: workshop, rack/bin, supplier-held, in transit, allocated job
- Supplier
- Last Xero price update
- Last stock movement
- Last counted date
- Confidence: high / medium / low
- Status: OK / low stock / stale count / variance / needs mapping / inactive

### Drill-in item page

For each stock item:

- Current balance
- Movement ledger
- Receipted goods history from Xero bills
- Usage history from costing sheets/orders
- Manual adjustments with approval trail
- Stocktake counts and variances
- Price history from Xero
- Supplier links
- Related active jobs
- Recommended reorder quantity or action

### Exception/action queue

The system should surface only what needs human judgement:

- Xero bill line could not be mapped to a stock item
- Bill quantity/unit ambiguous
- New supplier item not recognised
- Price changed materially from previous approved price
- Costing sheet requests more material than available
- Physical count variance over tolerance
- Supplier-held stock confirmation missing
- Item not counted this month
- Negative available stock
- Duplicate/mismatched item names

## Data model concept

### stock_items

Canonical material/component records.

Fields:

- id
- item_code
- name
- category
- species_or_material
- dimensions/spec
- default_unit
- xero_item_id if applicable
- default_supplier_id
- active/inactive
- reorder point
- reorder quantity
- preferred location
- notes

### stock_locations

Where owned stock can live.

Examples:

- Innate workshop
- timber rack
- steel rack
- finishing shelf
- supplier-held: Tubefab
- supplier-held: Westimber if needed
- in transit
- quarantine/needs inspection

### stock_lots

Specific batches/receipts of material.

Fields:

- stock_item_id
- received_date
- source_type: xero_bill, manual_opening, stocktake_adjustment, supplier_confirmation
- source_id / Xero bill id / line id
- supplier
- quantity_received
- remaining_quantity
- unit
- unit_cost_ex_gst
- landed_cost_ex_gst if available
- location
- quality/condition
- confidence

### stock_movements

Append-only ledger. Never just overwrite quantity.

Movement types:

- receipt_from_xero_bill
- reserve_for_job
- release_reservation
- consume_to_job
- stocktake_count
- stocktake_adjustment
- supplier_held_confirmation
- manual_adjustment
- wastage/damage
- return_to_supplier
- correction

Fields:

- stock_item_id
- lot_id nullable
- movement_type
- quantity_delta
- unit
- value_delta_ex_gst
- source_type
- source_id
- job/order/costing id
- actor/system
- approval_status
- notes
- created_at

### job_stock_reservations

Materials expected for an order/job based on costing sheets.

Fields:

- job/order id
- costing_sheet/version id
- stock_item_id
- required_quantity
- reserved_quantity
- consumed_quantity
- status: planned, reserved, partially_consumed, consumed, released, variance
- due/production date

### stocktake_sessions

Monthly reconciliation event.

Fields:

- month
- started_at/completed_at
- counted_by
- reviewed_by
- status: open, counting, variance_review, approved, posted_to_xero_pack
- total_system_value_before
- total_counted_value
- variance_value
- evidence links/export

### stocktake_counts

Count rows inside a session.

Fields:

- session_id
- stock_item_id
- location_id
- counted_quantity
- system_quantity
- variance_quantity
- variance_value
- reason_code
- resolution_status
- notes/photos

### stock_price_observations

Can reuse/extend existing costing_price_observations.

Sources:

- Xero bills
- Xero items
- supplier PDFs
- Gmail invoices
- manual approved price

This feeds current unit costs but never silently overwrites critical prices without review if the variance exceeds tolerance.

## Automation flows

### 1. Xero bill to stock receipt

Trigger/input:

- New/updated supplier bill in Xero.

Automation:

1. Pull bill lines.
2. Classify stock-relevant lines by account and description.
3. Match to stock_item by supplier, supplier code, description, dimensions, material keywords and prior mappings.
4. Extract quantity/unit/cost.
5. Create a proposed `receipt_from_xero_bill` movement.
6. If confidence high, auto-create/update stock lot.
7. If confidence medium/low, send to exception queue.
8. Update latest price observation.

Human effort:

- Only review unmapped/ambiguous lines and material price jumps.

### 2. Costing sheet / order to reservation

Trigger/input:

- Quote/order accepted or production job created.
- Costing sheet lines exist in Tuesday.

Automation:

1. Convert costing sheet lines into required stock items.
2. Reserve available stock by FIFO/preferred lot.
3. Flag shortages before production starts.
4. Show buy list for missing materials.
5. If production changes quantity, update reservation.

Human effort:

- Review shortage/alternative material decisions.

### 3. Production progress to stock consumption

Trigger/input:

- Job moves into production/cut/assembly/completed state.
- Costing sheet marks material as used, or production step confirms usage.

Automation:

1. Move reserved quantity to consumed.
2. Reduce stock lot remaining quantity.
3. Record WIP value against job.
4. If actual usage differs from costing sheet, create variance.

Human effort:

- Confirm only exceptions, wastage, substitutions or overruns.

### 4. Monthly physical stocktake

Trigger/input:

- Month-end stocktake session.

Automation:

1. Generate count sheets by location/category.
2. Pre-fill expected system quantity.
3. Let team enter counted quantity quickly.
4. Calculate variance.
5. Require reason for material variances.
6. Produce Tineke pack:
   - stock on hand value,
   - WIP value if used,
   - variance report,
   - supplier-held confirmations,
   - suggested journal summary.

Human effort:

- Count physical stock and resolve material variances.

### 5. Xero price update loop

Trigger/input:

- New Xero supplier bill or supplier invoice.

Automation:

1. Detect unit cost changes.
2. Update price observation.
3. If within tolerance, mark current price as fresh.
4. If outside tolerance, queue price review.
5. Push updated costs into future costing sheets and stock valuation.

Human effort:

- Approve significant price changes or mapping conflicts.

## Accuracy levels

### Phase 1 — trustworthy stock register

- Receipts in from Xero bills.
- Manual opening stock/import from current stocktake.
- Monthly stocktake sessions.
- Basic stock value and availability.

### Phase 2 — job allocation and WIP

- Costing sheets reserve material.
- Active orders show reserved/available/shortage.
- Consumption reduces stock.
- WIP material value appears by job.

### Phase 3 — automated purchasing/reorder intelligence

- Shortage list from upcoming production.
- Supplier reorder suggestions.
- Price-change alerts.
- Supplier-held stock confirmation workflow.

### Phase 4 — management accounting pack

- Month-end stock/WIP pack for Tineke.
- Xero journal support file.
- Gross margin by product/job type.
- Variance and wastage reporting.

## Safety and approval gates

Allowed without approval:

- Read Xero bills/items/contacts/reports.
- Read Tuesday/Supabase records.
- Generate proposed stock movements.
- Generate exception queues.
- Generate stocktake packs.
- Draft schemas/plans/reports.

Requires explicit approval:

- Applying Supabase schema changes.
- Importing/updating live Tuesday stock records.
- Writing to Xero.
- Sending emails/messages to Tineke/suppliers/customers.
- Changing Shopify/Monday/Xero data.
- Deleting or merging records.

## First implementation path

### Milestone 0 — current-state discovery

- Inspect existing Tuesday/Supabase tables and costings schema.
- Identify where accepted orders, production jobs and costing sheets currently live.
- Identify existing Xero bill import capabilities.

### Milestone 1 — schema draft

Create additive Supabase schema for:

- stock_items
- stock_locations
- stock_lots
- stock_movements
- job_stock_reservations
- stocktake_sessions
- stocktake_counts
- stock_mapping_rules
- stock_exceptions

### Milestone 2 — read-only Xero bill scanner

Build scanner that:

- pulls recent Xero bills,
- identifies stock-relevant bill lines,
- suggests stock item mappings,
- extracts quantity/unit/cost,
- outputs proposed stock receipts and exceptions.

No writes initially.

### Milestone 3 — Stock tab UI v1

Build internal Tuesday `/stock` tab showing:

- stock dashboard cards,
- items table,
- exceptions queue,
- recent receipts,
- stocktake session status.

Initially populated by test/staging data or read-only generated JSON until schema is approved.

### Milestone 4 — opening stock import

Use the next physical stocktake as the controlled opening balance.

Do not try to reconstruct perfect history backwards unless it directly improves current stock reliability.

### Milestone 5 — costing/order integration

Connect product_costing_lines and production orders to reservations/usage.

### Milestone 6 — month-end Tineke pack

Generate monthly:

- stock on hand value,
- WIP value,
- movement/variance report,
- suggested journal evidence pack.

## Design stance

Do not treat Tuesday Stock as a spreadsheet clone. Treat it as a stock ledger with automated evidence capture.

The UI should be simple, but the underlying system should be rigorous:

- append-only movements,
- source evidence,
- exception queue,
- monthly reconciliation,
- Xero price observations,
- job reservations,
- and auditability.

## Immediate next action

Create the additive Supabase schema draft and read-only Xero bill-to-stock scanner spec, then review before any live database change.
