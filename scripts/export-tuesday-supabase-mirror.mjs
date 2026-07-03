import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    value = value.replace(/^['"]|['"]$/g, '');
    process.env[match[1]] = value;
  }
}

loadEnv('.env.local');
loadEnv('.env');

const outDir = process.argv[2] || 'reference/evidence/tuesday-supabase-mirror/latest';
fs.mkdirSync(outDir, { recursive: true });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase URL/key in environment.');
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const syncedAt = new Date().toISOString();

const preferredColumns = {
  leads: ['id','created_at','updated_at','customer_name','contact_name','email','phone','source','product_category','estimated_value','status','priority','owner','next_follow_up_at','last_interaction_at','last_interaction_summary','next_action','notes','source_url','source_system','monday_item_id','archived_at'],
  orders: ['id','order_code','customer_name','contact_name','email','phone','status','priority','owner','item_category','product_summary','spec','delivery','order_date','paid_on_date','due_date','finished_date','delivered_date','total_incl_gst','currency','xero_invoice_number','xero_invoice_id','xero_invoice_url','xero_quote_number','shopify_order_id','monday_order_item_id','monday_production_plan_item_id','source_system','source_url','next_action','next_follow_up_at','last_customer_touch_at','notes','created_at','updated_at','archived_at'],
  order_items: ['id','order_id','title','description','quantity','unit_amount','line_amount','spec','sort_order','created_at','updated_at'],
  order_events: ['id','order_id','event_type','actor','note','metadata','created_at'],
  order_links: ['id','order_id','link_type','external_id','label','url','metadata','created_at'],
  order_financial_documents: ['id','order_id','document_type','document_role','lifecycle_stage','sent_channel','customer_touch_event_id','xero_quote_number','xero_quote_id','xero_invoice_number','xero_invoice_id','xero_invoice_url','contact_name','contact_email','status','sent_at','issued_at','due_at','subtotal','tax','total','amount_paid','amount_due','currency','confidence','line_items','raw_xero','created_at','updated_at','archived_at'],
  order_payments: ['id','order_id','financial_document_id','source_system','external_transaction_id','payment_date','amount','currency','payer_name','bank_account_name','bank_reference','bank_particulars','bank_code','xero_invoice_number','match_status','match_confidence','match_reasons','created_at','updated_at','archived_at'],
  order_intake_reviews: ['id','order_id','review_state','source_summary','suggested_tasks','draft_tasks','approved_at','approved_by','last_reconciled_at','created_at','updated_at'],
  production_order_tasks: ['id','order_id','intake_review_id','source_task_id','title','detail','owner','scheduled_date','day_key','estimated_hours','sort_order','status','completed_at','completed_by','notes','created_at','updated_at'],
  order_customer_mirror: ['order_id','customer_known_summary','approved_paid_for_summary','lead_time_promise','current_customer_known_spec','source_message_id','source_thread_id','first_contact_at','timeline','quirks_issues','communication_style_tags','communication_style_summary','confidence','source_metadata','created_at','updated_at'],
  order_documents: ['id','order_id','document_kind','label','filename','content_type','byte_size','sha256','storage_bucket','storage_path','source_system','source_message_id','source_thread_id','source_attachment_ref','source_url','customer_visible','sent_to_customer_at','sort_order','source_metadata','created_at','updated_at'],
  sample_dispatches: ['id','dispatch_key','lead_id','order_id','customer_name','contact_name','email','phone','status','priority','sample_items','species','finish','quantity','requested_at','packed_at','photographed_at','sent_at','delivered_at','followed_up_at','follow_up_at','carrier','tracking_number','shipping_address_summary','photo_status','photo_drive_folder_url','photo_drive_file_urls','shopify_order_id','gmail_thread_id','gmail_message_id','source_system','confidence','next_action','notes','metadata','created_at','updated_at','archived_at'],
  sample_dispatch_events: ['id','sample_dispatch_id','event_type','actor','note','metadata','created_at'],
  sample_dispatch_links: ['id','sample_dispatch_id','link_type','external_id','label','url','metadata','created_at'],
  organisations: ['id','name','organisation_type','status','priority','website','phone','email','location','source_system','notes','metadata','created_at','updated_at','archived_at'],
  contacts: ['id','organisation_id','full_name','role_title','email','phone','relationship_type','status','priority','notes','metadata','created_at','updated_at','archived_at'],
  relationship_records: ['id','organisation_id','contact_id','record_type','title','record_date','summary','next_action','owner','priority','status','metadata','created_at','updated_at'],
  relationship_links: ['id','organisation_id','contact_id','relationship_record_id','link_type','label','url','external_id','metadata','created_at'],
  order_payment_lifecycle_v: ['order_id','primary_invoice_number','deposit_invoice_number','deposit_total','deposit_paid_at','deposit_amount_due','balance_invoice_number','balance_total','balance_due_at','balance_sent_at','balance_paid_at','balance_amount_due','balance_customer_touch_event_id','payment_stage','payment_stage_label','payment_next_action'],
};

