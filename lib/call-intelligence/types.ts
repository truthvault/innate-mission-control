export type SourceCapture = {
  id: string;
  sourceKey: string;
  sourceType: string;
  sourceDate?: string;
  title: string;
  summary?: string;
  transcriptPath?: string;
  audioPath?: string;
  sourceUrl?: string;
  capturedBy: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type NuggetType = "contact" | "action" | "research" | "knowledge" | "opportunity" | "waiting" | "update";

export type ExtractedNugget = {
  id: string;
  sourceCaptureId: string;
  nuggetType: NuggetType;
  title: string;
  detail?: string;
  personOrOrg?: string;
  priority: "urgent" | "high" | "normal" | "low";
  status: "captured" | "triaged" | "converted_to_action" | "waiting" | "done" | "parked" | "archived";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ActionItem = {
  id: string;
  sourceCaptureId?: string;
  sourceNuggetId?: string;
  title: string;
  detail?: string;
  actionType: "task" | "waiting" | "research" | "follow_up" | "decision" | "other";
  owner: string;
  bucket: "today" | "this_week" | "waiting" | "research" | "explore" | "later";
  status: "open" | "in_progress" | "waiting" | "done" | "parked" | "archived";
  dueDate?: string;
  priority: "urgent" | "high" | "normal" | "low";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CallIntelligenceResult = {
  captures: SourceCapture[];
  nuggets: ExtractedNugget[];
  actions: ActionItem[];
  syncedAt: string;
  source: "supabase" | "none";
  error?: string;
};
