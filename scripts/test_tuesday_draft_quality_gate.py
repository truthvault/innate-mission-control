#!/usr/bin/env python3
"""Unit checks for scripts/tuesday_draft_quality_gate.py."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "tuesday_draft_quality_gate.py"
spec = importlib.util.spec_from_file_location("tuesday_draft_quality_gate", SCRIPT)
gate = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(gate)


def assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_in(member, container, label):
    if member not in container:
        raise AssertionError(f"{label}: expected {member!r} in {container!r}")


def make_readback(case_id, status="reply_needed", conflicts=None, blocked=None, evidence=None, title="case"):
    return {
        "id": case_id,
        "title": title,
        "status": status,
        "conflicts": conflicts or [],
        "blocked_because": blocked or [],
        "safe_next_action": "fixture",
        "confidence": 0.75,
        "evidence": evidence
        or {
            "gmail": {"body": "Full customer email body", "partial_evidence": False},
            "tuesday_supabase": {"available": True, "rows": [{"table": "leads", "status": "new"}]},
            "xero": {"matches": [], "same_contact_sample": []},
            "monday_optional": {"available": False},
        },
    }


def main():
    result = gate.evaluate_readback_case(
        make_readback(
            "lead-ok",
            title="lead email reply candidate",
            evidence={
                "gmail": {"body": "Hi, can you help with a 2200 x 1000 table?", "partial_evidence": False},
                "tuesday_supabase": {"available": True, "rows": [{"table": "leads", "customer_name": "Renee", "status": "new"}]},
                "xero": {"matches": [], "same_contact_sample": []},
                "monday_optional": {"available": False},
            },
        )
    )
    assert_equal(result["draft_allowed"], True, "lead with full Gmail and Tuesday readback may get internal draft")
    assert_equal(result["draft_type"], "email_reply", "lead reply draft type")
    assert_equal(result["decision"], "ready_for_guido_review", "lead ready decision")
    assert_equal(result["customer_visible_promises_allowed"], False, "customer promises stay blocked")
    assert_in("send_email", result["required_human_approval_before"], "email send requires approval")

    result = gate.evaluate_readback_case(
        make_readback(
            "snippet-block",
            status="source_of_truth_unavailable",
            conflicts=["gmail_body_empty_or_snippet_only", "tuesday_supabase_readback_missing"],
            evidence={
                "gmail": {"snippet": "Need a quote", "body": "", "partial_evidence": True},
                "tuesday_supabase": {"available": False, "rows": []},
                "xero": {"matches": [], "same_contact_sample": []},
                "monday_optional": {"available": False},
            },
        )
    )
    assert_equal(result["draft_allowed"], False, "snippet and missing Tuesday fail closed")
    assert_equal(result["decision"], "blocked_needs_full_gmail", "full Gmail required first")
    assert_in("Gmail full body/thread", result["missing_sources"], "missing Gmail source listed")
    assert_in("Supabase/Tuesday row", result["missing_sources"], "missing Tuesday source listed")

    result = gate.evaluate_readback_case(
        make_readback(
            "quote-conflict",
            status="already_handled",
            conflicts=["xero_quote_status_conflicts_with_paid_invoice"],
        )
    )
    assert_equal(result["draft_allowed"], False, "Xero conflict blocks quote follow-up")
    assert_equal(result["draft_type"], "none", "no draft for conflict")
    assert_equal(result["decision"], "already_handled", "conflict treated as handled/blocker")
    assert_in("Do not say the quote is still awaiting acceptance", result["unsafe_claims_to_avoid"], "quote conflict unsafe claim")

    result = gate.evaluate_readback_case(make_readback("supplier", status="supplier_cost_evidence"))
    assert_equal(result["draft_allowed"], False, "supplier evidence cannot produce customer price draft")
    assert_equal(result["decision"], "supplier_cost_evidence_only", "supplier decision")
    assert_in("Do not turn supplier costs into customer pricing", result["unsafe_claims_to_avoid"], "supplier unsafe claim")

    result = gate.evaluate_readback_case(
        make_readback(
            "quote-missing-margin",
            title="benchtop/customer quote reply needing quote-control and margin gate",
            evidence={
                "gmail": {"body": "Please quote a benchtop delivered to Wanaka", "partial_evidence": False},
                "tuesday_supabase": {"available": True, "rows": [{"table": "leads", "status": "quoting"}]},
                "xero": {"matches": [], "same_contact_sample": []},
                "monday_optional": {"available": False},
            },
        )
    )
    assert_equal(result["draft_allowed"], False, "quote reply without quote spine/margin fails closed")
    assert_equal(result["decision"], "blocked_quote_control_missing", "quote-control blocker")
    assert_in("quote spine/calculator", result["missing_sources"], "quote spine required")
    assert_in("margin check", result["missing_sources"], "margin check required")

    result = gate.evaluate_readback_case(make_readback("security", status="risky_sensitive"))
    assert_equal(result["draft_allowed"], False, "security/admin must not be warm reply")
    assert_equal(result["decision"], "blocked_sensitive_admin", "security/admin decision")
    assert_equal(result["draft_type"], "internal_note", "security can only be internal note")

    result = gate.evaluate_readback_case(make_readback("xero-quote-ready", title="xero quote draft", evidence={
        "gmail": {"body": "Approved, please prepare the quote", "partial_evidence": False},
        "tuesday_supabase": {"available": True, "rows": [{"table": "orders", "status": "quote_approved"}]},
        "xero": {"matches": [], "same_contact_sample": []},
        "quote_spine": {"available": True, "margin_checked": True, "delivery_destination": "Christchurch", "gst_mode": "ex_gst_plus_gst"},
        "sent_history": {"available": True},
        "monday_optional": {"available": False},
    }))
    assert_equal(result["draft_allowed"], True, "complete quote-control can produce local Xero quote draft brief")
    assert_equal(result["draft_type"], "xero_quote", "Xero quote draft type")
    assert_in("create_xero_draft", result["required_human_approval_before"], "Xero creation requires explicit approval")
    assert_in("Use Innate Xero line style", result["draft_brief"]["must_follow"], "Xero line style required")

    print("ok: tuesday_draft_quality_gate unit checks passed")


if __name__ == "__main__":
    main()
