export type TuesdayActionClass =
  | "read_only"
  | "draft"
  | "internal_write"
  | "external_write"
  | "customer_visible"
  | "financial_or_legal";

export type TuesdayPanelKey =
  | "overview"
  | "queue"
  | "detail"
  | "decision"
  | "sourceEvidence";

export type TuesdaySectionStatus = "live" | "planned" | "disabled";

export type TuesdaySectionKey =
  | "dashboard"
  | "inbox"
  | "leads"
  | "quoting"
  | "orders"
  | "production"
  | "freight"
  | "stock"
  | "suppliers"
  | "admin";

export type TuesdaySectionDefinition = {
  key: TuesdaySectionKey;
  label: string;
  shortLabel?: string;
  purpose: string;
  status: TuesdaySectionStatus;
  href?: string;
  primaryObjects: string[];
  canonicalTables: string[];
  externalSources: string[];
  allowedActions: TuesdayActionClass[];
  protectedActions: TuesdayActionClass[];
  requiredPanels: TuesdayPanelKey[];
  defaultSort?: string;
  owners: string[];
  blockerTypes: string[];
  approvalRules: string[];
  auditEvents: string[];
  realtimeEvents: string[];
};

const standardPanels: TuesdayPanelKey[] = [
  "overview",
  "queue",
  "detail",
  "decision",
  "sourceEvidence",
];

