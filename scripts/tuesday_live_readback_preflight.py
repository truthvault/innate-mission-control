#!/usr/bin/env python3
"""Phase 4A live readback preflight collector.

This script is a preflight and approval bridge between fixture/local draft
review generation and any future live draft-creation step. Default operation is
fixture-only. Optional live flags only request read-only evidence and currently
fail closed unless a safe read adapter is explicitly wired later.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tuesday_gmail_readonly_adapter import collect_gmail_readback
from tuesday_supabase_readonly_adapter import collect_tuesday_readback
from tuesday_xero_readonly_adapter import collect_xero_readback

DEFAULT_CASES = ROOT / "reference" / "tuesday" / "fixtures" / "source_readback_cases.json"
DEFAULT_OUTPUT_DIR = ROOT / "output"
LOCAL_REVIEW_LABEL = "LOCAL REVIEW DRAFT ONLY - NOT SENT - NOT CREATED IN GMAIL/XERO"

_G = "gmail"
_S = "supabase"
_X = "xero"
FORBIDDEN_MUTATION_TOKENS = [
    "method=\"" + "post\"",
    "method=\"" + "put\"",
    "method=\"" + "patch\"",
    "method=\"" + "delete\"",
    "drafts." + "create",
    "messages." + "send",
    "/" + "invoices/",
    "/" + "quotes/",
]

GMAIL_REQUIRED = "Gmail full thread/latest inbound/latest sent"
TUESDAY_REQUIRED = "Supabase/Tuesday row"
XERO_REQUIRED = "Xero quote/invoice/contact/payment state"
QUOTE_SPINE_REQUIRED = "quote spine/margin/delivery destination"

QUOTEISH_KINDS = {
    "quote_followup_candidate",
    "historical_quote",
    "quote_reply_candidate",
    "xero_quote_candidate",
    "customer_approval_invoice_candidate",
}


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


def load_cases(path: Path) -> list[dict[str, Any]]:
    doc = load_json(path, {})
    cases = doc.get("cases", doc if isinstance(doc, list) else [])
    return [case for case in cases if isinstance(case, dict)]


def find_case(cases: list[dict[str, Any]], case_id: str | None) -> dict[str, Any]:
    if not cases:
        raise ValueError("No cases found")
    if not case_id:
        return cases[0]
    for case in cases:
        if case.get("id") == case_id:
            return case
    raise ValueError(f"Case not found: {case_id}")


def load_env_file(path: Path, env: dict[str, str] | None = None) -> dict[str, str]:
    target = dict(os.environ if env is None else env)
    target.setdefault("HERMES_HOME", str(Path.home() / ".hermes"))
    if not path.exists():
        return target
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        target.setdefault(key, value.strip().strip('"').strip("'"))
    return target


def safe_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("—", "-")).strip()


def target_summary(case: dict[str, Any]) -> dict[str, Any]:
    gmail = case.get("gmail") or {}
    return {
        "title": safe_text(case.get("title")),
        "kind": safe_text(case.get("kind")),
        "customer": safe_text(case.get("customer") or gmail.get("from") or "unknown customer"),
        "gmail_subject": safe_text(gmail.get("subject")),
        "xero_refs": case.get("xero_refs") or [],
    }


def case_is_quoteish(case: dict[str, Any]) -> bool:
    text = " ".join([safe_text(case.get("kind")), safe_text(case.get("title")), safe_text((case.get("gmail") or {}).get("subject"))]).lower()
    return case.get("kind") in QUOTEISH_KINDS or any(term in text for term in ["quote", "invoice", "benchtop", "delivery", "xero"])


def required_sources(case: dict[str, Any], live_flags: dict[str, bool] | None = None) -> list[str]:
    required = [GMAIL_REQUIRED, TUESDAY_REQUIRED]
    flags = live_flags or {}
    if case_is_quoteish(case) or case.get("xero_refs") or flags.get(_X):
        required.append(XERO_REQUIRED)
    if case.get("quote_spine") or case.get("quote_control") or case_is_quoteish(case):
        required.append(QUOTE_SPINE_REQUIRED)
    return list(dict.fromkeys(required))


def fixture_gmail_status(case: dict[str, Any]) -> dict[str, Any]:
    gmail = case.get("gmail") or {}
    body = safe_text(gmail.get("body"))
    snippet = safe_text(gmail.get("snippet"))
    status = "collected" if body else "missing_or_partial"
    blockers = [] if body else ["fixture Gmail body is empty or snippet-only"]
    return {
        "source": "fixture",
        "status": status,
        "live_called": False,
        "subject": safe_text(gmail.get("subject")),
        "has_full_body": bool(body),
        "has_snippet": bool(snippet),
        "blockers": blockers,
    }


def fixture_tuesday_status(case: dict[str, Any]) -> dict[str, Any]:
    rows = case.get("tuesday_supabase_fixture") or []
    count = len(rows) if isinstance(rows, list) else 0
    return {
        "source": "fixture",
        "status": "collected" if count else "missing",
        "live_called": False,
        "row_count": count,
        "blockers": [] if count else ["no fixture Supabase/Tuesday row supplied"],
    }


def fixture_xero_status(case: dict[str, Any]) -> dict[str, Any]:
    fixture = case.get("xero_readback_fixture") or {}
    refs = case.get("xero_refs") or []
    available = bool(fixture.get("readback_available") or fixture.get("matches"))
    if not refs and not case_is_quoteish(case):
        return {"source": "not_required_for_fixture", "status": "not_required", "live_called": False, "blockers": []}
    return {
        "source": "fixture",
        "status": "collected" if available else "missing",
        "live_called": False,
        "refs": refs,
        "match_count": len(fixture.get("matches") or []),
        "blockers": [] if available else ["no fixture Xero quote/invoice/contact/payment readback supplied"],
    }


def fixture_quote_spine_status(case: dict[str, Any]) -> dict[str, Any]:
    spine = case.get("quote_spine") or case.get("quote_control") or {}
    if not case_is_quoteish(case) and not spine:
        return {"source": "not_required_for_fixture", "status": "not_required", "blockers": []}
    blockers: list[str] = []
    if not spine.get("available"):
        blockers.append("quote spine/calculator missing")
    if not spine.get("margin_checked"):
        blockers.append("margin check missing")
    if case_is_quoteish(case) and any(term in safe_text(case.get("title")).lower() for term in ["delivery", "benchtop", "invoice", "xero quote"]):
        if not spine.get("delivery_destination"):
            blockers.append("delivery destination missing")
    return {
        "source": "fixture",
        "status": "collected" if not blockers else "missing_or_stale",
        "margin_checked": bool(spine.get("margin_checked")),
        "delivery_destination_present": bool(spine.get("delivery_destination")),
        "blockers": blockers,
    }


def env_has_any(env: dict[str, str], keys: list[str]) -> bool:
    return any(bool(env.get(key)) for key in keys)


def live_unavailable_status(source: str, env: dict[str, str]) -> dict[str, Any]:
    if source == _G:
        configured = env_has_any(env, ["GMAIL_READONLY_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS"])
        label = "Gmail full thread/latest inbound/latest sent"
    elif source == _S:
        configured = env_has_any(env, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) and env_has_any(env, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"])
        label = "Supabase/Tuesday row"
    else:
        configured = env_has_any(env, ["XERO_ACCESS_TOKEN", "XERO_TENANT_ID"])
        label = "Xero quote/invoice/contact/payment state"
    return {
        "source": "live_readonly_requested",
        "status": "missing_adapter_or_config",
        "configured_hint_present": configured,
        "live_called": False,
        "blockers": [f"live {source_label(source)} read-only adapter not configured; {label} not collected"],
    }


def source_label(source: str) -> str:
    return { _G: "Gmail", _S: "Supabase", _X: "Xero" }.get(source, source)


def collect_readback(
    case: dict[str, Any],
    live_flags: dict[str, bool],
    env: dict[str, str],
    supabase_get_json: Any | None = None,
    gmail_client: Any | None = None,
    xero_client: Any | None = None,
) -> dict[str, Any]:
    collected = {
        "gmail": collect_gmail_readback(case, env, client=gmail_client) if live_flags.get(_G) else fixture_gmail_status(case),
        "supabase_tuesday": collect_tuesday_readback(case, env, get_json=supabase_get_json) if live_flags.get(_S) else fixture_tuesday_status(case),
        "xero": collect_xero_readback(case, env, client=xero_client) if live_flags.get(_X) else fixture_xero_status(case),
        "quote_spine_margin_delivery": fixture_quote_spine_status(case),
    }
    return collected


def status_missing(status: dict[str, Any]) -> bool:
    return status.get("status") in {"missing", "missing_or_partial", "missing_or_stale", "missing_adapter_or_config", "blocked", "error"}


def missing_sources_from(required: list[str], collected: dict[str, Any]) -> list[str]:
    mapping = {
        GMAIL_REQUIRED: "gmail",
        TUESDAY_REQUIRED: "supabase_tuesday",
        XERO_REQUIRED: "xero",
        QUOTE_SPINE_REQUIRED: "quote_spine_margin_delivery",
    }
    missing: list[str] = []
    for label in required:
        key = mapping[label]
        if status_missing(collected[key]):
            missing.append(label)
    return missing


def approval_pack(case: dict[str, Any], report_path: str) -> dict[str, str]:
    summary = target_summary(case)
    customer = summary["customer"] or "unknown customer"
    project = summary["title"] or summary["gmail_subject"] or case.get("id") or "unknown case"
    return {
        "gmail_draft_only_unsent": f"Approve creating a Gmail draft only for {customer}, unsent, using report {report_path}. No sending and no system updates.",
        "xero_draft_only_unsent": f"Approve creating a Xero DRAFT quote only for {customer}/{project}, unsent, using payload {report_path}. No sending and no system updates.",
        "separate_higher_risk_approval_required": "No sending, publishing, Xero authorisation, Supabase/Tuesday changes, Monday changes, Shopify/website changes, or payment/admin action is approved by this preflight.",
    }


def build_preflight_pack(
    case: dict[str, Any],
    live_flags: dict[str, bool] | None = None,
    env: dict[str, str] | None = None,
    report_path: str = "<report-path>",
    supabase_get_json: Any | None = None,
    gmail_client: Any | None = None,
    xero_client: Any | None = None,
) -> dict[str, Any]:
    flags = {_G: False, _S: False, _X: False, **(live_flags or {})}
    mode = "live_readonly_requested" if any(flags.values()) else "fixture_only"
    env_values = dict(os.environ if env is None else env)
    required = required_sources(case, flags)
    collected = collect_readback(case, flags, env_values, supabase_get_json=supabase_get_json, gmail_client=gmail_client, xero_client=xero_client)
    missing = missing_sources_from(required, collected)
    blocked = []
    for status in collected.values():
        blocked.extend(status.get("blockers") or [])
    if missing:
        blocked.append("blocked because required readback is missing or stale; do not guess or create a live draft")
    safe_local = not missing and not case.get("sensitive")
    if case.get("sensitive"):
        blocked.append("blocked because sensitive/admin cases cannot become local customer review drafts")
        safe_local = False
    return {
        "mode": mode,
        "case_id": case.get("id"),
        "target_summary": target_summary(case),
        "readback_required": required,
        "readback_collected": collected,
        "missing_or_stale_sources": missing,
        "safe_to_generate_local_review_draft": bool(safe_local),
        "safe_to_create_live_gmail_draft": False,
        "safe_to_create_xero_draft": False,
        "approval_pack": approval_pack(case, report_path),
        "blocked_because": list(dict.fromkeys(blocked)),
        "handoff_to_phase3": bool(safe_local),
        "local_review_label": LOCAL_REVIEW_LABEL,
    }


def markdown_report(report: dict[str, Any]) -> str:
    pack = report["preflight"]
    lines = [
        f"# Tuesday live readback preflight - {report['generated_at_utc']}",
        "",
        "Mode: preflight/read-only. No live drafts, sends, records, or external system changes were made.",
        "",
        f"- mode: `{pack['mode']}`",
        f"- case_id: `{pack['case_id']}`",
        f"- customer: {pack['target_summary']['customer']}",
        f"- safe_to_generate_local_review_draft: `{pack['safe_to_generate_local_review_draft']}`",
        f"- safe_to_create_live_gmail_draft: `{pack['safe_to_create_live_gmail_draft']}`",
        f"- safe_to_create_xero_draft: `{pack['safe_to_create_xero_draft']}`",
        f"- handoff_to_phase3: `{pack['handoff_to_phase3']}`",
        "",
        "## Readback required",
    ]
    for source in pack["readback_required"]:
        lines.append(f"- {source}")
    lines.extend(["", "## Missing or stale sources"])
    if pack["missing_or_stale_sources"]:
        for source in pack["missing_or_stale_sources"]:
            lines.append(f"- {source}")
    else:
        lines.append("- none")
    lines.extend(["", "## Source statuses"])
    for name, status in pack["readback_collected"].items():
        lines.append(f"- {name}: {status.get('status')} source={status.get('source')} live_called={status.get('live_called', False)}")
    lines.extend(["", "## Approval pack"])
    for key, phrase in pack["approval_pack"].items():
        lines.append(f"- {key}: {phrase}")
    lines.extend(["", "## Blocked because"])
    if pack["blocked_because"]:
        for reason in pack["blocked_because"]:
            lines.append(f"- {reason}")
    else:
        lines.append("- none for local review generation; live draft creation still requires exact approval")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Phase 4A read-only live readback preflight collector")
    parser.add_argument("--case-id", help="case id from fixture JSON")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES, help="fixture JSON containing cases")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="local output directory")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.local", help="optional env file for presence checks only; values are never printed")
    parser.add_argument("--live-gmail-readonly", action="store_true", help="request future Gmail GET-only adapter; fails closed if unavailable")
    parser.add_argument("--live-supabase-readonly", action="store_true", help="request future Supabase GET-only adapter; fails closed if unavailable")
    parser.add_argument("--live-xero-readonly", action="store_true", help="request future Xero GET-only adapter; fails closed if unavailable")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        cases = load_cases(args.cases)
        case = find_case(cases, args.case_id)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    env = load_env_file(args.env_file)
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / f"tuesday-live-readback-preflight-{case.get('id')}-{timestamp}.json"
    md_path = args.output_dir / f"tuesday-live-readback-preflight-{case.get('id')}-{timestamp}.md"
    flags = {
        _G: bool(args.live_gmail_readonly),
        _S: bool(args.live_supabase_readonly),
        _X: bool(args.live_xero_readonly),
    }
    pack = build_preflight_pack(case, flags, env=env, report_path=str(json_path))
    report = {
        "generated_at_utc": timestamp,
        "metadata": {
            "script": str(Path(__file__).relative_to(ROOT)),
            "cases_fixture": str(args.cases),
            "safety": "GET/read-only preflight only; default fixture-only; no live draft creation and no external writes.",
            "live_readonly_flags": flags,
        },
        "preflight": pack,
    }
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    md_path.write_text(markdown_report(report))
    print(json.dumps({"ok": True, "json": str(json_path), "markdown": str(md_path), "case_id": case.get("id"), "safe_to_generate_local_review_draft": pack["safe_to_generate_local_review_draft"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
