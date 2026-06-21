import "server-only";

export type OrderDocumentKind = "xero_invoice_pdf" | "customer_attachment" | "drawing" | "screenshot" | "other";

export type OrderDocument = {
  id: string;
  orderId: string;
  kind: OrderDocumentKind;
  label: string;
  filename: string;
  contentType: string | null;
  byteSize: number | null;
  sha256: string | null;
  sourceSystem: string;
  sourceMessageId: string | null;
  sourceThreadId: string | null;
  customerVisible: boolean;
  sentToCustomerAt: string | null;
  openUrl: string;
};

export type OrderCustomerMirrorTimelineEntry = {
  date: string | null;
  title: string;
  detail: string;
  source: string;
  confidence?: "low" | "medium" | "high";
};

export type OrderCustomerMirror = {
  orderId: string;
  customerKnownSummary: string;
  approvedPaidForSummary: string | null;
  leadTimePromise: string | null;
  currentCustomerKnownSpec: string | null;
  sourceMessageId: string | null;
  sourceThreadId: string | null;
  firstContactAt: string | null;
  timeline: OrderCustomerMirrorTimelineEntry[];
  quirksIssues: string[];
  communicationStyleTags: string[];
  communicationStyleSummary: string | null;
  confidence: "low" | "medium" | "high";
  sourceMetadata: Record<string, unknown>;
  updatedAt: string | null;
};

export type OrderCustomerMirrorBundle = {
  mirror: OrderCustomerMirror | null;
  documents: OrderDocument[];
  disabledReason?: string;
};

type SupabaseConfig = { url: string; serviceKey: string; bucket: string };

type MirrorRow = {
  order_id: string;
  customer_known_summary: string | null;
  approved_paid_for_summary: string | null;
  lead_time_promise: string | null;
  current_customer_known_spec: string | null;
  source_message_id: string | null;
  source_thread_id: string | null;
  first_contact_at: string | null;
  timeline: unknown;
  quirks_issues: unknown;
  communication_style_tags: unknown;
  communication_style_summary: string | null;
  confidence: string | null;
  source_metadata: unknown;
  updated_at: string | null;
};

type DocumentRow = {
  id: string;
  order_id: string;
  document_kind: string | null;
  label: string | null;
  filename: string | null;
  content_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  source_system: string | null;
  source_message_id: string | null;
  source_thread_id: string | null;
  customer_visible: boolean | null;
  sent_to_customer_at: string | null;
  sort_order: number | null;
};

function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const bucket = process.env.ORDER_DOCUMENTS_BUCKET || "order-documents";
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey, bucket };
}

function quote(value: string | number) {
  return encodeURIComponent(String(value));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asTimeline(value: unknown): OrderCustomerMirrorTimelineEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const detail = typeof record.detail === "string" ? record.detail.trim() : "";
    const source = typeof record.source === "string" ? record.source.trim() : "";
    if (!title || !detail || !source) return [];
    const confidence = record.confidence === "low" || record.confidence === "medium" || record.confidence === "high" ? record.confidence : undefined;
    return [{
      date: typeof record.date === "string" && record.date.trim() ? record.date.trim() : null,
      title,
      detail,
      source,
      confidence,
    }];
  });
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeConfidence(value: string | null | undefined): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeDocumentKind(value: string | null | undefined): OrderDocumentKind {
  if (value === "xero_invoice_pdf" || value === "customer_attachment" || value === "drawing" || value === "screenshot" || value === "other") return value;
  return "other";
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase env is not configured for order customer mirror.");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase customer mirror request failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) as T : null as T;
}

async function resolveOrderId(args: { orderId?: string | null; mondayOrderId?: string | number | null; invoiceNumber?: string | null }) {
  if (args.orderId && /^[0-9a-f-]{36}$/i.test(args.orderId)) return args.orderId;
  const filters = [
    args.invoiceNumber ? `xero_invoice_number.eq.${quote(args.invoiceNumber)}` : "",
    args.mondayOrderId ? `monday_order_item_id.eq.${quote(args.mondayOrderId)}` : "",
  ].filter(Boolean);
  if (filters.length === 0) return null;
  const rows = await supabaseRequest<Array<{ id: string }>>(`orders?select=id&or=(${filters.join(",")})&limit=1`);
  return rows[0]?.id ?? null;
}