const tableTabs = [
  ['RAW Leads', 'leads'],
  ['RAW Orders', 'orders'],
  ['RAW Order Items', 'order_items'],
  ['RAW Order Events', 'order_events'],
  ['RAW Order Links', 'order_links'],
  ['RAW Financial Documents', 'order_financial_documents'],
  ['RAW Payments', 'order_payments'],
  ['RAW Intake Reviews', 'order_intake_reviews'],
  ['RAW Production Tasks', 'production_order_tasks'],
  ['RAW Customer Mirror', 'order_customer_mirror'],
  ['RAW Order Documents', 'order_documents'],
  ['RAW Sample Dispatches', 'sample_dispatches'],
  ['RAW Sample Dispatch Events', 'sample_dispatch_events'],
  ['RAW Sample Dispatch Links', 'sample_dispatch_links'],
  ['RAW Organisations', 'organisations'],
  ['RAW Contacts', 'contacts'],
  ['RAW Relationship Records', 'relationship_records'],
  ['RAW Relationship Links', 'relationship_links'],
  ['VIEW Payment Lifecycle', 'order_payment_lifecycle_v'],
];

function safeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function unionColumns(rows, preferred = []) {
  const seen = new Set(preferred);
  const cols = [...preferred];
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) { seen.add(key); cols.push(key); }
    }
  }
  return cols;
}

async function fetchAll(table) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

const data = {};
const syncRows = [['Area','Supabase object','Last synced','Row count','Status','Problem']];
for (const [, table] of tableTabs) {
  try {
    const rows = await fetchAll(table);
    data[table] = rows;
    syncRows.push([table, `public.${table}`, syncedAt, rows.length, 'OK', '']);
  } catch (error) {
    data[table] = [];
    syncRows.push([table, `public.${table}`, syncedAt, 0, 'ERROR', error.message]);
  }
}

const tabs = [];
function addTab(name, headers, rows) {
  tabs.push({ name, values: [headers, ...rows.map(row => headers.map(h => safeCell(row[h])))] });
}
function addValuesTab(name, values) { tabs.push({ name, values }); }

addValuesTab('00 README', [
  ['Tuesday Supabase Mirror — Source Truth'],
  ['Generated at', syncedAt],
  ['Source of truth', 'Supabase'],
  ['Sheet role', 'Visual mirror and cleanup workbench'],
  ['Writeback mode', 'OFF — this export does not write to Supabase'],
  ['RAW tabs', 'Protected/read-only mirror tabs'],
  ['VIEW tabs', 'Human-readable derived tabs'],
  ['FIX tabs', 'Proposed cleanup only; not applied automatically'],
  ['Rule', 'Do not edit RAW tabs. If something looks wrong, add it to a FIX tab.'],
]);
addValuesTab('01 Sync Status', syncRows);
addValuesTab('02 Status Dictionary', [
  ['Domain','Allowed status','Meaning','Active?','Show in app?','Notes'],
  ['order.status','inbox','not yet processed','yes','yes',''],
  ['order.status','quoted','quote sent/not paid','yes','yes',''],
  ['order.status','awaiting_payment','waiting for payment','yes','yes',''],
  ['order.status','active','accepted/active order','yes','yes',''],
  ['order.status','in_production','in workshop','yes','yes',''],
  ['order.status','finished','made, not dispatched','yes','yes',''],
  ['order.status','awaiting_dispatch','waiting dispatch','yes','yes',''],
  ['order.status','booked','delivery/freight booked','yes','yes',''],
  ['order.status','delivered','delivered but not fully closed','maybe','yes',''],
  ['order.status','complete','closed','no','normally no',''],
  ['order.status','paused','paused/blocked','yes','yes',''],
  ['order.status','cancelled','cancelled','no','normally no',''],
  ['lead.status','new','new lead','yes','yes',''],
  ['lead.status','qualifying','being qualified','yes','yes',''],
  ['lead.status','quoted','quoted lead','yes','yes',''],
  ['lead.status','follow_up_due','follow-up due','yes','yes',''],
  ['lead.status','waiting_on_customer','waiting on customer','yes','yes',''],
  ['lead.status','won','converted/won','no','history',''],
  ['lead.status','lost','lost','no','history',''],
  ['lead.status','parked','parked','no','history',''],
  ['intake.review_state','awaiting_payment','not paid yet','yes','yes',''],
  ['intake.review_state','paid_needs_review','paid and needs intake review','yes','yes',''],
  ['intake.review_state','needs_review','needs human review','yes','yes',''],
  ['intake.review_state','approved','intake approved','yes','yes',''],
  ['production_task.status','planned','planned task','yes','yes',''],
  ['production_task.status','done','completed task','no','history',''],
  ['production_task.status','deleted','deleted task','no','normally no',''],
]);
addValuesTab('03 Table Map', [['Supabase object','Sheet tab','Mirror type','Editable?','Purpose'], ...tableTabs.map(([tab, table]) => [`public.${table}`, tab, table.endsWith('_v') ? 'read model/view' : 'raw table', 'no', 'Supabase mirror'])]);

