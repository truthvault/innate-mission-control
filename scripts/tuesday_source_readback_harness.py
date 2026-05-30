#!/usr/bin/env python3
"""Read-only Tuesday/Supabase source-of-truth readback harness.

This is a deterministic guardrail harness for candidate Gmail/Xero/customer clues.
It only reads local fixture/cache files by default and may optionally perform
Supabase REST GET requests when env vars are present and --live-supabase is used.
It never writes to Gmail, Xero, Supabase, Tuesday, Monday, Drive, Shopify, or Hubdoc.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CASES = ROOT / "reference" / "tuesday" / "fixtures" / "source_readback_cases.json"
DEFAULT_XERO_CACHE = Path("/Users/mack-mini/.hermes/state/xero/xero_cash_snapshot.json")
DEFAULT_OUTPUT_DIR = ROOT / "output"
STATUSES = {
    "reply_needed",
    "already_handled",
    "risky_sensitive",
    "source_of_truth_unavailable",
    "supplier_cost_evidence",
    "precedent_only",
    "ops_island_monday",
    "no_action",
}
ADMIN_SECURITY_TERMS = {
    "login",
    "sign-in",
    "security",
    "privacy",
    "insurance",
    "footage",
    "camera",
    "payment admin",
    "account",
    "policy",
}
OLD_QUOTE_CUTOFF = dt.date(2024, 1, 1)


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def norm(value: Any) -> str:
    return str(value or "").strip().lower()


def words(value: Any) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", norm(value)))


def money(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def date_value(value: Any) -> dt.date | None:
    if not isinstance(value, str) or not value[:10]:
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        return None


def shallow_doc(doc: dict[str, Any]) -> dict[str, Any]:
    keep = [
        "number",
        "invoiceNumber",
        "quoteNumber",
        "contact",
        "status",
        "type",
        "date",
        "updated",
        "total",
        "paid",
        "dueAmount",
        "reference",
    ]
    out = {k: doc.get(k) for k in keep if k in doc}
    if "lineItems" in doc:
        out["lineItems_sample"] = doc.get("lineItems", [])[:3]
        out["lineItems_count"] = len(doc.get("lineItems", []) or [])
    return out


def all_xero_docs(cache: dict[str, Any]) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    for key in [
        "outstandingCustomerInvoices",
        "outstandingBills",
        "recentPaidCustomerInvoices",
        "recentPaidBills",
        "sentQuotes",
        "quotes",
        "invoices",
    ]:
        for doc in cache.get(key, []) or []:
            if isinstance(doc, dict):
                clone = dict(doc)
                clone.setdefault("cacheBucket", key)
                docs.append(clone)
    return docs


def xero_lookup(case: dict[str, Any], cache: dict[str, Any]) -> dict[str, Any]:
    refs = [norm(x) for x in case.get("xero_refs", []) if norm(x)]
    contact = norm(case.get("customer") or case.get("contact"))
    docs = all_xero_docs(cache)
    matches: list[dict[str, Any]] = []
    same_contact: list[dict[str, Any]] = []

    for doc in docs:
        haystack = norm(json.dumps(doc, ensure_ascii=False))
        doc_contact = norm(doc.get("contact") or doc.get("Contact", {}).get("Name") if isinstance(doc.get("Contact"), dict) else doc.get("contact"))
        if refs and any(ref in haystack for ref in refs):
            matches.append(shallow_doc(doc))
        elif contact and contact in doc_contact:
            same_contact.append(shallow_doc(doc))

    # Keep the report inspectable.
    return {
        "cache_path": str(DEFAULT_XERO_CACHE),
        "cache_fetched_at": cache.get("fetchedAt"),
        "matched_refs": refs,
        "matches": matches[:8],
        "same_contact_sample": same_contact[:8],
        "note": "local Xero cache only; no Xero API calls made",
    }


def supabase_config() -> tuple[str, str] | None:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    return url.rstrip("/"), key


def supabase_get(url: str, key: str, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode(params, safe="*,.()")
    request = urllib.request.Request(
        f"{url}/rest/v1/{table}?{query}",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.loads(response.read().decode("utf-8"))


def search_tokens(case: dict[str, Any]) -> list[str]:
    pieces = [case.get("customer"), case.get("contact"), *(case.get("xero_refs", []) or [])]
    tokens: list[str] = []
    for piece in pieces:
        for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9'_-]{2,}", str(piece or "")):
            if token.lower() not in {"and", "the", "ltd", "limited", "quote", "invoice", "table"}:
                tokens.append(token.lower())
        if len(tokens) >= 4:
            break
    # preserve order and uniqueness
    return list(dict.fromkeys(tokens))[:4]


def filter_rows(rows: list[dict[str, Any]], tokens: list[str]) -> list[dict[str, Any]]:
    if not tokens:
        return []
    out = []
    for row in rows:
        haystack = norm(json.dumps(row, ensure_ascii=False))
        if any(token in haystack for token in tokens):
            out.append(row)
    return out[:10]


def supabase_lookup(case: dict[str, Any], live: bool) -> dict[str, Any]:
    fixture = case.get("tuesday_supabase_fixture")
    if fixture:
        return {"mode": "fixture", "available": True, "rows": fixture, "note": "fixture evidence only"}
    if not live:
        return {"mode": "disabled", "available": False, "rows": [], "note": "live Supabase readback not requested; run with --live-supabase to attempt GET-only lookup"}
    config = supabase_config()
    if not config:
        return {"mode": "not_configured", "available": False, "rows": [], "note": "Supabase env vars not configured"}
    url, key = config
    tokens = search_tokens(case)
    if not tokens:
        return {"mode": "live_get", "available": False, "rows": [], "note": "no safe search tokens from case"}
    evidence: dict[str, Any] = {"mode": "live_get", "available": True, "query_tokens": tokens, "rows": {}}
    for table in ["leads", "orders"]:
        try:
            # Deliberately use simple GET + local filtering instead of schema-specific
            # search operators, so the readback path is inspectable and cannot mutate.
            rows = supabase_get(url, key, table, {"select": "*", "limit": "500"})
            evidence["rows"][table] = filter_rows(rows, tokens)
            evidence.setdefault("scanned_counts", {})[table] = len(rows)
        except Exception as exc:
            evidence["rows"][table] = []
            evidence.setdefault("errors", {})[table] = f"{type(exc).__name__}: {str(exc)[:220]}"
    if not any(evidence["rows"].values()):
        evidence["available"] = False
        evidence["note"] = "Supabase GET path ran, but no matching lead/order rows were found"
    return evidence


def gmail_evidence(case: dict[str, Any]) -> dict[str, Any]:
    gmail = dict(case.get("gmail") or {})
    body = gmail.get("body")
    snippet = gmail.get("snippet")
    gmail["mode"] = "fixture_only"
    gmail["partial_evidence"] = bool(snippet and not body)
    if gmail["partial_evidence"]:
        gmail["warning"] = "snippet-only or empty body; do not claim full Gmail context"
    return gmail


def monday_evidence(case: dict[str, Any]) -> dict[str, Any]:
    monday = dict(case.get("monday_optional") or {})
    if not monday:
        return {"mode": "not_checked", "available": False, "note": "Monday optional; not consulted for this case"}
    monday.setdefault("mode", "fixture_only")
    monday.setdefault("label", "legacy_mirror_or_unmigrated_ops_context")
    return monday


def has_paid_invoice_for_quote(case: dict[str, Any], xero: dict[str, Any]) -> bool:
    refs = [norm(x) for x in case.get("xero_refs", [])]
    for doc in xero.get("matches", []) + xero.get("same_contact_sample", []):
        haystack = norm(json.dumps(doc, ensure_ascii=False))
        if refs and any(ref in haystack for ref in refs):
            if norm(doc.get("status")) == "paid" or money(doc.get("paid")) and money(doc.get("paid")) == money(doc.get("total")):
                return True
    return False


def classify(case: dict[str, Any], evidence: dict[str, Any]) -> tuple[str, list[str], str, list[str], float]:
    conflicts: list[str] = []
    blocked: list[str] = []
    safe_next_action = "No customer/team-visible action. Keep as read-only evidence."
    confidence = 0.72
    clue_text = norm(" ".join([case.get("title", ""), case.get("kind", ""), json.dumps(case.get("gmail", {}), ensure_ascii=False)]))
    xero = evidence["xero"]
    tuesday = evidence["tuesday_supabase"]

    if evidence["gmail"].get("partial_evidence"):
        conflicts.append("gmail_body_empty_or_snippet_only")
        blocked.append("Full Gmail context not retrieved; snippet is partial evidence only.")
        confidence -= 0.12

    if not tuesday.get("available"):
        conflicts.append("tuesday_supabase_readback_missing")
        blocked.append("Missing Tuesday/Supabase readback reduces confidence and stops writes/promises.")
        confidence -= 0.2

    if any(term in clue_text for term in ADMIN_SECURITY_TERMS) or case.get("sensitive"):
        blocked.append("Security/admin cases are not warm replies and must not trigger settings/payment/security actions.")
        return "risky_sensitive", conflicts, "Read-only verification only if approved: compare expected account/device/admin context. No reply, no settings changes.", blocked, max(0.25, confidence)

    if case.get("kind") == "supplier_bill" or any(norm(doc.get("type")) == "accpay" for doc in xero.get("matches", [])):
        blocked.append("Supplier bills are cost evidence only, not customer price authority.")
        return "supplier_cost_evidence", conflicts, "Create local cost-evidence notes only: bill line, PO/job/component/inclusions/freshness/confidence/margin blocker.", blocked, max(0.35, confidence)

    if case.get("monday_ops_island"):
        conflicts.append("monday_unmigrated_possible")
        return "ops_island_monday", conflicts, "Treat Monday as optional legacy/unmigrated ops-island context. Do not infer absence from Tuesday as absence of record.", blocked, max(0.35, confidence)

    quote_date = date_value(case.get("quote_date") or case.get("date"))
    if case.get("kind") == "historical_quote" or (quote_date and quote_date < OLD_QUOTE_CUTOFF):
        blocked.append("Old quotes are precedent-only unless a current Quote Spine rebuild is done.")
        return "precedent_only", conflicts, "Use as pattern/precedent only. Require current cost spine and approved margin before live pricing.", blocked, max(0.4, confidence)

    if case.get("latest_sent_after_inbound"):
        return "already_handled", conflicts, "No reply. Latest substantive sent evidence supersedes older inbound unless newer customer inbound appears.", blocked, min(0.9, confidence + 0.1)

    if has_paid_invoice_for_quote(case, xero):
        conflicts.append("xero_quote_status_conflicts_with_paid_invoice")
        blocked.append("Conflicting Xero quote vs paid invoice blocks quote follow-up.")
        safe_next_action = "Do not send or draft quote follow-up. Read latest Gmail and Tuesday/Supabase order state before any customer or production action."
        if not tuesday.get("available"):
            return "source_of_truth_unavailable", conflicts, safe_next_action, blocked, max(0.3, confidence)
        return "already_handled", conflicts, safe_next_action, blocked, max(0.45, confidence)

    if not tuesday.get("available"):
        return "source_of_truth_unavailable", conflicts, "Stop before writes/promises. Add or run read-only Tuesday/Supabase lookup, then reassess.", blocked, max(0.25, confidence)

    if case.get("reply_signal"):
        return "reply_needed", conflicts, "Draft only after latest Gmail full body and Tuesday/Supabase row are read back. Do not send.", blocked, min(0.85, confidence + 0.05)

    return "no_action", conflicts, safe_next_action, blocked, confidence


def evaluate_case(case: dict[str, Any], xero_cache: dict[str, Any], live_supabase: bool) -> dict[str, Any]:
    evidence = {
        "gmail": gmail_evidence(case),
        "xero": xero_lookup(case, xero_cache),
        "tuesday_supabase": supabase_lookup(case, live_supabase),
        "monday_optional": monday_evidence(case),
    }
    # Phase 2 draft-gate fixtures can add local-only readback facets that are
    # not owned by Phase 1 classification. Preserve them in the report so the
    # gate can require quote-control, margin, delivery, and sent-history proof
    # without teaching the source readback harness to draft.
    for optional_key in ["quote_spine", "quote_control", "sent_history", "gmail_sent_history", "supplier_evidence"]:
        if optional_key in case:
            evidence[optional_key] = case[optional_key]
    if isinstance(case.get("xero_readback_fixture"), dict):
        evidence["xero"].update(case["xero_readback_fixture"])
    status, conflicts, safe_next_action, blocked_because, confidence = classify(case, evidence)
    if status not in STATUSES:
        raise ValueError(f"Unexpected status {status}")
    return {
        "id": case.get("id"),
        "title": case.get("title"),
        "status": status,
        "evidence": evidence,
        "conflicts": sorted(set(conflicts)),
        "safe_next_action": safe_next_action,
        "blocked_because": blocked_because,
        "confidence": round(max(0.0, min(1.0, confidence)), 2),
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        f"# Tuesday/Supabase source-of-truth readback harness report — {report['generated_at_utc']}",
        "",
        "Mode: read-only. No Gmail, Xero, Supabase/Tuesday, Monday, Drive, Shopify, or Hubdoc writes made.",
        "",
        "## Summary",
        f"- cases: {len(report['cases'])}",
        f"- live_supabase: {report['metadata']['live_supabase']}",
        f"- xero_cache: {report['metadata']['xero_cache']}",
        "",
        "## Cases",
    ]
    for case in report["cases"]:
        lines.extend(
            [
                f"### {case['id']}: {case['title']}",
                f"- status: `{case['status']}`",
                f"- confidence: {case['confidence']}",
                f"- conflicts: {', '.join(case['conflicts']) if case['conflicts'] else 'none'}",
                f"- safe_next_action: {case['safe_next_action']}",
                f"- blocked_because: {'; '.join(case['blocked_because']) if case['blocked_because'] else 'none'}",
                f"- gmail: partial={case['evidence']['gmail'].get('partial_evidence')} subject={case['evidence']['gmail'].get('subject')}",
                f"- xero: {len(case['evidence']['xero'].get('matches', []))} ref match(es), {len(case['evidence']['xero'].get('same_contact_sample', []))} same-contact sample(s)",
                f"- tuesday_supabase: {case['evidence']['tuesday_supabase'].get('mode')} available={case['evidence']['tuesday_supabase'].get('available')}",
                f"- monday_optional: {case['evidence']['monday_optional'].get('label') or case['evidence']['monday_optional'].get('mode')}",
                "",
            ]
        )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read-only Tuesday/Supabase source-of-truth readback harness")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES, help="JSON fixture with candidate cases")
    parser.add_argument("--xero-cache", type=Path, default=DEFAULT_XERO_CACHE, help="local Xero cache JSON")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="local output directory")
    parser.add_argument("--live-supabase", action="store_true", help="attempt Supabase REST GET-only readback using env vars")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.local", help="optional env file to load without printing secrets")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_env_file(args.env_file)
    cases_doc = load_json(args.cases, {})
    cases = cases_doc.get("cases", cases_doc if isinstance(cases_doc, list) else [])
    if not isinstance(cases, list) or not cases:
        print(f"No cases found in {args.cases}", file=sys.stderr)
        return 2
    xero_cache = load_json(args.xero_cache, {})
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report = {
        "generated_at_utc": timestamp,
        "metadata": {
            "mode": "read_only_no_external_writes",
            "live_supabase": bool(args.live_supabase),
            "cases_fixture": str(args.cases),
            "xero_cache": str(args.xero_cache),
            "status_values": sorted(STATUSES),
            "failure_mode_rules": [
                "empty Gmail body/snippet-only is partial evidence",
                "conflicting Xero quote vs paid invoice blocks quote follow-up",
                "old quotes are precedent-only",
                "supplier bills are cost evidence only",
                "latest sent supersedes older inbound",
                "security/admin cases are not warm replies",
                "missing Tuesday/Supabase readback reduces confidence and stops writes/promises",
                "Monday is legacy/mirror/unmigrated-island context only",
            ],
        },
        "cases": [evaluate_case(case, xero_cache, args.live_supabase) for case in cases],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / f"tuesday-source-readback-report-{timestamp}.json"
    md_path = args.output_dir / f"tuesday-source-readback-report-{timestamp}.md"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    md_path.write_text(markdown_report(report))
    print(json.dumps({"ok": True, "json": str(json_path), "markdown": str(md_path), "cases": len(report["cases"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
