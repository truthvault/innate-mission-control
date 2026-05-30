#!/usr/bin/env python3
"""Deterministic local draft quality gate for Tuesday readback reports.

Phase 2 sits on top of scripts/tuesday_source_readback_harness.py. It consumes
local fixture/readback evidence and produces bounded draft decisions. It never
creates Gmail drafts, Xero documents, Supabase/Tuesday records, Monday items, or
customer-visible output.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CASES = ROOT / "reference" / "tuesday" / "fixtures" / "source_readback_cases.json"
DEFAULT_OUTPUT_DIR = ROOT / "output"
HARNESS_PATH = ROOT / "scripts" / "tuesday_source_readback_harness.py"
DRAFT_TYPES = {"email_reply", "quote_reply", "xero_quote", "xero_invoice", "internal_note", "none"}
DECISIONS = {
    "blocked_needs_full_gmail",
    "blocked_source_of_truth_missing",
    "blocked_quote_control_missing",
    "blocked_sensitive_admin",
    "precedent_only",
    "supplier_cost_evidence_only",
    "already_handled",
    "ready_for_internal_draft",
    "ready_for_guido_review",
}
CUSTOMER_REPLY_APPROVALS = ["send_email", "create_gmail_draft", "update_supabase_tuesday", "update_xero", "update_monday"]
XERO_DRAFT_APPROVALS = ["create_xero_draft", "send_xero_quote_or_invoice", "update_supabase_tuesday", "send_email"]
INTERNAL_APPROVALS = ["update_supabase_tuesday", "update_monday", "update_settings", "payment_or_admin_action"]


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


def norm(value: Any) -> str:
    return str(value or "").strip().lower()


def has_words(text: str, *terms: str) -> bool:
    haystack = norm(text)
    return any(term in haystack for term in terms)


def evidence_rows_available(evidence: dict[str, Any]) -> bool:
    tuesday = evidence.get("tuesday_supabase") or {}
    if not tuesday.get("available"):
        return False
    rows = tuesday.get("rows")
    if isinstance(rows, list):
        return bool(rows)
    if isinstance(rows, dict):
        return any(bool(value) for value in rows.values())
    return True


def gmail_has_full_context(evidence: dict[str, Any]) -> bool:
    gmail = evidence.get("gmail") or {}
    return bool(gmail.get("body")) and not gmail.get("partial_evidence")


def quote_spine(evidence: dict[str, Any]) -> dict[str, Any]:
    spine = evidence.get("quote_spine") or evidence.get("quote_control") or {}
    return spine if isinstance(spine, dict) else {}


def sent_history_available(evidence: dict[str, Any]) -> bool:
    sent = evidence.get("sent_history") or evidence.get("gmail_sent_history") or {}
    if not sent:
        # Phase 1 cases can encode this in the full Gmail/thread body. Keep this
        # non-blocking for ordinary reply briefs, but list it as required.
        return True
    return bool(sent.get("available", True))


def source_labels_for_case(readback: dict[str, Any]) -> list[str]:
    title_and_status = f"{readback.get('title', '')} {readback.get('status', '')}"
    labels = ["Gmail full body/thread", "Supabase/Tuesday row", "sent-history check"]
    if has_words(title_and_status, "quote", "invoice", "xero", "benchtop", "approval", "accepted"):
        labels.extend(["Xero quote/invoice readback", "quote spine/calculator", "margin check"])
    if has_words(title_and_status, "delivery", "freight", "benchtop", "invoice"):
        labels.append("delivery destination")
    if readback.get("status") == "supplier_cost_evidence":
        labels.append("supplier evidence")
    return list(dict.fromkeys(labels))


def missing_sources(readback: dict[str, Any]) -> list[str]:
    evidence = readback.get("evidence") or {}
    missing: list[str] = []
    if not gmail_has_full_context(evidence):
        missing.append("Gmail full body/thread")
    if not evidence_rows_available(evidence):
        missing.append("Supabase/Tuesday row")
    if not sent_history_available(evidence):
        missing.append("sent-history check")

    title_and_status = f"{readback.get('title', '')} {readback.get('status', '')}"
    is_quoteish = has_words(title_and_status, "quote", "invoice", "xero", "benchtop", "approval", "accepted")
    spine = quote_spine(evidence)
    if is_quoteish:
        xero = evidence.get("xero") or {}
        if not (xero.get("matches") or xero.get("same_contact_sample") or xero.get("readback_available")):
            missing.append("Xero quote/invoice readback")
        if not spine.get("available"):
            missing.append("quote spine/calculator")
        if not spine.get("margin_checked"):
            missing.append("margin check")
        if has_words(title_and_status, "delivery", "freight", "benchtop", "invoice") and not spine.get("delivery_destination"):
            missing.append("delivery destination")
    return list(dict.fromkeys(missing))


def infer_draft_type(readback: dict[str, Any], missing: list[str]) -> str:
    status = readback.get("status")
    title = norm(readback.get("title"))
    if status in {"already_handled", "no_action", "precedent_only", "supplier_cost_evidence", "source_of_truth_unavailable"}:
        return "none"
    if status == "risky_sensitive":
        return "internal_note"
    if "invoice" in title:
        return "xero_invoice" if "quote spine/calculator" not in missing and "margin check" not in missing else "none"
    if "xero quote" in title or re.search(r"\bquote draft\b", title):
        return "xero_quote" if "quote spine/calculator" not in missing and "margin check" not in missing else "none"
    if any(word in title for word in ["quote", "benchtop", "pricing"]):
        return "quote_reply" if "quote spine/calculator" not in missing and "margin check" not in missing else "none"
    return "email_reply"


def unsafe_claims(readback: dict[str, Any], missing: list[str]) -> list[str]:
    claims = [
        "Do not promise delivery, pricing, lead time, production status, or payment status unless source-read back.",
        "Do not use em dashes in customer-facing draft text.",
    ]
    status = readback.get("status")
    conflicts = set(readback.get("conflicts") or [])
    if "gmail_body_empty_or_snippet_only" in conflicts or "Gmail full body/thread" in missing:
        claims.append("Do not infer intent or commitments from Gmail snippets or empty bodies.")
    if "tuesday_supabase_readback_missing" in conflicts or "Supabase/Tuesday row" in missing:
        claims.append("Do not claim lead/order state without Supabase/Tuesday readback.")
    if "xero_quote_status_conflicts_with_paid_invoice" in conflicts:
        claims.append("Do not say the quote is still awaiting acceptance")
        claims.append("Do not send a quote follow-up until same-contact invoices/payments are reconciled.")
    if status == "precedent_only":
        claims.append("Do not reuse old quote totals as current pricing authority.")
    if status == "supplier_cost_evidence":
        claims.append("Do not turn supplier costs into customer pricing")
        claims.append("Do not omit markup or margin gate from customer price work.")
    if status == "risky_sensitive":
        claims.append("Do not write a warm customer reply for security, payment, admin, privacy, login, or settings cases.")
    return list(dict.fromkeys(claims))


def decide(readback: dict[str, Any], missing: list[str]) -> str:
    status = readback.get("status")
    conflicts = set(readback.get("conflicts") or [])
    if status == "risky_sensitive":
        return "blocked_sensitive_admin"
    if status == "supplier_cost_evidence":
        return "supplier_cost_evidence_only"
    if status == "precedent_only":
        return "precedent_only"
    if status == "already_handled" or "xero_quote_status_conflicts_with_paid_invoice" in conflicts:
        return "already_handled"
    if "Gmail full body/thread" in missing:
        return "blocked_needs_full_gmail"
    if "Supabase/Tuesday row" in missing or status == "source_of_truth_unavailable":
        return "blocked_source_of_truth_missing"
    if any(source in missing for source in ["quote spine/calculator", "margin check", "delivery destination"]):
        return "blocked_quote_control_missing"
    if status == "reply_needed":
        return "ready_for_guido_review"
    return "ready_for_internal_draft"


def build_draft_brief(readback: dict[str, Any], draft_type: str, missing: list[str]) -> dict[str, Any]:
    evidence = readback.get("evidence") or {}
    facts_allowed: list[str] = []
    gmail = evidence.get("gmail") or {}
    if gmail_has_full_context(evidence):
        facts_allowed.append("Use only the retrieved Gmail full body/thread and its latest substantive sent/inbound order.")
    if evidence_rows_available(evidence):
        facts_allowed.append("Use the Supabase/Tuesday row as lead/order state authority.")
    xero = evidence.get("xero") or {}
    if xero.get("matches") or xero.get("same_contact_sample"):
        facts_allowed.append("Use Xero readback only after cross-checking same-contact quotes, invoices, payments and status.")
    spine = quote_spine(evidence)
    if spine.get("available"):
        facts_allowed.append("Use the quote spine/calculator fields that are present and explicitly mark unknowns.")
    if readback.get("status") == "supplier_cost_evidence":
        facts_allowed.append("Use supplier bill lines as cost evidence only, never as customer price authority.")

    return {
        "case_id": readback.get("id"),
        "draft_type": draft_type,
        "purpose": "Prepare bounded local draft material only; do not send, publish, create live drafts, or update systems.",
        "facts_may_use": facts_allowed,
        "must_not_invent": [
            "pricing, discounts, margin, GST treatment, account codes, delivery destination, payment state, production status, or customer commitments",
            "facts from snippets, old quotes, supplier bills, or absent source-of-truth rows",
        ],
        "must_follow": [
            "Use Innate Xero line style" if draft_type in {"xero_quote", "xero_invoice"} else "Keep customer-facing prose warm, plain, short, and source-bound",
            "State explicit unknowns before fluent prose",
            "No em dashes in customer-facing draft text",
            "Label every output as local draft/brief only, not sent and not created in Xero/Gmail",
        ],
        "missing_before_live_draft_creation": missing,
        "source_summary": {
            "gmail_subject": gmail.get("subject"),
            "tuesday_mode": (evidence.get("tuesday_supabase") or {}).get("mode"),
            "xero_ref_matches": len(xero.get("matches") or []),
        },
    }


def evaluate_readback_case(readback: dict[str, Any]) -> dict[str, Any]:
    missing = missing_sources(readback)
    decision = decide(readback, missing)
    draft_type = infer_draft_type(readback, missing)
    if decision in {"blocked_needs_full_gmail", "blocked_source_of_truth_missing", "blocked_quote_control_missing", "blocked_sensitive_admin", "precedent_only", "supplier_cost_evidence_only", "already_handled"}:
        draft_allowed = False
        if decision == "blocked_sensitive_admin":
            draft_type = "internal_note"
        elif decision in {"precedent_only", "supplier_cost_evidence_only", "already_handled"}:
            draft_type = "none"
    else:
        draft_allowed = draft_type != "none"

    if draft_type in {"xero_quote", "xero_invoice"}:
        approvals = XERO_DRAFT_APPROVALS
    elif draft_type == "internal_note":
        approvals = INTERNAL_APPROVALS
    else:
        approvals = CUSTOMER_REPLY_APPROVALS

    if draft_type not in DRAFT_TYPES:
        raise ValueError(f"Unexpected draft_type {draft_type}")
    if decision not in DECISIONS:
        raise ValueError(f"Unexpected decision {decision}")

    return {
        "id": readback.get("id"),
        "title": readback.get("title"),
        "draft_allowed": bool(draft_allowed),
        "draft_type": draft_type,
        "decision": decision,
        "required_sources": source_labels_for_case(readback),
        "missing_sources": missing,
        "unsafe_claims_to_avoid": unsafe_claims(readback, missing),
        "customer_visible_promises_allowed": False,
        "required_human_approval_before": approvals,
        "draft_brief": build_draft_brief(readback, draft_type, missing),
    }


def load_harness_module():
    spec = importlib.util.spec_from_file_location("tuesday_source_readback_harness", HARNESS_PATH)
    module = importlib.util.module_from_spec(spec)
    if not spec or not spec.loader:
        raise RuntimeError(f"Cannot load harness from {HARNESS_PATH}")
    spec.loader.exec_module(module)
    return module


def readback_cases_from_args(args: argparse.Namespace) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if args.readback_report:
        doc = load_json(args.readback_report, {})
        cases = doc.get("cases", []) if isinstance(doc, dict) else []
        return cases, {"readback_report": str(args.readback_report), "source": "existing_phase1_report"}

    harness = load_harness_module()
    harness.load_env_file(args.env_file)
    cases_doc = harness.load_json(args.cases, {})
    raw_cases = cases_doc.get("cases", cases_doc if isinstance(cases_doc, list) else [])
    xero_cache = harness.load_json(args.xero_cache, {})
    cases = [harness.evaluate_case(case, xero_cache, args.live_supabase) for case in raw_cases]
    return cases, {
        "cases_fixture": str(args.cases),
        "xero_cache": str(args.xero_cache),
        "live_supabase": bool(args.live_supabase),
        "source": "phase1_harness_evaluated_now",
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        f"# Tuesday draft quality gate report - {report['generated_at_utc']}",
        "",
        "Mode: local/read-only. No Gmail drafts, emails, Xero documents, Supabase/Tuesday rows, Monday items, Shopify changes, or customer-visible outputs were created.",
        "",
        "## Summary",
        f"- cases: {len(report['cases'])}",
        f"- draft_allowed: {sum(1 for case in report['cases'] if case['draft_allowed'])}",
        f"- blocked: {sum(1 for case in report['cases'] if not case['draft_allowed'])}",
        "",
        "## Cases",
    ]
    for case in report["cases"]:
        lines.extend(
            [
                f"### {case['id']}: {case['title']}",
                f"- draft_allowed: `{case['draft_allowed']}`",
                f"- draft_type: `{case['draft_type']}`",
                f"- decision: `{case['decision']}`",
                f"- required_sources: {', '.join(case['required_sources']) if case['required_sources'] else 'none'}",
                f"- missing_sources: {', '.join(case['missing_sources']) if case['missing_sources'] else 'none'}",
                f"- customer_visible_promises_allowed: `{case['customer_visible_promises_allowed']}`",
                f"- human approval before: {', '.join(case['required_human_approval_before'])}",
                f"- unsafe_claims_to_avoid: {'; '.join(case['unsafe_claims_to_avoid'])}",
                "",
            ]
        )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local deterministic draft quality gate layered on Tuesday readback harness")
    parser.add_argument("--readback-report", type=Path, help="Existing Phase 1 JSON report to consume")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES, help="Phase 1 cases fixture to evaluate first")
    parser.add_argument("--xero-cache", type=Path, default=getattr(load_harness_module(), "DEFAULT_XERO_CACHE", Path("/Users/mack-mini/.hermes/state/xero/xero_cash_snapshot.json")), help="local Xero cache JSON")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="local output directory")
    parser.add_argument("--live-supabase", action="store_true", help="pass through to Phase 1 GET-only Supabase readback; default off")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.local", help="optional env file for GET-only readback; secrets are not printed")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    readback_cases, metadata = readback_cases_from_args(args)
    if not readback_cases:
        print("No Phase 1 readback cases found", file=sys.stderr)
        return 2
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report = {
        "generated_at_utc": timestamp,
        "metadata": {
            "mode": "local_read_only_draft_quality_gate",
            "draft_types": sorted(DRAFT_TYPES),
            "decisions": sorted(DECISIONS),
            **metadata,
        },
        "cases": [evaluate_readback_case(case) for case in readback_cases],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / f"tuesday-draft-quality-gate-report-{timestamp}.json"
    md_path = args.output_dir / f"tuesday-draft-quality-gate-report-{timestamp}.md"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    md_path.write_text(markdown_report(report))
    print(json.dumps({"ok": True, "json": str(json_path), "markdown": str(md_path), "cases": len(report["cases"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
