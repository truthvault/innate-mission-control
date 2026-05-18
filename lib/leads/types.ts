export type LeadStatusBucket =
  | "active"
  | "hot"
  | "followUp"
  | "waiting"
  | "won"
  | "lost"
  | "parked";

export type LeadRecord = {
  id: string;
  name: string;
  contact: string;
  source: string;
  product: string;
  estimatedValue: number | null;
  status: string;
  bucket: LeadStatusBucket;
  owner: string;
  nextFollowUp: string;
  lastInteraction: string;
  notes: string;
  mondayUrl: string;
  raw: Record<string, unknown>;
};

export type LeadsResult = {
  leads: LeadRecord[];
  source: "supabase" | "none";
  syncedAt: string;
  error?: string;
  table?: string;
  missingEnv?: string[];
};
