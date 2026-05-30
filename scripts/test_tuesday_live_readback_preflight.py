#!/usr/bin/env python3
"""Unit checks for scripts/tuesday_live_readback_preflight.py."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "tuesday_live_readback_preflight.py"
spec = importlib.util.spec_from_file_location("tuesday_live_readback_preflight", SCRIPT)
preflight = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(preflight)


def assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_in(member, container, label):
    if member not in container:
        raise AssertionError(f"{label}: expected {member!r} in {container!r}")


def assert_not_in(member, container, label):
    if member in container:
        raise AssertionError(f"{label}: did not expect {member!r} in {container!r}")


def load_case(case_id):
    cases = preflight.load_cases(preflight.DEFAULT_CASES)
    return preflight.find_case(cases, case_id)


def main():
    allowed_case = load_case("PH2-1-lead-email-reply-candidate")
    allowed_pack = preflight.build_preflight_pack(allowed_case, live_flags={})
    assert_equal(allowed_pack["mode"], "fixture_only", "default mode is fixture-only")
    assert_equal(allowed_pack["case_id"], "PH2-1-lead-email-reply-candidate", "case id preserved")
    assert_equal(allowed_pack["safe_to_generate_local_review_draft"], True, "complete lead evidence allows local review handoff")
    assert_equal(allowed_pack["handoff_to_phase3"], True, "complete lead evidence hands off to phase 3")
    assert_equal(allowed_pack["safe_to_create_live_gmail_draft"], False, "Gmail live draft creation always false")
    assert_equal(allowed_pack["safe_to_create_xero_draft"], False, "Xero live draft creation always false")
    assert_in("Gmail full thread/latest inbound/latest sent", allowed_pack["readback_required"], "Gmail readback required")
    assert_in("Supabase/Tuesday row", allowed_pack["readback_required"], "Tuesday row required")
    assert_equal(allowed_pack["readback_collected"]["gmail"]["status"], "collected", "fixture Gmail full body collected")
    assert_equal(allowed_pack["readback_collected"]["supabase_tuesday"]["status"], "collected", "fixture Tuesday row collected")
    assert_equal(allowed_pack["readback_collected"]["gmail"].get("live_called"), False, "default pack records no Gmail live call")
    assert_in("Approve creating a Gmail draft only for Renee Wilson, unsent, using report", allowed_pack["approval_pack"]["gmail_draft_only_unsent"], "approval phrase is exact and scoped")
    assert_in("No sending", allowed_pack["approval_pack"]["separate_higher_risk_approval_required"], "higher-risk approval remains separate")
    assert_not_in("send email", allowed_pack["approval_pack"]["gmail_draft_only_unsent"].lower(), "draft approval does not approve sending")

    blocked_case = load_case("PH2-2-accepted-approval-invoice-blocked")
    blocked_pack = preflight.build_preflight_pack(blocked_case, live_flags={})
    assert_equal(blocked_pack["safe_to_generate_local_review_draft"], False, "empty Gmail body blocks local review draft")
    assert_equal(blocked_pack["handoff_to_phase3"], False, "blocked case cannot hand off")
    assert_in("Gmail full thread/latest inbound/latest sent", blocked_pack["missing_or_stale_sources"], "blocked case lists missing Gmail source")
    assert_in("Supabase/Tuesday row", blocked_pack["missing_or_stale_sources"], "blocked case lists missing Tuesday source")
    assert_in("Xero quote/invoice/contact/payment state", blocked_pack["missing_or_stale_sources"], "blocked invoice case lists missing Xero source")
    assert_in("blocked", " ".join(blocked_pack["blocked_because"]).lower(), "blocked case states blocker")

    xero_case = load_case("PH2-4-xero-quote-local-brief-ready")
    xero_pack = preflight.build_preflight_pack(xero_case, live_flags={})
    assert_equal(xero_pack["safe_to_generate_local_review_draft"], True, "complete Xero fixture allows local review payload")
    assert_equal(xero_pack["safe_to_create_live_gmail_draft"], False, "complete Xero fixture still cannot create Gmail live draft")
    assert_equal(xero_pack["safe_to_create_xero_draft"], False, "complete Xero fixture still cannot create Xero draft")
    assert_in("Approve creating a Xero DRAFT quote only for Fixture Approved Quote Customer", xero_pack["approval_pack"]["xero_draft_only_unsent"], "Xero approval phrase scoped to draft only")
    assert_in("unsent", xero_pack["approval_pack"]["xero_draft_only_unsent"], "Xero approval phrase says unsent")
    assert_in("no system updates", xero_pack["approval_pack"]["xero_draft_only_unsent"], "Xero approval phrase forbids system updates")

    live_pack = preflight.build_preflight_pack(
        allowed_case,
        live_flags={"gmail": True, "supabase": True, "xero": True},
        env={}
    )
    assert_equal(live_pack["mode"], "live_readonly_requested", "live flags switch mode")
    assert_equal(live_pack["safe_to_generate_local_review_draft"], False, "unavailable live adapters fail closed")
    assert_equal(live_pack["handoff_to_phase3"], False, "live-readonly missing sources block handoff")
    assert_in("live Gmail read-only adapter not configured", " ".join(live_pack["blocked_because"]), "Gmail live missing adapter blocker")
    assert_in("Gmail full thread/latest inbound/latest sent", live_pack["missing_or_stale_sources"], "live missing Gmail listed")
    assert_in("Supabase/Tuesday row", live_pack["missing_or_stale_sources"], "live missing Supabase listed")
    assert_in("Xero quote/invoice/contact/payment state", live_pack["missing_or_stale_sources"], "live missing Xero listed")

    source = SCRIPT.read_text().lower()
    for forbidden in preflight.FORBIDDEN_MUTATION_TOKENS:
        assert_not_in(forbidden, source, f"new script excludes mutation token {forbidden}")

    print("ok: tuesday_live_readback_preflight unit checks passed")


if __name__ == "__main__":
    main()