for (const [tab, table] of tableTabs) {
  const headers = unionColumns(data[table] || [], preferredColumns[table] || []);
  addTab(tab, headers, data[table] || []);
}

const orders = data.orders || [];
const leads = data.leads || [];
const samples = data.sample_dispatches || [];
const tasks = data.production_order_tasks || [];
const reviews = data.order_intake_reviews || [];
const lifecycle = data.order_payment_lifecycle_v || [];
const financialDocs = data.order_financial_documents || [];
const customerMirror = data.order_customer_mirror || [];
const organisations = data.organisations || [];
const contacts = data.contacts || [];
const relationshipRecords = data.relationship_records || [];
const relationshipLinks = data.relationship_links || [];

const byOrder = new Map(orders.map(o => [o.id, o]));
const lifecycleByOrder = new Map(lifecycle.map(x => [x.order_id, x]));
const reviewByOrder = new Map(reviews.map(x => [x.order_id, x]));
const mirrorByOrder = new Map(customerMirror.map(x => [x.order_id, x]));
const taskByOrder = new Map();
for (const t of tasks) {
  if (!taskByOrder.has(t.order_id)) taskByOrder.set(t.order_id, []);
  taskByOrder.get(t.order_id).push(t);
}

function norm(s) { return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' '); }
function normEmail(s) { return norm(s).replace(/^mailto:/, ''); }
function normPhone(s) { return (s || '').toString().replace(/[^0-9+]/g, '').replace(/^0064/, '+64').replace(/^0([0-9])/, '+64$1'); }
function keyFor(row) { return norm(row.email || row.contact_email || row.customer_name || row.contact_name || row.display_name || 'unknown'); }

const customerMap = new Map();
function touchCustomer(row, source, id) {
  const k = keyFor(row);
  if (!customerMap.has(k)) customerMap.set(k, { customer_key:k, display_name: row.customer_name || row.contact_name || row.email || 'Unknown', contact_names:new Set(), emails:new Set(), phones:new Set(), open_orders_count:0, completed_orders_count:0, open_leads_count:0, sample_dispatch_count:0, latest_order_date:'', latest_lead_update:'', source_systems:new Set(), primary_supabase_ids:[] });
  const c=customerMap.get(k);
  if (row.customer_name && c.display_name === 'Unknown') c.display_name=row.customer_name;
  if (row.contact_name) c.contact_names.add(row.contact_name);
  if (row.email) c.emails.add(row.email);
  if (row.phone) c.phones.add(row.phone);
  if (row.source_system) c.source_systems.add(row.source_system);
  c.source_systems.add(source);
  c.primary_supabase_ids.push(`${source}:${id}`);
}
for (const o of orders) { touchCustomer(o,'orders',o.id); const c=customerMap.get(keyFor(o)); if (['complete','cancelled'].includes(o.status)) c.completed_orders_count++; else c.open_orders_count++; if (o.order_date && (!c.latest_order_date || o.order_date > c.latest_order_date)) c.latest_order_date=o.order_date; }
for (const l of leads) { touchCustomer(l,'leads',l.id); const c=customerMap.get(keyFor(l)); if (!['won','lost','parked'].includes(l.status)) c.open_leads_count++; if (l.updated_at && (!c.latest_lead_update || l.updated_at > c.latest_lead_update)) c.latest_lead_update=l.updated_at; }
for (const s of samples) { touchCustomer(s,'samples',s.id); const c=customerMap.get(keyFor(s)); c.sample_dispatch_count++; }
const customerRows = [...customerMap.values()].map(c => ({
  customer_key:c.customer_key, display_name:c.display_name, contact_names:[...c.contact_names].join(' | '), emails:[...c.emails].join(' | '), phones:[...c.phones].join(' | '), open_orders_count:c.open_orders_count, completed_orders_count:c.completed_orders_count, open_leads_count:c.open_leads_count, sample_dispatch_count:c.sample_dispatch_count, latest_order_date:c.latest_order_date, latest_lead_update:c.latest_lead_update, source_systems:[...c.source_systems].join(' | '), has_duplicate_risk:'', needs_review:'', review_reason:'', primary_supabase_ids:c.primary_supabase_ids.join(' | '), last_synced_at:syncedAt,
})).sort((a,b)=>a.display_name.localeCompare(b.display_name));
addTab('VIEW Customers', ['customer_key','display_name','contact_names','emails','phones','open_orders_count','completed_orders_count','open_leads_count','sample_dispatch_count','latest_order_date','latest_lead_update','source_systems','has_duplicate_risk','needs_review','review_reason','primary_supabase_ids','last_synced_at'], customerRows);

