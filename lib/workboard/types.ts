export type WorkArea = "leads" | "website" | "marketing" | "commercial" | "customer_journey" | "production" | "materials" | "systems" | "admin";
export type WorkPriority = "cash" | "high" | "normal" | "later";
export type WorkTaskStatus = "inbox" | "next" | "in_progress" | "waiting" | "done" | "parked" | "cancelled";
export type WorkProjectStatus = "active" | "waiting" | "parked" | "done" | "cancelled";
export type WorkSourceType = "meeting" | "voice_note" | "email_thread" | "manual_note" | "import" | "other";

export type WorkSource = {
  id: string;
  sourceType: WorkSourceType;
  title: string;
  sourceDate?: string;
  people: string[];
  summary?: string;
  filePath?: string;
  transcriptPath?: string;
  externalUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkProject = {
  id: string;
  name: string;
  area: WorkArea;
  status: WorkProjectStatus;
  priority: WorkPriority;
  owner?: string;
  description?: string;
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type WorkTask = {
  id: string;
  projectId?: string;
  sourceId?: string;
  title: string;
  description?: string;
  area: WorkArea;
  status: WorkTaskStatus;
  priority: WorkPriority;
  owner?: string;
  dueDate?: string;
  relatedLeadId?: string;
  relatedOrderId?: string;
  relatedUrl?: string;
  notes?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type WorkboardResult = {
  sources: WorkSource[];
  projects: WorkProject[];
  tasks: WorkTask[];
  syncedAt: string;
  source: "supabase" | "none";
  error?: string;
};
