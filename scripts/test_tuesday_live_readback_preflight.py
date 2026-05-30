#!/usr/bin/env python3
"""Unit checks for scripts/tuesday_live_readback_preflight.py."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "tuesday_live_readback_preflight.py"
spec = importlib.util.spec_from_file_location("tuesday_live_readback_preflight", SCRIPT)
preflight = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(preflight)

ADAPTER = ROOT / "scripts" / "tuesday_supabase_readonly_adapter.py"
adapter_spec = importlib.util.spec_from_file_location("tuesday_supabase_readonly_adapter", ADAPTER)
supabase_adapter = importlib.util.module_from_spec(adapter_spec)
assert adapter_spec and adapter_spec.loader
adapter_spec.loader.exec_module(supabase_adapter)


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


class FakeSupabaseGetter:
    def __init__(self):
        self.calls = []

    def __call__(self, url, *, headers, timeout=20):
        self.calls.append({"url": url, "headers": dict(headers), "timeout": timeout})
        if "/rest/v1/leads?" in url:
            return [
                {
                    "id": "lead-123",
                    "customer_name": "Renee Wilson",
                    "email": "renee@example.test",
                    "status": "new",
                    "priority": "hot",
                    "monday_item_id": "555111",
                    "next_action": "Reply with next step",
                    "updated_at": "2026-05-30T01:02:03Z",
                    "notes": "Sensitive longer note should not be dumped in full.",
                }
            ]
        if "/rest/v1/orders?" in url:
            return [
                {
                    "id": "order-456",
                    "order_code": "INN-456",
                    "customer_name": "Renee Wilson",
                    "status": "awaiting_payment",
                    "xero_invoice_number": "INV-9999",
                }
            ]
        if "/rest/v1/order_links?" in url:
            return [{"id": "link-1", "lead_id": "lead-123", "order_id": "order-456", "link_type": "converted"}]
        if "/rest/v1/order_financial_documents?" in url:
            return [{"id": "doc-1", "order_id": "order-456", "xero_invoice_number": "INV-9999", "status": "AUTHORISED"}]
        if "/rest/v1/order_payments?" in url:
            return [{"id": "pay-1", "order_id": "order-456", "match_status": "matched", "amount": 123.45}]
        raise AssertionError(f"unexpected URL {url}")


def live_case_with_inputs():
    case = dict(load_case("PH2-1-lead-email-reply-candidate"))
    case["email"] = "renee@example.test"
    case["lead_id"] = "lead-123"
    case["order_id"] = "order-456"
    case["monday_item_id"] = "555111"
    case["xero_refs"] = ["INV-9999"]
    return case


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
    assert_equal(allowed_pack["readback_collected"]["supabase_tuesday"].get("live_called"), False, "default pack records no Supabase live call")
    assert_equal(allowed_pack["readback_collected"]["supabase_tuesday"].get("source"), "fixture", "fixture-only Supabase source unchanged")
    assert_equal(allowed_pack["readback_collected"]["supabase_tuesday"].get("row_count"), 1, "fixture-only row count unchanged")
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

    fake_get = FakeSupabaseGetter()
    secret = "supabase-service-role-secret-do-not-print"
    live_supabase_pack = preflight.build_preflight_pack(
        live_case_with_inputs(),
        live_flags={"supabase": True},
        env={"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": secret},
        supabase_get_json=fake_get,
    )
    status = live_supabase_pack["readback_collected"]["supabase_tuesday"]
    assert_equal(status["source"], "supabase", "live Supabase source recorded")
    assert_equal(status["status"], "collected", "live Supabase summarizes matches")
    assert_equal(status["live_called"], True, "live Supabase records live call")
    assert_equal(status["row_counts"]["leads"], 1, "live Supabase lead count bounded")
    assert_equal(status["row_counts"]["orders"], 1, "live Supabase order count bounded")
    assert_equal(status["lead"]["id"], "lead-123", "lead identifier summarized")
    assert_equal(status["order"]["id"], "order-456", "order identifier summarized")
    assert_equal(status["financial_documents"][0]["xero_invoice_number"], "INV-9999", "financial doc summary bounded")
    assert_equal(len(fake_get.calls) > 0, True, "live Supabase called fake network when configured")
    for call in fake_get.calls:
        assert_in("/rest/v1/", call["url"], "Supabase REST endpoint used")
        assert_not_in("method", call, "fake getter does not receive a mutating method option")
    report_text = json.dumps(live_supabase_pack, sort_keys=True)
    assert_not_in(secret, report_text, "Supabase service key not included in preflight pack")
    assert_not_in("Bearer", report_text, "Bearer strings not included in preflight pack")
    assert_not_in("apikey", report_text, "apikey header not included in preflight pack")
    assert_not_in("Sensitive longer note", report_text, "broad notes/customer dumps not included in preflight pack")

    missing_inputs_fake = FakeSupabaseGetter()
    no_input_pack = preflight.build_preflight_pack(
        {"id": "no-live-inputs", "title": "No identifiers", "gmail": {"body": "fixture"}},
        live_flags={"supabase": True},
        env={"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": secret},
        supabase_get_json=missing_inputs_fake,
    )
    no_input_status = no_input_pack["readback_collected"]["supabase_tuesday"]
    assert_equal(no_input_status["status"], "missing", "missing identifiers fail closed")
    assert_equal(no_input_status["live_called"], False, "missing identifiers do not call network")
    assert_equal(missing_inputs_fake.calls, [], "no network calls without inputs")

    missing_config_fake = FakeSupabaseGetter()
    no_config_pack = preflight.build_preflight_pack(
        live_case_with_inputs(),
        live_flags={"supabase": True},
        env={"SUPABASE_URL": "https://example.supabase.co"},
        supabase_get_json=missing_config_fake,
    )
    no_config_status = no_config_pack["readback_collected"]["supabase_tuesday"]
    assert_equal(no_config_status["status"], "missing_adapter_or_config", "missing config fails closed like Phase 4A")
    assert_equal(no_config_status["live_called"], False, "missing config does not call network")
    assert_equal(missing_config_fake.calls, [], "no network calls without complete config")

    script_source = SCRIPT.read_text().lower()
    adapter_source = ADAPTER.read_text().lower()
    for forbidden in preflight.FORBIDDEN_MUTATION_TOKENS:
        assert_not_in(forbidden, script_source, f"preflight script excludes mutation token {forbidden}")
    for forbidden in supabase_adapter.FORBIDDEN_MUTATION_TOKENS:
        assert_not_in(forbidden, adapter_source, f"Supabase adapter excludes mutation token {forbidden}")
    combined_source = script_source + "\n" + adapter_source
    for forbidden_name in ["post", "patch", "put", "delete", "upsert", "insert", "update", "rpc"]:
        assert_not_in(f"def {forbidden_name}", combined_source, f"adapter exposes no {forbidden_name} helper")

    print("ok: tuesday_live_readback_preflight unit checks passed")


if __name__ == "__main__":
    main()