const identitySourceRows = [];
function addIdentitySourceRows(rows, sourceType) {
  for (const row of rows || []) {
    const name = row.customer_name || row.contact_name || '';
    const contact = row.contact_name || '';
    const email = row.email || row.contact_email || '';
    const phone = row.phone || '';
    if (!name && !contact && !email && !phone) continue;
    identitySourceRows.push({
      source_type: sourceType,
      source_id: row.id,
      source_code: row.order_code || row.dispatch_key || row.xero_invoice_number || row.monday_item_id || '',
      customer_name: name,
      contact_name: contact,
      email,
      phone,
      status: row.status || '',
      updated_at: row.updated_at || row.created_at || '',
      name_key: norm(name),
      contact_key: norm(contact),
      email_key: normEmail(email),
      phone_key: normPhone(phone),
    });
  }
}
addIdentitySourceRows(orders, 'order');
addIdentitySourceRows(leads, 'lead');
addIdentitySourceRows(samples, 'sample_dispatch');

function sourceSummary(rows) {
  return rows.map(r => `${r.source_type}:${r.source_id}${r.source_code ? ` (${r.source_code})` : ''}`).join(' | ');
}
function uniqueJoined(rows, field) {
  return [...new Set(rows.map(r => r[field]).filter(Boolean))].join(' | ');
}
function allowedRelationshipContext(rows) {
  const blob = norm(rows.map(r => `${r.customer_name} ${r.contact_name} ${r.email}`).join(' | '));
  const allowed = [];
  if (/breanna|wilbert|wilber|mascull/.test(blob)) allowed.push('couple/household: Breanna and Wilbert Mascull can be one customer with separate contact details');
  if (/adams|matiu/.test(blob)) allowed.push('person + building company: Matiu and Adams Building can represent one customer relationship');
  if (/janette|michael sharp|sharp/.test(blob)) allowed.push('couple/household: Janette and Michael Sharp can be one customer with separate contact details');
  if (/\bmpi\b|ministry for primary industries/.test(blob)) allowed.push('organisation: MPI needs organisation-level details plus contacts');
  if (/aitken/.test(blob)) allowed.push('organisation/family/company context: Aitkens need shared party plus contacts, not deletion');
  return allowed.join(' | ');
}

