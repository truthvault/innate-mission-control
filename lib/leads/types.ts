export type LeadStatus =
  | "new"
  | "qualifying"
  | "quoted"
  | "follow_up_due"
  | "waiting_on_customer"
  | "won"
  | "lost"
  | "parked";

export type LeadPriority = "hot" | "normal" | "low";
export type SampleStatus = "requested" | "packed" | "sent" | "delivered" | "followed_up" | "converted" | "parked";

export type Lead = {
  id: string;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
  productCategory?: string;
  estimatedValue?: number;
  status: LeadStatus;
  priority: LeadPriority;
  owner?: string;
  nextFollowUpAt?: string;
  lastInteractionAt?: string;
  lastInteractionSummary?: string;
  nextAction?: string;
  notes?: string;
  sourceUrl?: string;
  sourceSystem: string;
  mondayItemId?: string;
  sampleSentAt?: string;
  sampleDeliveredAt?: string;
  sampleSpecies?: string;
  sampleStatus?: SampleStatus;
  sampleTrackingUrl?: string;
  sampleNextAction?: string;
};

export type LeadsResult = {
  rows: Lead[];
  syncedAt: string;
  source: "supabase" | "none";
  error?: string;
};
