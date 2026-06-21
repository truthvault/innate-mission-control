export type QuotePolicyApprovalStatus = "draft" | "needs_review" | "approved" | "archived";

export type QuoteCategoryPolicy = {
  categoryKey: string;
  categoryName: string;
  productArea: "residential" | "commercial" | "benchtop_panel" | "outdoor" | "other";
  sortOrder: number;
  approvalStatus: QuotePolicyApprovalStatus;
  confidence: "low" | "medium" | "high";
  suggestedTargetGrossMarginPercent: number;
  pricingFormula: string;
  costStack: string[];
  requiredInputs: string[];
  freshSourceRequirements: string[];
  blockerRules: string[];
  customerRules: string[];
  approvalQuestions: string[];
  websiteMigrationStatus: string;
  xeroPolicy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
};

const COMMON_BLOCKERS = [
  "Missing material, machining, finishing, or freight cost blocks ready-to-quote.",
  "A stale required supplier price blocks ready-to-quote.",
  "Customer-visible wording must not expose internal cost, gross profit, or margin logic.",
];

const COMMON_CUSTOMER_RULES = [
  "Show customer prices clearly as ex GST or incl GST, matching the context.",
  "Use approved payment wording: Payment confirms the order and secures the workshop slot.",
  "Use approved lead-time wording: Lead time is confirmed after acceptance and supplier/workshop scheduling.",
];