const duplicateGroups = [];
function addDuplicateGroups(kind, keyField, labelField) {
  const byKey = new Map();
  for (const row of identitySourceRows) {
    const key = row[keyField];
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  for (const [key, rows] of byKey.entries()) {
    const sourceTypes = new Set(rows.map(r => r.source_type));
    if (rows.length < 2 || sourceTypes.size < 1) continue;
    const relationshipContext = allowedRelationshipContext(rows);
    const distinctNames = new Set(rows.map(r => norm(r.customer_name)).filter(Boolean));
    const distinctContacts = new Set(rows.map(r => norm(r.contact_name)).filter(Boolean));
    const distinctEmails = new Set(rows.map(r => normEmail(r.email)).filter(Boolean));
    const category = relationshipContext
      ? 'relationship_model_needed'
      : (kind === 'same_email' && distinctNames.size <= 1 ? 'probable_duplicate_records' : kind === 'same_name' && distinctEmails.size > 1 ? 'possible_multi_contact_customer' : 'needs_human_review');
    const recommendedAction = relationshipContext
      ? 'Do not delete/flatten. Model as one customer/party with organisation/household plus multiple contacts/emails.'
      : category === 'probable_duplicate_records'
        ? 'Safe cleanup candidate: same email/name across source records. Preserve all history, standardise missing fields, then link records to one customer identity.'
        : 'Review before any write: may be real household/company contact structure or may be duplicate source rows.';
    duplicateGroups.push({
      group_key: `${kind}:${key}`,
      match_type: kind,
      matched_value: key,
      category,
      relationship_context: relationshipContext,
      source_count: rows.length,
      source_types: [...sourceTypes].sort().join(' | '),
      customer_names: uniqueJoined(rows, 'customer_name'),
      contact_names: uniqueJoined(rows, 'contact_name'),
      emails: uniqueJoined(rows, 'email'),
      phones: uniqueJoined(rows, 'phone'),
      source_records: sourceSummary(rows),
      recommended_action: recommendedAction,
      needs_supabase_schema_change: relationshipContext ? 'yes — customer/party/contact structure' : 'maybe',
      safe_to_auto_fix: relationshipContext ? 'no' : (category === 'probable_duplicate_records' ? 'only field standardisation; no deletes' : 'no'),
      last_synced_at: syncedAt,
    });
  }
}
addDuplicateGroups('same_email', 'email_key', 'email');
addDuplicateGroups('same_phone', 'phone_key', 'phone');
addDuplicateGroups('same_name', 'name_key', 'customer_name');
const seenDuplicateKeys = new Set();
const duplicateRows = duplicateGroups
  .filter(row => {
    const sourceSetKey = `${row.match_type}:${row.matched_value}:${row.source_records}`;
    if (seenDuplicateKeys.has(sourceSetKey)) return false;
    seenDuplicateKeys.add(sourceSetKey);
    return true;
  })
  .sort((a,b) => `${a.category} ${a.customer_names}`.localeCompare(`${b.category} ${b.customer_names}`));
addTab('VIEW Customer Duplicates', ['group_key','match_type','matched_value','category','relationship_context','source_count','source_types','customer_names','contact_names','emails','phones','source_records','recommended_action','needs_supabase_schema_change','safe_to_auto_fix','last_synced_at'], duplicateRows);

const contactsByOrg = new Map();
for (const c of contacts) {
  if (!c.organisation_id) continue;
  if (!contactsByOrg.has(c.organisation_id)) contactsByOrg.set(c.organisation_id, []);
  contactsByOrg.get(c.organisation_id).push(c);
}
const recordsByOrg = new Map();
for (const r of relationshipRecords) {
  if (!r.organisation_id) continue;
  if (!recordsByOrg.has(r.organisation_id)) recordsByOrg.set(r.organisation_id, []);
  recordsByOrg.get(r.organisation_id).push(r);
}
const linksByOrg = new Map();
for (const l of relationshipLinks) {
  if (!l.organisation_id) continue;
  if (!linksByOrg.has(l.organisation_id)) linksByOrg.set(l.organisation_id, []);
  linksByOrg.get(l.organisation_id).push(l);
}
const relationshipRows = organisations
  .filter(o => o.archived_at == null)
  .map(o => {
    const orgContacts = contactsByOrg.get(o.id) || [];
    const orgRecords = recordsByOrg.get(o.id) || [];
    const orgLinks = linksByOrg.get(o.id) || [];
    const backfillRecord = orgRecords.find(r => String(r.title || '').startsWith('Customer relationship model:')) || orgRecords[0] || {};
    return {
      organisation_id: o.id,
      relationship_name: o.name,
      relationship_type: o.organisation_type,
      status: o.status,
      priority: o.priority,
      contact_count: orgContacts.length,
      contacts: orgContacts.map(c => c.full_name).filter(Boolean).join(' | '),
      emails: orgContacts.map(c => c.email).filter(Boolean).join(' | ') || o.email || '',
      phones: orgContacts.map(c => c.phone).filter(Boolean).join(' | ') || o.phone || '',
      relationship_summary: backfillRecord.summary || o.notes || '',
      next_action: backfillRecord.next_action || '',
      linked_source_rows: orgLinks.filter(l => l.link_type === 'supabase_record').map(l => l.external_id).join(' | '),
      source_link_count: orgLinks.length,
      model_key: (o.metadata || {}).relationship_model_key || '',
      last_updated: o.updated_at || '',
    };
  })
  .sort((a,b) => `${a.relationship_type} ${a.relationship_name}`.localeCompare(`${b.relationship_type} ${b.relationship_name}`));
addTab('VIEW Customer Relationships', ['organisation_id','relationship_name','relationship_type','status','priority','contact_count','contacts','emails','phones','relationship_summary','next_action','linked_source_rows','source_link_count','model_key','last_updated'], relationshipRows);

const viewOrders = orders.map(o => {
  const lt = lifecycleByOrder.get(o.id) || {};
  const rv = reviewByOrder.get(o.id) || {};
  const ts = taskByOrder.get(o.id) || [];
  const open = ts.filter(t => t.status === 'planned');
  const nextDate = open.map(t=>t.scheduled_date).filter(Boolean).sort()[0] || '';
  const reasons=[];
  if (!o.due_date && !['complete','cancelled'].includes(o.status)) reasons.push('missing_due_date');
  if (o.status === 'complete' && open.length) reasons.push('complete_with_open_tasks');
  if ((lt.payment_stage || '').includes('paid') && rv.review_state === 'awaiting_payment') reasons.push('payment_review_mismatch');
  return { order_id:o.id, order_code:o.order_code, invoice_number:o.xero_invoice_number || lt.primary_invoice_number || '', customer_name:o.customer_name, status:o.status, priority:o.priority, owner:o.owner, product_summary:o.product_summary, order_date:o.order_date, paid_on_date:o.paid_on_date, due_date:o.due_date, payment_stage:lt.payment_stage, payment_stage_label:lt.payment_stage_label, intake_review_state:rv.review_state, production_task_count:ts.length, open_task_count:open.length, next_scheduled_date:nextDate, next_action:o.next_action || lt.payment_next_action || '', source_system:o.source_system, xero_invoice_url:o.xero_invoice_url, monday_order_item_id:o.monday_order_item_id, monday_production_plan_item_id:o.monday_production_plan_item_id, needs_review:reasons.length ? 'yes' : 'no', review_reason:reasons.join(' | '), last_updated:o.updated_at };
});
addTab('VIEW Orders', ['order_id','order_code','invoice_number','customer_name','status','priority','owner','product_summary','order_date','paid_on_date','due_date','payment_stage','payment_stage_label','intake_review_state','production_task_count','open_task_count','next_scheduled_date','next_action','source_system','xero_invoice_url','monday_order_item_id','monday_production_plan_item_id','needs_review','review_reason','last_updated'], viewOrders);

const statusRows = viewOrders.map(o => ({ order_id:o.order_id, invoice_number:o.invoice_number, customer_name:o.customer_name, order_status:o.status, payment_stage:o.payment_stage, payment_amount_due:(lifecycleByOrder.get(o.order_id)||{}).deposit_amount_due || (lifecycleByOrder.get(o.order_id)||{}).balance_amount_due || '', intake_review_state:o.intake_review_state, production_status_summary:`${o.open_task_count} open / ${Number(o.production_task_count)-Number(o.open_task_count)} done`, open_tasks:o.open_task_count, done_tasks:Number(o.production_task_count)-Number(o.open_task_count), due_date:o.due_date, finished_date:(byOrder.get(o.order_id)||{}).finished_date, delivered_date:(byOrder.get(o.order_id)||{}).delivered_date, status_conflict:o.needs_review, conflict_reason:o.review_reason, recommended_cleanup:o.review_reason ? 'Review source and propose fix in FIX Proposed Fixes' : '' }));
addTab('VIEW Order Statuses', ['order_id','invoice_number','customer_name','order_status','payment_stage','payment_amount_due','intake_review_state','production_status_summary','open_tasks','done_tasks','due_date','finished_date','delivered_date','status_conflict','conflict_reason','recommended_cleanup'], statusRows);

const prodRows = tasks.map(t => { const o=byOrder.get(t.order_id)||{}; const lt=lifecycleByOrder.get(t.order_id)||{}; const attention=[]; if (o.status === 'complete' && t.status === 'planned') attention.push('task_planned_for_complete_order'); if (!o.due_date) attention.push('order_missing_due_date'); return { scheduled_date:t.scheduled_date, day_key:t.day_key, owner:t.owner, task_status:t.status, task_title:t.title, task_detail:t.detail, estimated_hours:t.estimated_hours, customer_name:o.customer_name, invoice_number:o.xero_invoice_number, order_status:o.status, due_date:o.due_date, payment_stage_label:lt.payment_stage_label, source_task_id:t.source_task_id, notes:t.notes, needs_attention:attention.length?'yes':'no', attention_reason:attention.join(' | ') }; }).sort((a,b)=>(a.scheduled_date||'').localeCompare(b.scheduled_date||'') || (a.owner||'').localeCompare(b.owner||''));
addTab('VIEW Production Today', ['scheduled_date','day_key','owner','task_status','task_title','task_detail','estimated_hours','customer_name','invoice_number','order_status','due_date','payment_stage_label','source_task_id','notes','needs_attention','attention_reason'], prodRows);

const leadRows = leads.map(l => ({ lead_id:l.id, customer_name:l.customer_name, contact_name:l.contact_name, email:l.email, phone:l.phone, product_category:l.product_category, estimated_value:l.estimated_value, status:l.status, priority:l.priority, owner:l.owner, next_follow_up_at:l.next_follow_up_at, last_interaction_at:l.last_interaction_at, last_interaction_summary:l.last_interaction_summary, next_action:l.next_action, source:l.source, source_url:l.source_url, monday_item_id:l.monday_item_id, needs_review:(!l.next_action && !['won','lost','parked'].includes(l.status))?'yes':'no', review_reason:(!l.next_action && !['won','lost','parked'].includes(l.status))?'missing_next_action':'' }));
addTab('VIEW Leads', ['lead_id','customer_name','contact_name','email','phone','product_category','estimated_value','status','priority','owner','next_follow_up_at','last_interaction_at','last_interaction_summary','next_action','source','source_url','monday_item_id','needs_review','review_reason'], leadRows);

const sampleRows = samples.map(s => ({ dispatch_id:s.id, customer_name:s.customer_name, contact_name:s.contact_name, email:s.email, status:s.status, priority:s.priority, species:s.species, finish:s.finish, requested_at:s.requested_at, sent_at:s.sent_at, delivered_at:s.delivered_at, follow_up_at:s.follow_up_at, carrier:s.carrier, tracking_number:s.tracking_number, photo_status:s.photo_status, source_system:s.source_system, confidence:s.confidence, next_action:s.next_action, linked_lead_id:s.lead_id, linked_order_id:s.order_id, needs_review:(!s.follow_up_at && ['sent','delivered'].includes(s.status))?'yes':'no', review_reason:(!s.follow_up_at && ['sent','delivered'].includes(s.status))?'sample_sent_or_delivered_without_follow_up_date':'' }));
addTab('VIEW Samples', ['dispatch_id','customer_name','contact_name','email','status','priority','species','finish','requested_at','sent_at','delivered_at','follow_up_at','carrier','tracking_number','photo_status','source_system','confidence','next_action','linked_lead_id','linked_order_id','needs_review','review_reason'], sampleRows);

const reviewRows = [];
let reviewIndex = 1;
for (const o of viewOrders) if (o.needs_review === 'yes') reviewRows.push({ review_id:`R-${reviewIndex++}`, severity:o.review_reason.includes('complete_with_open_tasks')||o.review_reason.includes('payment_review_mismatch')?'red':'amber', area:'order', object_type:'order', object_id:o.order_id, display_name:`${o.customer_name} ${o.invoice_number||''}`.trim(), problem:o.review_reason, evidence:`status=${o.status}; payment_stage=${o.payment_stage}; intake=${o.intake_review_state}; open_tasks=${o.open_task_count}; due=${o.due_date}`, suggested_fix:'Check source, then add proposed correction in FIX Proposed Fixes', source_tabs:'VIEW Orders | RAW Orders | RAW Intake Reviews | RAW Payments', assigned_to:'Hermes/Guido', decision_needed:'yes', status:'open', last_seen_at:syncedAt });
for (const l of leadRows) if (l.needs_review === 'yes') reviewRows.push({ review_id:`R-${reviewIndex++}`, severity:'amber', area:'lead', object_type:'lead', object_id:l.lead_id, display_name:l.customer_name, problem:l.review_reason, evidence:`status=${l.status}; priority=${l.priority}; next_action=${l.next_action}`, suggested_fix:'Add/source-check next action', source_tabs:'VIEW Leads | RAW Leads', assigned_to:'Hermes/Guido', decision_needed:'yes', status:'open', last_seen_at:syncedAt });
for (const s of sampleRows) if (s.needs_review === 'yes') reviewRows.push({ review_id:`R-${reviewIndex++}`, severity:'amber', area:'sample', object_type:'sample_dispatch', object_id:s.dispatch_id, display_name:s.customer_name, problem:s.review_reason, evidence:`status=${s.status}; sent=${s.sent_at}; delivered=${s.delivered_at}; follow_up=${s.follow_up_at}`, suggested_fix:'Set/source-check sample follow-up date', source_tabs:'VIEW Samples | RAW Sample Dispatches', assigned_to:'Hermes/Guido', decision_needed:'yes', status:'open', last_seen_at:syncedAt });
addTab('VIEW Needs Review', ['review_id','severity','area','object_type','object_id','display_name','problem','evidence','suggested_fix','source_tabs','assigned_to','decision_needed','status','last_seen_at'], reviewRows);

const areas = [
  ['Customers', customerRows.length, customerRows.filter(r=>r.needs_review==='yes').length],
  ['Orders', viewOrders.length, viewOrders.filter(r=>r.needs_review==='yes').length],
  ['Payments', data.order_payments.length, data.order_payments.filter(r=>r.match_status==='unmatched').length],
  ['Production tasks', prodRows.length, prodRows.filter(r=>r.needs_attention==='yes').length],
  ['Leads', leadRows.length, leadRows.filter(r=>r.needs_review==='yes').length],
  ['Samples', sampleRows.length, sampleRows.filter(r=>r.needs_review==='yes').length],
];
addValuesTab('VIEW Source Health', [['Area','Row count','Clean','Needs review','Critical','Last sync','Notes'], ...areas.map(([area,total,review]) => [area,total,Number(total)-Number(review),review,review? 'see Needs Review':'0',syncedAt,''])]);

addValuesTab('FIX Proposed Fixes', [['fix_id','object_type','object_id','field','current_value','proposed_value','reason','source_evidence','requested_by','approval_status','approved_by','applied_to_supabase_at','readback_status']]);
addValuesTab('FIX Proposed Customer Fixes', [['fix_id','customer_key','current_value','proposed_value','field','reason','source_evidence','requested_by','approved_by','approval_status','applied_to_supabase_at','readback_status']]);
addValuesTab('FIX Proposed Order Fixes', [['fix_id','order_id','invoice_number','customer_name','field','current_value','proposed_value','reason','source_evidence','risk_if_wrong','approval_status','approved_by','applied_at','readback_status']]);
addValuesTab('FIX Status Questions', [['question_id','object_type','object_id','customer_name','current_status','possible_status','question','source_evidence','Guido_answer','resolved_status','resolution_notes']]);
addValuesTab('FIX Duplicate Candidates', [['candidate_id','duplicate_type','record_a_type','record_a_id','record_a_name','record_b_type','record_b_id','record_b_name','match_reason','confidence','recommended_action','Guido_decision']]);
addValuesTab('FIX Approved Supabase Updates', [['update_id','target_table','target_id','target_field','old_value','new_value','source_evidence','approved_by','approved_at','applied_at','readback_value','result','error']]);
addValuesTab('AUDIT Sync Log', [['synced_at','supabase_url_host','tables_exported','rows_exported','mode'], [syncedAt, new URL(supabaseUrl).host, tableTabs.length, tableTabs.reduce((n,[,t]) => n + (data[t]?.length || 0), 0), 'read-only Supabase export']]);
addValuesTab('AUDIT Change Log', [['changed_at','actor','change','notes'], [syncedAt,'Hermes Tuesday','Created read-only mirror export','No Supabase writes; no app changes; no deploy']]);

const workbook = { title: `Tuesday Supabase Mirror — Source Truth — ${syncedAt.slice(0,10)}`, syncedAt, tabs };
fs.writeFileSync(path.join(outDir, 'workbook.json'), JSON.stringify(workbook, null, 2));
for (const tab of tabs) {
  const file = path.join(outDir, `${tab.name.replace(/[^A-Za-z0-9_-]+/g,'_')}.csv`);
  fs.writeFileSync(file, tab.values.map(row => row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n'));
}
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ syncedAt, tabs: tabs.map(t => ({ name:t.name, rows: Math.max(0,t.values.length-1), columns: t.values[0]?.length || 0 })), sourceRows: Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])) }, null, 2));
console.log(JSON.stringify({ ok:true, outDir, syncedAt, tabs:tabs.length, rows:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])) }, null, 2));
