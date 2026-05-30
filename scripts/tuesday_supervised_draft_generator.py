#!/usr/bin/env python3
"""Supervised local draft generator layered on Tuesday readback + draft gate.

Phase 3 is deliberately boring: it turns allowed Phase 2 draft_brief objects into
local review packages only. It never creates Gmail drafts, Xero documents,
Supabase/Tuesday rows, Monday items, Shopify changes, or customer-visible output.
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
DEFAULT_OUTPUT_DIR = ROOT / "output"
GATE_PATH = ROOT / "scripts" / "tuesday_draft_quality_gate.py"
LOCAL_REVIEW_LABEL = "LOCAL REVIEW DRAFT ONLY - NOT SENT - NOT CREATED IN GMAIL/XERO"
CUSTOMER_LIVE_ACTION_LABEL = "Approval required before Gmail draft/send/system update. This local package was not sent and not created in Gmail/Xero."
XERO_LIVE_ACTION_LABEL = "approval required before Xero DRAFT creation. This local package was not sent and not created in Gmail/Xero."
BANNED_LIVE_ACTION_PHRASES = ["sent", "created in xero", "created in gmail", "updated supabase", "updated tuesday", "updated monday"]


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


def load_gate_module():
    spec = importlib.util.spec_from_file_location("tuesday_draft_quality_gate", GATE_PATH)
    module = importlib.util.module_from_spec(spec)
    if not spec or not spec.loader:
        raise RuntimeError(f"Cannot load draft quality gate from {GATE_PATH}")
    spec.loader.exec_module(module)
    return module


def first_row(evidence: dict[str, Any]) -> dict[str, Any]:
    rows = (evidence.get("tuesday_supabase") or {}).get("rows")
    if isinstance(rows, list) and rows:
        return rows[0] if isinstance(rows[0], dict) else {}
    if isinstance(rows, dict):
        for value in rows.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value[0]
    return {}


def safe_text(value: Any) -> str:
    return str(value or "").replace("—", "-").strip()


def customer_name(evidence: dict[str, Any]) -> str:
    row = first_row(evidence)
    gmail = evidence.get("gmail") or {}
    return safe_text(row.get("customer_name") or row.get("name") or gmail.get("from") or "customer")


def summarize_latest_ask(evidence: dict[str, Any]) -> str:
    gmail = evidence.get("gmail") or {}
    body = safe_text(gmail.get("body") or gmail.get("snippet"))
    if not body:
        return "Unknown. Full Gmail body not available in the local fixture."
    compact = re.sub(r"\s+", " ", body)
    return compact[:240] + ("..." if len(compact) > 240 else "")


def extract_body_facts(evidence: dict[str, Any]) -> list[str]:
    gmail = evidence.get("gmail") or {}
    row = first_row(evidence)
    body = safe_text(gmail.get("body"))
    facts: list[str] = []
    dims = re.findall(r"\b\d{3,4}\s*x\s*\d{3,4}\b", body, flags=re.I)
    for dim in dims:
        facts.append(f"dimension mentioned by customer: {dim}")
    for timber in ["rimu", "red beech", "totara", "tōtara"]:
        if timber.lower() in body.lower():
            facts.append(f"timber mentioned by customer: {timber}")
    if row.get("status"):
        facts.append(f"Tuesday/Supabase fixture status: {safe_text(row.get('status'))}")
    if row.get("intent"):
        facts.append(f"Tuesday/Supabase fixture intent: {safe_text(row.get('intent'))}")
    return list(dict.fromkeys(facts)) or ["No specific product facts beyond the source summary are safe to use."]


def xero_contact_summary(evidence: dict[str, Any]) -> dict[str, Any]:
    row = first_row(evidence)
    gmail = evidence.get("gmail") or {}
    return {
        "contact_name": customer_name(evidence),
        "source": safe_text(row.get("source") or "fixture/local readback only"),
        "tuesday_status": safe_text(row.get("status") or "unknown"),
        "gmail_subject": safe_text(gmail.get("subject") or "unknown"),
    }


def quote_spine(evidence: dict[str, Any]) -> dict[str, Any]:
    spine = evidence.get("quote_spine") or evidence.get("quote_control") or {}
    return spine if isinstance(spine, dict) else {}


def build_spec_block(line: dict[str, Any]) -> str:
    labels = [
        ("Item", line.get("title") or line.get("description")),
        ("Dimensions", line.get("dimensions")),
        ("Timber", line.get("timber")),
        ("Finish", line.get("finish")),
        ("Base", line.get("base")),
        ("Quantity", line.get("quantity")),
        ("Delivery", line.get("delivery_destination")),
    ]
    parts = [f"{label}: {safe_text(value)}" for label, value in labels if safe_text(value)]
    return "\n".join(parts) if parts else "Item: unknown fixture line item"


def build_line_items_from_spine(spine: dict[str, Any]) -> list[dict[str, Any]]:
    raw_lines = spine.get("line_items") if isinstance(spine.get("line_items"), list) else []
    if not raw_lines:
        return [
            {
                "description_spec_block": "Item: quote line skeleton\nDetails: unknown until quote spine provides line item facts",
                "quantity": "unknown",
                "unit_amount_ex_gst": "unknown",
                "customer_visible_note": "No price or product specifics inserted because the quote spine did not provide them.",
            }
        ]
    lines: list[dict[str, Any]] = []
    for raw in raw_lines:
        if not isinstance(raw, dict):
            continue
        item = dict(raw)
        if spine.get("delivery_destination") and not item.get("delivery_destination"):
            item["delivery_destination"] = spine.get("delivery_destination")
        amount = item.get("unit_amount_ex_gst", item.get("unit_amount"))
        lines.append(
            {
                "description_spec_block": build_spec_block(item),
                "quantity": item.get("quantity", "unknown"),
                "unit_amount_ex_gst": amount if amount not in (None, "") else "unknown",
                "gst_mode": safe_text(spine.get("gst_mode") or "unknown"),
                "customer_visible_note": safe_text(item.get("customer_visible_note") or "Fixture/local quote spine facts only."),
            }
        )
    return lines


def build_blocked_package(gate_case: dict[str, Any]) -> dict[str, Any]:
    return {
        "case_id": gate_case.get("id"),
        "title": gate_case.get("title"),
        "label": LOCAL_REVIEW_LABEL,
        "blocked": True,
        "draft_type": gate_case.get("draft_type"),
        "reason": gate_case.get("decision"),
        "missing_sources": gate_case.get("missing_sources") or [],
        "unsafe_claims_to_avoid": gate_case.get("unsafe_claims_to_avoid") or [],
        "next_safe_step": ((gate_case.get("readback") or {}).get("safe_next_action") or "Read back missing sources and re-run the quality gate before drafting."),
    }


def build_email_package(gate_case: dict[str, Any]) -> dict[str, Any]:
    evidence = ((gate_case.get("readback") or {}).get("evidence") or {})
    gmail = evidence.get("gmail") or {}
    name = customer_name(evidence)
    facts = extract_body_facts(evidence)
    unknowns = gate_case.get("draft_brief", {}).get("must_not_invent") or []
    draft_lines = [
        LOCAL_REVIEW_LABEL,
        "",
        f"Hi {name.split()[0] if name and name != 'customer' else 'there'},",
        "",
        "Thanks for getting in touch. I have noted the table enquiry details from your message.",
        "",
        "The safe next step is for Guido to review these details and confirm the response before any live action.",
        "",
        "Kind regards,",
        "Guido",
    ]
    return {
        "case_id": gate_case.get("id"),
        "title": gate_case.get("title"),
        "label": LOCAL_REVIEW_LABEL,
        "blocked": False,
        "draft_type": "email_reply",
        "subject_context": safe_text(gmail.get("subject") or (gate_case.get("draft_brief") or {}).get("source_summary", {}).get("gmail_subject") or "unknown"),
        "latest_ask_summary": summarize_latest_ask(evidence),
        "facts_allowed": facts,
        "unknowns_do_not_invent": unknowns,
        "customer_facing_draft": "\n".join(draft_lines),
        "approval_required_before_live_action": CUSTOMER_LIVE_ACTION_LABEL,
    }


def build_quote_reply_package(gate_case: dict[str, Any]) -> dict[str, Any]:
    package = build_email_package(gate_case)
    package["draft_type"] = "quote_reply"
    package["quote_control"] = "Quote reply skeleton only. Do not include price unless current quote spine fixture provides it."
    return package


def build_xero_package(gate_case: dict[str, Any]) -> dict[str, Any]:
    evidence = ((gate_case.get("readback") or {}).get("evidence") or {})
    spine = quote_spine(evidence)
    draft_type = gate_case.get("draft_type")
    payload = {
        "label": LOCAL_REVIEW_LABEL,
        "document_type": draft_type,
        "contact_source_summary": xero_contact_summary(evidence),
        "title_reference_summary_rules": {
            "title": "Use concise customer/project reference from approved quote spine only.",
            "reference": "Keep fixture reference local until Guido approves live Xero draft creation.",
            "summary": "No account codes, tax/internal notes, or private margin notes in customer-facing line descriptions.",
        },
        "line_items": build_line_items_from_spine(spine),
        "gst_ex_gst_mode": safe_text(spine.get("gst_mode") or "unknown"),
        "terms_skeleton": safe_text(spine.get("terms") or "Terms require Guido review before live Xero DRAFT creation."),
        "internal_review_only": {
            "margin_checked": bool(spine.get("margin_checked")),
            "delivery_destination": safe_text(spine.get("delivery_destination") or "unknown"),
            "account_code_checked": bool(spine.get("account_code_checked")),
        },
    }
    return {
        "case_id": gate_case.get("id"),
        "title": gate_case.get("title"),
        "label": LOCAL_REVIEW_LABEL,
        "blocked": False,
        "draft_type": draft_type,
        "subject_context": safe_text(((evidence.get("gmail") or {}).get("subject")) or "unknown"),
        "latest_ask_summary": summarize_latest_ask(evidence),
        "facts_allowed": gate_case.get("draft_brief", {}).get("facts_may_use") or [],
        "unknowns_do_not_invent": gate_case.get("draft_brief", {}).get("must_not_invent") or [],
        "payload_preview": payload,
        "approval_required_before_live_action": XERO_LIVE_ACTION_LABEL,
    }


def build_draft_package(gate_case: dict[str, Any]) -> dict[str, Any]:
    if not gate_case.get("draft_allowed"):
        return build_blocked_package(gate_case)
    draft_type = gate_case.get("draft_type")
    if draft_type == "email_reply":
        return build_email_package(gate_case)
    if draft_type == "quote_reply":
        return build_quote_reply_package(gate_case)
    if draft_type in {"xero_quote", "xero_invoice"}:
        return build_xero_package(gate_case)
    return build_blocked_package({**gate_case, "decision": f"unsupported draft_type {draft_type}"})


def customer_facing_texts(package: dict[str, Any]) -> list[str]:
    texts: list[str] = []
    if package.get("customer_facing_draft"):
        texts.append(str(package["customer_facing_draft"]))
    payload = package.get("payload_preview") or {}
    for line in payload.get("line_items") or []:
        if isinstance(line, dict):
            texts.append(str(line.get("description_spec_block") or ""))
            texts.append(str(line.get("customer_visible_note") or ""))
    return texts


def lint_package(package: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    serialized = json.dumps(package, ensure_ascii=False).lower()
    if LOCAL_REVIEW_LABEL.lower() not in serialized:
        errors.append("missing local-review label")
    for text in customer_facing_texts(package):
        if "—" in text:
            errors.append("customer-facing text contains em dash")
    for phrase in BANNED_LIVE_ACTION_PHRASES:
        if phrase in serialized:
            if phrase == "sent" and "not sent" in serialized:
                continue
            if phrase in {"created in xero", "created in gmail"} and ("not created in gmail/xero" in serialized or f"not {phrase}" in serialized):
                continue
            if phrase.startswith("updated") and ("not updated" in serialized or "approval required" in serialized):
                warnings.append(f"live-action phrase guarded by approval wording: {phrase}")
                continue
            errors.append(f"unguarded live-action phrase: {phrase}")
    return {"ok": not errors, "errors": errors, "warnings": warnings}


def build_report(gate_cases: list[dict[str, Any]], metadata: dict[str, Any]) -> dict[str, Any]:
    packages = [build_draft_package(case) for case in gate_cases]
    lints = [lint_package(package) for package in packages]
    return {
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
        "metadata": {
            "mode": "local_read_only_supervised_draft_generator",
            "safety": "No Gmail/Xero/Supabase/Tuesday/Monday/Shopify writes. Local review output only.",
            **metadata,
        },
        "summary": {
            "cases": len(packages),
            "blocked": sum(1 for package in packages if package.get("blocked")),
            "draft_packages": sum(1 for package in packages if not package.get("blocked")),
            "lint_ok": all(lint["ok"] for lint in lints),
        },
        "packages": packages,
        "lint": lints,
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        f"# Tuesday supervised local draft generator report - {report['generated_at_utc']}",
        "",
        f"Mode: {LOCAL_REVIEW_LABEL}. No live drafts, sends, records, or customer-visible outputs were created.",
        "",
        "## Summary",
        f"- cases: {report['summary']['cases']}",
        f"- blocked: {report['summary']['blocked']}",
        f"- local draft packages: {report['summary']['draft_packages']}",
        f"- lint_ok: {report['summary']['lint_ok']}",
        "",
        "## Packages",
    ]
    for package in report["packages"]:
        lines.extend(["", f"### {package.get('case_id')}: {package.get('title')}", f"- label: {package.get('label')}", f"- blocked: `{package.get('blocked')}`", f"- draft_type: `{package.get('draft_type')}`"])
        if package.get("blocked"):
            lines.extend([
                f"- reason: `{package.get('reason')}`",
                f"- missing_sources: {', '.join(package.get('missing_sources') or []) or 'none'}",
                f"- next_safe_step: {package.get('next_safe_step')}",
            ])
            continue
        lines.extend([
            f"- subject_context: {package.get('subject_context')}",
            f"- latest_ask_summary: {package.get('latest_ask_summary')}",
            f"- approval_required_before_live_action: {package.get('approval_required_before_live_action')}",
            "- facts_allowed:",
        ])
        for fact in package.get("facts_allowed") or []:
            lines.append(f"  - {fact}")
        if package.get("customer_facing_draft"):
            lines.extend(["", "```text", package["customer_facing_draft"], "```"])
        if package.get("payload_preview"):
            lines.extend(["", "```json", json.dumps(package["payload_preview"], indent=2, ensure_ascii=False), "```"])
    lines.extend(["", "## Lint", ""])
    for package, lint in zip(report["packages"], report["lint"]):
        lines.append(f"- {package.get('case_id')}: ok={lint['ok']} errors={lint['errors']} warnings={lint['warnings']}")
    return "\n".join(lines)


def gate_cases_from_args(args: argparse.Namespace) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    gate = load_gate_module()
    if args.gate_report:
        doc = load_json(args.gate_report, {})
        cases = doc.get("cases", []) if isinstance(doc, dict) else []
        return cases, {"gate_report": str(args.gate_report), "source": "existing_phase2_gate_report"}
    readback_cases, metadata = gate.readback_cases_from_args(args)
    cases: list[dict[str, Any]] = []
    for readback in readback_cases:
        gate_case = gate.evaluate_readback_case(readback)
        gate_case["readback"] = readback
        cases.append(gate_case)
    return cases, {**metadata, "source": "phase1_harness_and_phase2_gate_evaluated_now"}


def parse_args() -> argparse.Namespace:
    gate = load_gate_module()
    parser = argparse.ArgumentParser(description="Local supervised draft generator layered on Tuesday draft quality gate")
    parser.add_argument("--gate-report", type=Path, help="Existing Phase 2 JSON report to consume")
    parser.add_argument("--readback-report", type=Path, help="Existing Phase 1 JSON report to consume via gate")
    parser.add_argument("--cases", type=Path, default=gate.DEFAULT_CASES, help="Phase 1 cases fixture to evaluate first")
    parser.add_argument("--xero-cache", type=Path, default=getattr(gate.load_harness_module(), "DEFAULT_XERO_CACHE", Path("/Users/mack-mini/.hermes/state/xero/xero_cash_snapshot.json")), help="local Xero cache JSON")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="local output directory")
    parser.add_argument("--live-supabase", action="store_true", help="pass through to Phase 1 GET-only Supabase readback; default off")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.local", help="optional env file for GET-only readback; secrets are not printed")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    gate_cases, metadata = gate_cases_from_args(args)
    if not gate_cases:
        print("No Phase 2 gate cases found", file=sys.stderr)
        return 2
    report = build_report(gate_cases, metadata)
    if not report["summary"]["lint_ok"]:
        print(json.dumps({"ok": False, "lint": report["lint"]}, indent=2), file=sys.stderr)
        return 3
    timestamp = report["generated_at_utc"]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / f"tuesday-supervised-draft-generator-report-{timestamp}.json"
    md_path = args.output_dir / f"tuesday-supervised-draft-generator-report-{timestamp}.md"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    md_path.write_text(markdown_report(report))
    print(json.dumps({"ok": True, "json": str(json_path), "markdown": str(md_path), "cases": len(report["packages"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
