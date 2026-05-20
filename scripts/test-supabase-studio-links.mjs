import assert from "node:assert/strict";
import { buildSupabaseLeadStudioUrl, projectRefFromSupabaseUrl } from "../lib/leads/supabase-studio.mjs";

assert.equal(projectRefFromSupabaseUrl("https://abcxyz.supabase.co"), "abcxyz");
assert.equal(projectRefFromSupabaseUrl("https://abcxyz.supabase.co/"), "abcxyz");
assert.equal(projectRefFromSupabaseUrl("not a url"), undefined);

const url = buildSupabaseLeadStudioUrl({ projectRef: "abcxyz", leadId: "lead-123" });
assert.equal(url.origin, "https://supabase.com");
assert.equal(url.pathname, "/dashboard/project/abcxyz/sql/new");
assert.equal(url.searchParams.get("skip"), "true");
assert.equal(url.searchParams.get("content"), "select *\nfrom public.leads\nwhere id = 'lead-123'\nlimit 1;");

const escaped = buildSupabaseLeadStudioUrl({ projectRef: "abcxyz", leadId: "lead'123" });
assert.equal(escaped.searchParams.get("content"), "select *\nfrom public.leads\nwhere id = 'lead''123'\nlimit 1;");

assert.equal(buildSupabaseLeadStudioUrl({ projectRef: "", leadId: "lead-123" }), undefined);
assert.equal(buildSupabaseLeadStudioUrl({ projectRef: "abcxyz", leadId: "" }), undefined);

console.log("supabase studio link tests OK");
