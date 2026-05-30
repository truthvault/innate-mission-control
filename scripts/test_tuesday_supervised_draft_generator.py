#!/usr/bin/env python3
"""Unit checks for scripts/tuesday_supervised_draft_generator.py."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "tuesday_supervised_draft_generator.py"
spec = importlib.util.spec_from_file_location("tuesday_supervised_draft_generator", SCRIPT)
generator = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(generator)


def assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_in(member, container, label):
    if member not in container:
        raise AssertionError(f"{label}: expected {member!r} in {container!r}")


def make_gate_case(case_id, draft_allowed=True, draft_type="email_reply", decision="ready_for_guido_review", missing=None, evidence=None, title="fixture"):
    return {
        "id": case_id,
        "title": title,
        "draft_allowed": draft_allowed,
        "draft_type": draft_type,
        "decision": decision,
        "missing_sources": missing or [],
        "unsafe_claims_to_avoid": ["Do not promise lead time."],
        "required_human_approval_before": ["create_gmail_draft", "send_email"],
        "draft_brief": {
            "case_id": case_id,
            "draft_type": draft_type,
            "facts_may_use": ["Use only fixture full Gmail body and Tuesday row."],
            "must_not_invent": ["pricing, GST, delivery, lead time, production status"],
            "source_summary": {"gmail_subject": "Dining table enquiry"},
        },
        "readback": {
            "id": case_id,
            "title": title,
            "safe_next_action": "Draft only after review. Do not send.",
            "evidence": evidence or {
                "gmail": {
                    "subject": "Dining table enquiry",
                    "from": "Renee Fixture",
                    "body": "Hi Innate, we are looking for a 2200 x 1000 dining table in rimu or red beech. Could you let us know the best next step? Thanks, Renee",
                },
                "tuesday_supabase": {"available": True, "rows": [{"table": "leads", "customer_name": "Renee Fixture", "status": "new", "source": "fixture_only"}]},
                "xero": {"matches": [], "same_contact_sample": []},
                "quote_spine": {},
            },
        },
    }


def main():
    blocked = generator.build_draft_package(
        make_gate_case(
            "blocked-quote",
            draft_allowed=False,
            draft_type="none",
            decision="blocked_quote_control_missing",
            missing=["quote spine/calculator", "margin check"],
            title="Benchtop quote missing control",
        )
    )
    assert_equal(blocked["blocked"], True, "blocked case stays blocked")
    assert_equal("draft" in blocked, False, "blocked case does not include customer draft")
    assert_in("quote spine/calculator", blocked["missing_sources"], "blocked missing sources preserved")
    assert_in(generator.LOCAL_REVIEW_LABEL, blocked["label"], "blocked output labelled local review")

    lead = generator.build_draft_package(make_gate_case("lead-ok"))
    assert_equal(lead["blocked"], False, "allowed lead package is not blocked")
    assert_equal(lead["draft_type"], "email_reply", "lead draft type")
    assert_in(generator.LOCAL_REVIEW_LABEL, lead["label"], "lead output labelled local review")
    assert_in("LOCAL REVIEW DRAFT ONLY", lead["customer_facing_draft"], "lead customer text labelled")
    assert_in("not created in gmail", lead["approval_required_before_live_action"].lower(), "lead requires approval before Gmail draft")
    assert_equal("—" in lead["customer_facing_draft"], False, "lead draft has no em dash")
    lint = generator.lint_package(lead)
    assert_equal(lint["ok"], True, "lead package passes lint")

    xero = generator.build_draft_package(
        make_gate_case(
            "xero-ready",
            draft_type="xero_quote",
            title="Xero quote draft local brief",
            evidence={
                "gmail": {"subject": "Please prepare quote", "from": "Fixture Customer", "body": "Please prepare the formal quote."},
                "tuesday_supabase": {"available": True, "rows": [{"table": "orders", "customer_name": "Fixture Customer", "status": "quote_approved", "source": "fixture_only"}]},
                "xero": {"matches": [{"number": "DRAFT-LOCAL-ONLY", "status": "LOCAL_FIXTURE_ONLY", "contact": "Fixture Customer", "type": "quote"}], "same_contact_sample": []},
                "quote_spine": {
                    "available": True,
                    "margin_checked": True,
                    "delivery_destination": "Christchurch",
                    "gst_mode": "ex_gst_plus_gst",
                    "line_items": [
                        {
                            "title": "Dining table",
                            "dimensions": "2400 x 1000",
                            "timber": "red beech",
                            "finish": "clear oil",
                            "base": "steel Crossroads base",
                            "quantity": 1,
                            "unit_amount_ex_gst": 5200,
                        }
                    ],
                    "terms": "Fixture terms only. Deposit/payment terms require Guido approval before live Xero draft creation.",
                },
            },
        )
    )
    assert_equal(xero["blocked"], False, "allowed Xero package is not blocked")
    assert_equal(xero["draft_type"], "xero_quote", "Xero draft type")
    assert_equal("customer_facing_draft" in xero, False, "Xero case has payload preview, not email prose")
    assert_in("payload_preview", xero, "Xero package includes payload preview")
    assert_in("line_items", xero["payload_preview"], "Xero preview includes line items")
    assert_in("LOCAL REVIEW DRAFT ONLY", xero["payload_preview"]["label"], "Xero preview labelled")
    assert_in("approval required before Xero DRAFT creation", xero["approval_required_before_live_action"], "Xero creation approval required")
    assert_equal(generator.lint_package(xero)["ok"], True, "Xero package passes lint")

    missing_quote = generator.build_draft_package(
        make_gate_case(
            "quote-missing-spine",
            draft_allowed=False,
            draft_type="none",
            decision="blocked_quote_control_missing",
            missing=["quote spine/calculator"],
            title="Quote draft without spine",
        )
    )
    assert_equal(missing_quote["blocked"], True, "missing quote spine prevents quote draft")
    assert_equal("payload_preview" in missing_quote, False, "missing quote spine prevents payload preview")

    print("ok: tuesday_supervised_draft_generator unit checks passed")


if __name__ == "__main__":
    main()