function mapMirror(row: MirrorRow): OrderCustomerMirror {
  return {
    orderId: row.order_id,
    customerKnownSummary: row.customer_known_summary || "",
    approvedPaidForSummary: row.approved_paid_for_summary,
    leadTimePromise: row.lead_time_promise,
    currentCustomerKnownSpec: row.current_customer_known_spec,
    sourceMessageId: row.source_message_id,
    sourceThreadId: row.source_thread_id,
    firstContactAt: row.first_contact_at,
    timeline: asTimeline(row.timeline),
    quirksIssues: asStringArray(row.quirks_issues),
    communicationStyleTags: asStringArray(row.communication_style_tags),
    communicationStyleSummary: row.communication_style_summary,
    confidence: normalizeConfidence(row.confidence),
    sourceMetadata: asMetadata(row.source_metadata),
    updatedAt: row.updated_at,
  };
}

function documentOpenUrl(id: string) {
  return `/api/production/order-documents/${encodeURIComponent(id)}/open`;
}

function mapDocument(row: DocumentRow): OrderDocument {
  return {
    id: row.id,
    orderId: row.order_id,
    kind: normalizeDocumentKind(row.document_kind),
    label: row.label || row.filename || "Document",
    filename: row.filename || "document",
    contentType: row.content_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    sourceSystem: row.source_system || "unknown",
    sourceMessageId: row.source_message_id,
    sourceThreadId: row.source_thread_id,
    customerVisible: row.customer_visible !== false,
    sentToCustomerAt: row.sent_to_customer_at,
    openUrl: documentOpenUrl(row.id),
  };
}

export async function getOrderCustomerMirrorBundle(args: {
  orderId?: string | null;
  mondayOrderId?: string | number | null;
  invoiceNumber?: string | null;
}): Promise<OrderCustomerMirrorBundle> {
  if (!supabaseConfig()) return { mirror: null, documents: [], disabledReason: "Supabase customer mirror storage is not connected yet." };
  const orderId = await resolveOrderId(args);
  if (!orderId) return { mirror: null, documents: [], disabledReason: "No Supabase order record is linked to this Tuesday order yet." };

  const [mirrorRows, documentRows] = await Promise.all([
    supabaseRequest<MirrorRow[]>(`order_customer_mirror?select=*&order_id=eq.${quote(orderId)}&limit=1`),
    supabaseRequest<DocumentRow[]>(`order_documents?select=*&order_id=eq.${quote(orderId)}&order=sort_order.asc,created_at.asc`),
  ]);

  return {
    mirror: mirrorRows[0] ? mapMirror(mirrorRows[0]) : null,
    documents: documentRows.map(mapDocument),
  };
}

export async function upsertOrderCustomerMirror(mirror: OrderCustomerMirror) {
  if (!supabaseConfig()) throw new Error("Supabase customer mirror storage is not connected yet.");
  const rows = await supabaseRequest<MirrorRow[]>("order_customer_mirror?on_conflict=order_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      order_id: mirror.orderId,
      customer_known_summary: mirror.customerKnownSummary,
      approved_paid_for_summary: mirror.approvedPaidForSummary,
      lead_time_promise: mirror.leadTimePromise,
      current_customer_known_spec: mirror.currentCustomerKnownSpec,
      source_message_id: mirror.sourceMessageId,
      source_thread_id: mirror.sourceThreadId,
      first_contact_at: mirror.firstContactAt,
      timeline: mirror.timeline,
      quirks_issues: mirror.quirksIssues,
      communication_style_tags: mirror.communicationStyleTags,
      communication_style_summary: mirror.communicationStyleSummary,
      confidence: mirror.confidence,
      source_metadata: mirror.sourceMetadata,
    }),
  });
  return rows[0] ? mapMirror(rows[0]) : mirror;
}

export async function signedOrderDocumentUrl(documentId: string) {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase document storage is not connected yet.");
  const rows = await supabaseRequest<DocumentRow[]>(`order_documents?select=id,storage_bucket,storage_path,filename,content_type&id=eq.${quote(documentId)}&limit=1`);
  const document = rows[0];
  if (!document?.storage_path) return null;
  const bucket = document.storage_bucket || config.bucket;
  const response = await fetch(`${config.url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${document.storage_path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 300 }),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase signed URL failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  const data = text ? JSON.parse(text) as { signedURL?: string } : {};
  if (!data.signedURL) return null;
  return {
    url: data.signedURL.startsWith("http") ? data.signedURL : `${config.url}/storage/v1${data.signedURL}`,
    filename: document.filename || "document",
    contentType: document.content_type || "application/octet-stream",
  };
}
