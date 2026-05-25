export function projectRefFromSupabaseUrl(value) {
  if (!value || typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    const suffix = ".supabase.co";
    if (!url.hostname.endsWith(suffix)) return undefined;
    const ref = url.hostname.slice(0, -suffix.length);
    return ref || undefined;
  } catch {
    return undefined;
  }
}

function sqlStringLiteral(value) {
  return String(value).replaceAll("'", "''");
}

export function buildSupabaseLeadStudioUrl({ projectRef, leadId }) {
  if (!projectRef || !leadId) return undefined;
  const url = new URL(`https://supabase.com/dashboard/project/${encodeURIComponent(projectRef)}/sql/new`);
  url.searchParams.set("skip", "true");
  url.searchParams.set("content", `select *\nfrom public.leads\nwhere id = '${sqlStringLiteral(leadId)}'\nlimit 1;`);
  return url;
}