export const tuesdaySections: TuesdaySectionDefinition[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    purpose: "Give operators the live business pulse across Tuesday sections.",
    status: "live",
    href: "/today",
    primaryObjects: ["business_pulse", "decision_queue", "sync_health"],
    canonicalTables: ["tuesday_events", "decision_queue_items"],
    externalSources: ["supabase", "monday", "gmail", "xero", "shopify"],
    allowedActions: ["read_only", "draft"],
    protectedActions: ["external_write", "customer_visible", "financial_or_legal"],
    requiredPanels: ["overview", "queue", "sourceEvidence"],
    owners: ["Guido", "Hermes"],
    blockerTypes: ["stale_sync", "untriaged_blocker", "missing_owner"],
    approvalRules: ["Dashboard actions stay read-only or draft until delegated to a section."],
    auditEvents: ["dashboard_viewed", "decision_queue_reviewed"],
    realtimeEvents: ["business_pulse_changed", "decision_queue_changed"],
  },
  {
    key: "inbox",
    label: "Inbox",
    purpose: "Capture and triage incoming work before it becomes a lead, order, quote, or task.",
    status: "planned",
    primaryObjects: ["inbox_item", "source_message", "triage_decision"],
    canonicalTables: ["inbox_items", "inbox_audit_events"],
    externalSources: ["gmail", "shopify", "phone_notes", "forms"],
    allowedActions: ["read_only", "draft", "internal_write"],
    protectedActions: ["external_write", "customer_visible", "financial_or_legal"],
    requiredPanels: standardPanels,
    owners: ["Hermes", "Guido"],
    blockerTypes: ["unknown_source", "duplicate_candidate", "missing_customer_identity"],
    approvalRules: ["External replies require explicit owner approval."],
    auditEvents: ["inbox_item_created", "inbox_item_triaged", "inbox_item_merged"],
    realtimeEvents: ["inbox_item_created", "inbox_blocker_changed"],
  },
  {
    key: "leads",
    label: "Leads",
    purpose: "Track source-backed sales opportunities and safe follow-up drafts.",
    status: "live",
    href: "/leads",
    primaryObjects: ["lead", "lead_activity", "sample_followup"],
    canonicalTables: ["leads", "lead_events"],
    externalSources: ["supabase", "gmail", "shopify", "website_forms"],
    allowedActions: ["read_only", "draft", "internal_write"],
    protectedActions: ["external_write", "customer_visible"],
    requiredPanels: standardPanels,
    defaultSort: "priority desc, updated_at desc",
    owners: ["Hermes", "Guido"],
    blockerTypes: ["needs_customer_reply", "missing_contact", "stale_followup"],
    approvalRules: ["Customer-visible follow-up copy requires approval before sending."],
    auditEvents: ["lead_created", "lead_triaged", "followup_drafted"],
    realtimeEvents: ["lead_created", "lead_status_changed"],
  },
  {
    key: "quoting",
    label: "Quoting",
    purpose: "Create source-backed internal quote drafts and approval-ready pricing policies.",
    status: "planned",
    primaryObjects: ["quote_request", "quote_scenario", "quote_cost_line"],
    canonicalTables: ["quote_requests", "quote_scenarios", "quote_cost_lines", "quote_audit_events"],
    externalSources: ["gmail", "shopify", "legacy_calculator", "supplier_price", "freight_api"],
    allowedActions: ["read_only", "draft", "internal_write"],
    protectedActions: ["customer_visible", "financial_or_legal", "external_write"],
    requiredPanels: standardPanels,
    defaultSort: "blocked desc, updated_at desc",
    owners: ["Guido", "Hermes"],
    blockerTypes: ["missing_source_price", "stale_source_price", "missing_delivery_destination", "margin_below_policy", "unapproved_policy"],
    approvalRules: ["Customer-visible quote requires Guido approval", "Xero draft creation requires explicit approval"],
    auditEvents: ["quote_draft_created", "quote_policy_approved", "quote_blocked", "quote_ready_for_review"],
    realtimeEvents: ["quote_request_created", "quote_blocker_changed", "quote_approval_requested"],
  },
  {
    key: "orders",
    label: "Orders",
    purpose: "Review confirmed work and hand it safely into planning, production, and dispatch.",
    status: "live",
    href: "/production",
    primaryObjects: ["order", "customer", "order_note"],
    canonicalTables: ["orders", "order_events"],
    externalSources: ["monday", "xero", "shopify", "supabase"],
    allowedActions: ["read_only", "draft"],
    protectedActions: ["external_write", "customer_visible", "financial_or_legal"],
    requiredPanels: standardPanels,
    defaultSort: "due_date asc, updated_at desc",
    owners: ["Guido", "Nick", "Hermes"],
    blockerTypes: ["missing_invoice_state", "missing_customer_expectation", "unlinked_plan_task"],
    approvalRules: ["Customer commitment changes require owner approval."],
    auditEvents: ["order_reviewed", "order_blocked", "order_handoff_ready"],
    realtimeEvents: ["order_changed", "order_blocker_changed"],
  },
  {
    key: "production",
    label: "Production",
    purpose: "Coordinate workshop work without changing existing Production Plan behaviour.",
    status: "live",
    href: "/production/plan",
    primaryObjects: ["plan_task", "workshop_order", "sample_stock_item"],
    canonicalTables: ["production_plan_tasks", "production_plan_links"],
    externalSources: ["monday", "supabase"],
    allowedActions: ["read_only", "draft", "internal_write"],
    protectedActions: ["external_write", "customer_visible", "financial_or_legal"],
    requiredPanels: ["overview", "queue", "detail", "sourceEvidence"],
    defaultSort: "week asc, priority desc",
    owners: ["Nick", "Guido", "Hermes"],
    blockerTypes: ["missing_material", "needs_workshop_decision", "stale_monday_sync", "unlinked_order"],
    approvalRules: ["External customer timing updates require approval outside the plan."],
    auditEvents: ["plan_task_reviewed", "plan_task_linked", "production_blocker_changed"],
    realtimeEvents: ["plan_task_changed", "production_blocker_changed"],
  },
  {
    key: "freight",
    label: "Freight",
    purpose: "Estimate and reconcile freight safely before any booking or customer commitment.",
    status: "live",
    href: "/freight-quotes",
    primaryObjects: ["freight_quote", "delivery_address", "freight_package"],
    canonicalTables: ["freight_quote_logs", "orders"],
    externalSources: ["mainfreight", "shopify", "monday"],
    allowedActions: ["read_only", "draft"],
    protectedActions: ["external_write", "customer_visible", "financial_or_legal"],
    requiredPanels: standardPanels,
    owners: ["Hermes", "Guido"],
    blockerTypes: ["missing_address", "oversize_item", "carrier_rate_unavailable"],
    approvalRules: ["Freight booking and customer-visible freight commitments require explicit approval."],
    auditEvents: ["freight_quote_checked", "freight_blocked", "freight_ready_for_review"],
    realtimeEvents: ["freight_quote_created", "freight_blocker_changed"],
  },
  {
    key: "stock",
    label: "Stock / Materials",
    shortLabel: "Stock",
    purpose: "Track material availability, samples, and source freshness for workshop decisions.",
    status: "live",
    href: "/production/samples",
    primaryObjects: ["material", "sample", "stocktake_item"],
    canonicalTables: ["materials", "sample_stock", "stocktake_events"],
    externalSources: ["monday", "supplier_notes", "supabase"],
    allowedActions: ["read_only", "draft", "internal_write"],
    protectedActions: ["external_write", "financial_or_legal"],
    requiredPanels: standardPanels,
    owners: ["Nick", "Hermes"],
    blockerTypes: ["unknown_stock_level", "supplier_confirmation_needed", "sample_missing"],
    approvalRules: ["Supplier purchase commitments require approval."],
    auditEvents: ["stocktake_item_checked", "material_blocked"],
    realtimeEvents: ["stock_item_changed", "material_blocker_changed"],
  },
  {
    key: "suppliers",
    label: "Suppliers / Relationships",
    shortLabel: "Suppliers",
    purpose: "Keep supplier and relationship context source-backed before outreach or commitments.",
    status: "planned",
    primaryObjects: ["supplier", "relationship", "outreach_note"],
    canonicalTables: ["suppliers", "relationships", "relationship_events"],
    externalSources: ["gmail", "phone_notes", "supplier_documents"],
    allowedActions: ["read_only", "draft", "internal_write"],
    protectedActions: ["external_write", "customer_visible", "financial_or_legal"],
    requiredPanels: standardPanels,
    owners: ["Guido", "Hermes"],
    blockerTypes: ["missing_contact_context", "unverified_claim", "needs_owner_decision"],
    approvalRules: ["External supplier outreach requires owner approval."],
    auditEvents: ["relationship_note_created", "supplier_blocker_changed"],
    realtimeEvents: ["relationship_changed", "supplier_blocker_changed"],
  },
  {
    key: "admin",
    label: "Admin / Audit",
    shortLabel: "Admin",
    purpose: "Inspect permissions, protected actions, audit events, and source health.",
    status: "planned",
    primaryObjects: ["audit_event", "approval", "integration_health"],
    canonicalTables: ["audit_events", "approval_requests", "integration_health"],
    externalSources: ["supabase", "vercel", "monday", "xero", "shopify"],
    allowedActions: ["read_only"],
    protectedActions: ["internal_write", "external_write", "customer_visible", "financial_or_legal"],
    requiredPanels: ["overview", "queue", "detail", "sourceEvidence"],
    owners: ["Guido", "Admin"],
    blockerTypes: ["missing_audit_event", "integration_unhealthy", "permission_gap"],
    approvalRules: ["Permission and protected-action changes require explicit owner approval."],
    auditEvents: ["audit_log_reviewed", "approval_rule_reviewed"],
    realtimeEvents: ["integration_health_changed", "approval_requested"],
  },
];

export const tuesdaySectionByKey = Object.fromEntries(
  tuesdaySections.map((section) => [section.key, section]),
) as Record<TuesdaySectionKey, TuesdaySectionDefinition>;

export const tuesdayNavigationSections = tuesdaySections;

export function getTuesdaySection(key: TuesdaySectionKey): TuesdaySectionDefinition {
  return tuesdaySectionByKey[key];
}