export const QUOTE_CATEGORY_POLICIES: QuoteCategoryPolicy[] = [
  {
    categoryKey: "steel_framed_dining_tables",
    categoryName: "Steel framed dining tables",
    productArea: "residential",
    sortOrder: 10,
    approvalStatus: "draft",
    confidence: "medium",
    suggestedTargetGrossMarginPercent: 50,
    pricingFormula: "Sell ex GST = verified total cost ex GST / (1 - 0.50), then add GST where customer context requires it.",
    costStack: [
      "Timber top material or panel calculator base cost",
      "Steel base/frame fabrication and powder coat or finish",
      "Workshop labour: prep, sanding, coating, assembly, QC",
      "Hardware, packaging, freight or local delivery",
      "Risk/buffer only where dimensions, access, freight, or first-run process justify it",
    ],
    requiredInputs: ["length", "width", "timber/species", "base style", "steel finish", "delivery location", "benches/chairs if included"],
    freshSourceRequirements: ["Timber/panel source within 30 days unless it is a stable approved calculator reference", "Steel/powder/fabrication source within 60 days", "Freight source within 30 days for non-local delivery"],
    blockerRules: [...COMMON_BLOCKERS, "Unknown base fabrication or powder-coat cost blocks ready-to-quote for custom bases."],
    customerRules: [...COMMON_CUSTOMER_RULES, "Do not imply chairs or benches are included unless explicitly scoped."],
    approvalQuestions: ["Is 50% gross margin still right for standard dining tables?", "Which base styles have stable approved steel/powder costs?", "Which dimensions can use website/configurator pricing without fresh review?"],
    websiteMigrationStatus: "Website/configurator remains read-only reference in V1; no public price migration yet.",
    xeroPolicy: "One customer-facing line is acceptable for standard tables; keep internal cost lines in Supabase only.",
  },
  {
    categoryKey: "timber_framed_dining_tables",
    categoryName: "Timber framed dining tables",
    productArea: "residential",
    sortOrder: 20,
    approvalStatus: "draft",
    confidence: "low",
    suggestedTargetGrossMarginPercent: 50,
    pricingFormula: "Sell ex GST = verified total cost ex GST / (1 - 0.50), with extra review for complex timber bases.",
    costStack: ["Tabletop timber/panel cost", "Timber base material", "Joinery/CNC/machining", "Workshop labour and finishing", "Hardware, packaging, freight or delivery", "Complexity buffer for first-time or awkward base builds"],
    requiredInputs: ["length", "width", "species", "base design", "finish", "delivery location", "site/access constraints"],
    freshSourceRequirements: ["Timber source within 30 days", "Machining/joinery source within 30 days", "Freight source within 30 days for non-local delivery"],
    blockerRules: [...COMMON_BLOCKERS, "Uncosted timber-base joinery, CNC, or awkward assembly blocks ready-to-quote."],
    customerRules: [...COMMON_CUSTOMER_RULES, "Keep craft/design explanation short; do not over-explain workshop difficulty."],
    approvalQuestions: ["Which timber-base designs are standard enough to pre-approve?", "What labour bands should apply to simple vs complex timber bases?"],
    websiteMigrationStatus: "No public migration in V1. Use website examples as visual/spec references only unless reconciled.",
    xeroPolicy: "Use customer-safe product line plus optional delivery line if delivery is separately approved.",
  },
  {
    categoryKey: "benchtops_panels",
    categoryName: "Benchtops and timber panels",
    productArea: "benchtop_panel",
    sortOrder: 30,
    approvalStatus: "draft",
    confidence: "medium",
    suggestedTargetGrossMarginPercent: 50,
    pricingFormula: "Sell ex GST = verified total cost ex GST / (1 - 0.50). Calculator output can seed cost only when inputs and semantics are recorded.",
    costStack: ["Timber/panel material", "Machining/CNC/cutouts/edge details", "Finishing or supplied raw/sanded/oiled state", "Supplier pickup/dropoff or workshop handling", "Packaging and freight", "Installer coordination only if explicitly scoped"],
    requiredInputs: ["finished dimensions", "thickness", "species", "finish state", "cutouts", "edge details", "delivery/pickup", "installer responsibility"],
    freshSourceRequirements: ["Supplier material price within 30 days", "CNC/machining source within 30 days", "Freight within 30 days", "Historical calculator outputs must be labelled historical/comparison unless refreshed"],
    blockerRules: [...COMMON_BLOCKERS, "Unknown cutouts, machining, or freight blocks ready-to-quote.", "Westimber whole-job pickup/dropoff rule prevents double-counted transport."],
    customerRules: [...COMMON_CUSTOMER_RULES, "Say Innate makes and delivers panels; do not imply install unless specifically included."],
    approvalQuestions: ["Which calculator fields are cost vs margin vs sell semantics?", "Which standard panel sizes/species can become approved price bands?"],
    websiteMigrationStatus: "Current panel calculator remains an evidence source, not the public source of truth for V1.",
    xeroPolicy: "Use one panel line with dimensions/spec and separate freight only when needed. Xero dry-run only until approved.",
  },
  {
    categoryKey: "boardroom_tables",
    categoryName: "Boardroom and meeting tables",
    productArea: "commercial",
    sortOrder: 40,
    approvalStatus: "draft",
    confidence: "low",
    suggestedTargetGrossMarginPercent: 50,
    pricingFormula: "Sell ex GST = verified total cost ex GST / (1 - target margin), but commercial complexity can require explicit project buffer approval.",
    costStack: ["Large tabletop material", "Base/frame", "Power/data/cable integration", "Drawings/design/admin", "Finishing, assembly, QC", "Freight/install/access", "Commercial project buffer"],
    requiredInputs: ["seating count", "dimensions", "site/access", "power/data needs", "finish", "delivery/install location", "decision deadline"],
    freshSourceRequirements: ["Material, base, power/data, and install/freight sources within 30 days", "Any subcontractor quote must be current and linked"],
    blockerRules: [...COMMON_BLOCKERS, "Unknown power/data, site access, or install scope blocks ready-to-quote."],
    customerRules: [...COMMON_CUSTOMER_RULES, "Keep proposal wording professional and scope-specific; do not hide exclusions."],
    approvalQuestions: ["Should boardroom tables carry a higher target margin or fixed project buffer?", "When do we require paid drawings or a design deposit?"],
    websiteMigrationStatus: "No public price migration in V1. Boardroom pricing stays internal and quote-led.",
    xeroPolicy: "Prefer scoped lines for table, power/data, freight/install where they need separate approval.",
  },
  {
    categoryKey: "outdoor_tables",
    categoryName: "Outdoor tables",
    productArea: "outdoor",
    sortOrder: 50,
    approvalStatus: "draft",
    confidence: "medium",
    suggestedTargetGrossMarginPercent: 50,
    pricingFormula: "Sell ex GST = verified total cost ex GST / (1 - 0.50), with exposure/material suitability checked before price is called ready.",
    costStack: ["Top material: timber, porcelain, or approved outdoor surface", "Frame/base material and finish", "Outdoor finish/coating and care requirements", "Workshop labour and assembly", "Freight/packaging/local delivery", "Exposure/suitability buffer only when justified"],
    requiredInputs: ["indoor/outdoor exposure", "coastal/wind/sun/rain context", "top material", "base/frame finish", "size", "delivery location", "hospitality vs residential use"],
    freshSourceRequirements: ["Porcelain/outdoor material source within 30 days", "Frame/finish source within 60 days", "Freight within 30 days"],
    blockerRules: [...COMMON_BLOCKERS, "Unknown exposure or material suitability blocks ready-to-quote if it affects warranty/care expectations."],
    customerRules: [...COMMON_CUSTOMER_RULES, "Be honest that outdoor timber is not maintenance-free; avoid overpromising."],
    approvalQuestions: ["Which outdoor materials are approved for exposed vs sheltered use?", "Should hospitality outdoor tables carry a different margin or warranty buffer?"],
    websiteMigrationStatus: "Use website outdoor pages as wording/spec reference only in V1.",
    xeroPolicy: "Use product line plus optional freight/install. Keep care/warranty caveats customer-safe.",
  },
  {
    categoryKey: "commercial_hospitality_fitouts",
    categoryName: "Commercial and hospitality fit-outs",
    productArea: "commercial",
    sortOrder: 60,
    approvalStatus: "draft",
    confidence: "low",
    suggestedTargetGrossMarginPercent: 50,
    pricingFormula: "Quote as project scenarios: total verified cost ex GST plus target gross margin, then review volume/complexity before approval.",
    costStack: ["Repeat product material cost", "Batch labour and finish", "Commercial durability requirements", "Freight/install/staging", "Design/admin/project management", "Prototype or first-article allowance if needed"],
    requiredInputs: ["quantity", "spec pack", "site", "timeline", "durability needs", "delivery/install split", "decision process"],
    freshSourceRequirements: ["All supplier/subcontractor inputs within 30 days unless contract pricing exists", "Volume discount evidence must be linked"],
    blockerRules: [...COMMON_BLOCKERS, "Unknown quantity/spec/timeline blocks ready-to-quote."],
    customerRules: [...COMMON_CUSTOMER_RULES, "Separate options clearly; do not blur prototype, batch, delivery, and install costs."],
    approvalQuestions: ["When should project management/admin be explicit?", "What volume discount logic is safe to approve?"],
    websiteMigrationStatus: "No public price migration in V1. Use quote-led internal scenarios.",
    xeroPolicy: "Use structured lines when it helps approval: product batch, freight/install, extras, exclusions.",
  },
  {
    categoryKey: "custom_one_off",
    categoryName: "Custom one-off work",
    productArea: "other",
    sortOrder: 70,
    approvalStatus: "draft",
    confidence: "low",
    suggestedTargetGrossMarginPercent: 50,
    pricingFormula: "No memory pricing. Build a fresh scenario from source costs, labour, risk, and explicit exclusions before presenting any number.",
    costStack: ["Material/source cost", "Machining/outsource", "Workshop labour", "Design/drawing/admin", "Finish", "Freight/install/access", "Risk/rework buffer"],
    requiredInputs: ["customer goal", "rough drawings/photos", "dimensions", "materials", "finish", "delivery/install", "must-have deadline", "what is excluded"],
    freshSourceRequirements: ["Every meaningful cost line needs a current source or an explicit Guido override", "Historical examples can guide sanity only; they are not quote-ready prices"],
    blockerRules: [...COMMON_BLOCKERS, "If the scope cannot be described clearly, it is not ready to quote."],
    customerRules: [...COMMON_CUSTOMER_RULES, "Keep the reply warm and clear; ask for missing specs instead of inventing a price."],
    approvalQuestions: ["Should custom one-offs require a minimum gross profit dollar amount?", "When do we charge design/drawing time upfront?"],
    websiteMigrationStatus: "Not for public migration. This stays internal and approval-led.",
    xeroPolicy: "Dry-run only. Use careful descriptions and exclusions; no automatic customer-visible action.",
  },
];

export function quotePolicyByKey(categoryKey: string) {
  return QUOTE_CATEGORY_POLICIES.find((policy) => policy.categoryKey === categoryKey) || null;
}
