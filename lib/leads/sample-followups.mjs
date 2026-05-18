const CLOSED_STATUSES = new Set(["won", "lost", "parked"]);
const FOLLOWED_UP_SAMPLE_STATUSES = new Set(["followed_up", "converted", "parked"]);
const DAY_MS = 86_400_000;

function dateKey(value) {
  return typeof value === "string" && value.trim() ? value.slice(0, 10) : undefined;
}

function parseDate(value) {
  const key = dateKey(value);
  if (!key) return undefined;
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function daysBetween(later, earlier) {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

function compactDate(value) {
  const date = parseDate(value);
  if (!date) return undefined;
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function sampleText(lead) {
  return [
    lead.sampleSpecies,
    lead.sampleStatus,
    lead.lastInteractionSummary,
    lead.nextAction,
    lead.notes,
    lead.productCategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function noteSuggestsSampleActivity(lead) {
  const text = sampleText(lead);
  if (!text.includes("sample")) return false;
  return /\b(sent|send|received|arrived|delivered|courier|posted|pack|rimu|totara|tōtara|beech)\b/i.test(text);
}

function hasFollowedUp(lead) {
  if (FOLLOWED_UP_SAMPLE_STATUSES.has(lead.sampleStatus)) return true;
  const text = sampleText(lead);
  return /\b(sample follow[- ]?up done|followed up on samples|sample followed up)\b/i.test(text);
}

export function isRecentSampleFollowUp(lead, now = new Date()) {
  if (CLOSED_STATUSES.has(lead.status)) return false;
  if (hasFollowedUp(lead)) return false;

  const delivered = parseDate(lead.sampleDeliveredAt);
  if (delivered && daysBetween(now, delivered) <= 21) return true;

  const sent = parseDate(lead.sampleSentAt);
  if (sent && daysBetween(now, sent) >= 3) return true;

  return noteSuggestsSampleActivity(lead);
}

function sampleUrgencyScore(lead, now) {
  const delivered = parseDate(lead.sampleDeliveredAt);
  if (delivered) return 0;
  const sent = parseDate(lead.sampleSentAt);
  if (sent && daysBetween(now, sent) >= 3) return 1;
  if (noteSuggestsSampleActivity(lead)) return 2;
  return 3;
}

function sampleActivityTime(lead) {
  return parseDate(lead.sampleDeliveredAt)?.getTime()
    ?? parseDate(lead.sampleSentAt)?.getTime()
    ?? parseDate(lead.lastInteractionAt)?.getTime()
    ?? parseDate(lead.updatedAt)?.getTime()
    ?? 0;
}

export function sortSampleFollowUps(leads, now = new Date()) {
  return [...leads].sort((a, b) => {
    const urgency = sampleUrgencyScore(a, now) - sampleUrgencyScore(b, now);
    if (urgency !== 0) return urgency;
    const value = (b.estimatedValue || 0) - (a.estimatedValue || 0);
    if (value !== 0) return value;
    return sampleActivityTime(b) - sampleActivityTime(a);
  });
}

export function sampleFollowUpLabel(lead) {
  const delivered = compactDate(lead.sampleDeliveredAt);
  const sent = compactDate(lead.sampleSentAt);
  const species = typeof lead.sampleSpecies === "string" && lead.sampleSpecies.trim() ? lead.sampleSpecies.trim() : undefined;
  const prefix = delivered ? `Delivered ${delivered}` : sent ? `Sent ${sent}` : "Sample activity";
  return [prefix, species].filter(Boolean).join(" · ");
}

export function sampleDraftPrompt(lead) {
  const name = lead.contactName || lead.customerName || "there";
  return `Hi ${name}, just checking the timber samples arrived safely.\n\nWas there a species or finish that felt like the right direction? If helpful, I can turn that into a rough size/price option from here.\n\nNgā mihi,\nGuido`;
}
