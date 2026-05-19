const CLOSED_STATUSES = new Set(["won", "lost", "parked"]);

export const SORT_OPTIONS = [
  ["priority", "Priority"],
  ["follow_up_asc", "Follow-up ↑"],
  ["follow_up_desc", "Follow-up ↓"],
  ["value_desc", "Value ↓"],
  ["value_asc", "Value ↑"],
  ["updated_desc", "Recently updated"],
  ["name_asc", "Name A-Z"],
];

export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function addDaysKey(days, fromKey = todayKey()) {
  const date = new Date(`${fromKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateKey(value) {
  return value ? value.slice(0, 10) : undefined;
}

export function isClosed(lead) {
  return CLOSED_STATUSES.has(lead.status);
}

export function isDue(lead, today = todayKey()) {
  const followUp = dateKey(lead.nextFollowUpAt);
  return Boolean(followUp && followUp <= today && !isClosed(lead));
}

export function isDueThisWeek(lead, today = todayKey()) {
  const followUp = dateKey(lead.nextFollowUpAt);
  return Boolean(followUp && followUp <= addDaysKey(7, today) && !isClosed(lead));
}

export function needsNextStep(lead) {
  return !isClosed(lead) && (!lead.nextAction || lead.nextAction === "No Action" || !dateKey(lead.nextFollowUpAt));
}

export function isHighValue(lead) {
  return (lead.estimatedValue || 0) >= 10_000;
}

export function hasLiveQuoteValue(lead) {
  return !isClosed(lead) && (lead.estimatedValue || 0) > 0;
}

export function isCashflowQuote(lead) {
  return !isClosed(lead) && lead.status === "quoted";
}

export function doToday(lead, today = todayKey()) {
  if (isClosed(lead)) return false;
  if (isDue(lead, today)) return true;
  if (lead.status === "follow_up_due") return true;
  if (lead.priority === "hot" && isDueThisWeek(lead, today)) return true;
  if (isCashflowQuote(lead) && (isHighValue(lead) || isDueThisWeek(lead, today))) return true;
  if (needsNextStep(lead) && isDueThisWeek(lead, today)) return true;
  if (needsNextStep(lead) && (lead.priority === "hot" || isCashflowQuote(lead) || isHighValue(lead))) return true;
  return false;
}

function followUpSortValue(lead, empty = "9999-12-31") {
  return dateKey(lead.nextFollowUpAt) || empty;
}

export function sortByUrgency(a, b) {
  const dueA = isDue(a) ? 0 : 1;
  const dueB = isDue(b) ? 0 : 1;
  if (dueA !== dueB) return dueA - dueB;
  const hotA = a.priority === "hot" ? 0 : 1;
  const hotB = b.priority === "hot" ? 0 : 1;
  if (hotA !== hotB) return hotA - hotB;
  const quoteA = isCashflowQuote(a) && isHighValue(a) ? 0 : 1;
  const quoteB = isCashflowQuote(b) && isHighValue(b) ? 0 : 1;
  if (quoteA !== quoteB) return quoteA - quoteB;
  const noStepA = needsNextStep(a) && isDueThisWeek(a) ? 0 : 1;
  const noStepB = needsNextStep(b) && isDueThisWeek(b) ? 0 : 1;
  if (noStepA !== noStepB) return noStepA - noStepB;
  const followA = followUpSortValue(a);
  const followB = followUpSortValue(b);
  if (followA !== followB) return followA.localeCompare(followB);
  return (b.estimatedValue || 0) - (a.estimatedValue || 0) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
}

export function sortByCashflow(a, b) {
  const dueA = isDue(a) ? 0 : 1;
  const dueB = isDue(b) ? 0 : 1;
  if (dueA !== dueB) return dueA - dueB;
  return (b.estimatedValue || 0) - (a.estimatedValue || 0) || sortByUrgency(a, b);
}

export function sortLeads(leads, sortMode = "priority") {
  const rows = [...leads];
  if (sortMode === "follow_up_asc") return rows.sort((a, b) => followUpSortValue(a).localeCompare(followUpSortValue(b)) || sortByUrgency(a, b));
  if (sortMode === "follow_up_desc") return rows.sort((a, b) => followUpSortValue(b, "0000-00-00").localeCompare(followUpSortValue(a, "0000-00-00")) || sortByUrgency(a, b));
  if (sortMode === "value_desc") return rows.sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0) || sortByUrgency(a, b));
  if (sortMode === "value_asc") return rows.sort((a, b) => (a.estimatedValue || 0) - (b.estimatedValue || 0) || sortByUrgency(a, b));
  if (sortMode === "updated_desc") return rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || sortByUrgency(a, b));
  if (sortMode === "name_asc") return rows.sort((a, b) => String(a.customerName || "").localeCompare(String(b.customerName || "")) || sortByUrgency(a, b));
  return rows.sort(sortByUrgency);
}
