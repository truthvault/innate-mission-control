export function leadSearchText(lead) {
  return [
    lead.customerName,
    lead.contactName,
    lead.email,
    lead.phone,
    lead.source,
    lead.sourceSystem,
    lead.productCategory,
    lead.status,
    lead.priority,
    lead.owner,
    lead.estimatedValue === undefined || lead.estimatedValue === null ? undefined : String(lead.estimatedValue),
    lead.nextAction,
    lead.nextFollowUpAt,
    lead.lastInteractionAt,
    lead.lastInteractionSummary,
    lead.updatedAt,
    lead.notes,
    lead.mondayItemId,
    lead.sampleSentAt,
    lead.sampleDeliveredAt,
    lead.sampleSpecies,
    lead.sampleStatus,
    lead.sampleTrackingUrl,
    lead.sampleNextAction,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesLeadSearch(lead, search) {
  const needle = String(search || "").trim().toLowerCase();
  if (!needle) return true;
  return leadSearchText(lead).includes(needle);
}
