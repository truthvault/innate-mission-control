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

GMAIL_ADAPTER = ROOT / "scripts" / "tuesday_gmail_readonly_adapter.py"
gmail_adapter_spec = importlib.util.spec_from_file_location("tuesday_gmail_readonly_adapter", GMAIL_ADAPTER)
gmail_adapter = importlib.util.module_from_spec(gmail_adapter_spec)
assert gmail_adapter_spec and gmail_adapter_spec.loader
gmail_adapter_spec.loader.exec_module(gmail_adapter)

XERO_ADAPTER = ROOT / "scripts" / "tuesday_xero_readonly_adapter.py"
xero_adapter_spec = importlib.util.spec_from_file_location("tuesday_xero_readonly_adapter", XERO_ADAPTER)
xero_adapter = importlib.util.module_from_spec(xero_adapter_spec)
assert xero_adapter_spec and xero_adapter_spec.loader
xero_adapter_spec.loader.exec_module(xero_adapter)


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


def gmail_message(msg_id, thread_id, from_value, subject, body, *, date="Sat, 30 May 2026 10:00:00 +1200", labels=None):
    encoded = gmail_adapter.encode_body_for_test(body)
    return {
        "id": msg_id,
        "threadId": thread_id,
        "internalDate": "1780092000000" if msg_id.endswith("1") else "1780095600000",
        "labelIds": labels or [],
        "snippet": body[:80],
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": from_value},
                {"name": "To", "value": "hello@innatefurniture.co.nz"},
                {"name": "Date", "value": date},
                {"name": "Subject", "value": subject},
            ],
            "body": {"data": encoded},
        },
    }


class FakeGmailExecute:
    def __init__(self, owner, result):
        self.owner = owner
        self.result = result

    def execute(self):
        self.owner.calls.append(dict(self.owner.pending_call))
        return self.result


class FakeGmailMessages:
    def __init__(self, owner):
        self.owner = owner

    def list(self, **kwargs):
        self.owner.pending_call = {"kind": "messages.list", "kwargs": kwargs}
        return FakeGmailExecute(self.owner, {"messages": [{"id": "m1", "threadId": "thread-1"}], "resultSizeEstimate": 1})

    def get(self, **kwargs):
        self.owner.pending_call = {"kind": "messages.get", "kwargs": kwargs}
        message = self.owner.messages[kwargs["id"]]
        return FakeGmailExecute(self.owner, message)


class FakeGmailThreads:
    def __init__(self, owner):
        self.owner = owner

    def get(self, **kwargs):
        self.owner.pending_call = {"kind": "threads.get", "kwargs": kwargs}
        return FakeGmailExecute(self.owner, {"id": kwargs["id"], "messages": list(self.owner.messages.values())})


class FakeGmailUsers:
    def __init__(self, owner):
        self.owner = owner

    def messages(self):
        return FakeGmailMessages(self.owner)

    def threads(self):
        return FakeGmailThreads(self.owner)


class FakeGmailClient:
    def __init__(self, messages):
        self.messages = messages
        self.calls = []
        self.pending_call = {}

    def users(self):
        return FakeGmailUsers(self)


class FakeXeroReadOnlyClient:
    def __init__(self):
        self.calls = []

    def get(self, path, params=None):
        params = dict(params or {})
        self.calls.append({"path": path, "params": params})
        if path == "/Invoices":
            return {
                "Invoices": [
                    {
                        "InvoiceID": "invoice-secret-id-not-output",
                        "InvoiceNumber": "INV-9999",
                        "Reference": "INN-456",
                        "Status": "PAID",
                        "DateString": "2026-05-29",
                        "DueDateString": "2026-06-05",
                        "Total": 1234.56,
                        "AmountPaid": 1234.56,
                        "AmountDue": 0,
                        "Contact": {"ContactID": "contact-secret-id-not-output", "Name": "Renee Wilson", "EmailAddress": "renee@example.test"},
                        "Payments": [{"PaymentID": "pay-secret-id-not-output", "Date": "2026-05-30", "Amount": 1234.56}],
                        "LineItems": [{"Description": "Very long private line dump " * 40, "Quantity": 99}],
                    }
                ]
            }
        if path == "/Contacts":
            return {"Contacts": [{"ContactID": "contact-secret-id-not-output", "Name": "Renee Wilson", "EmailAddress": "renee@example.test", "ContactStatus": "ACTIVE"}]}
        if path == "/Quotes":
            return {"Quotes": [{"QuoteID": "quote-secret-id-not-output", "QuoteNumber": "QU-0114", "Reference": "INN-456", "Status": "ACCEPTED", "Total": 1200.0, "Contact": {"Name": "Renee Wilson"}}]}
        raise AssertionError(f"unexpected Xero path {path}")


def fake_gmail_client_with_thread():
    inbound = gmail_message(
        "m1",
        "thread-1",
        "Mara Fitzgerald <mara@example.test>",
        "Re: Quote approval",
        "Approved, please go ahead and invoice us. This full body clears the snippet-only blocker. " + "extra " * 80,
        labels=["INBOX"],
    )
    sent = gmail_message(
        "m2",
        "thread-1",
        "Guido <hello@innatefurniture.co.nz>",
        "Re: Quote approval",
        "Thanks Mara, we will sort the next step.",
        date="Sat, 30 May 2026 11:00:00 +1200",
        labels=["SENT"],
    )
    sent["internalDate"] = "1780095600000"
    return FakeGmailClient({"m1": inbound, "m2": sent})


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

    fake_gmail = fake_gmail_client_with_thread()
    live_gmail_case = dict(blocked_case)
    live_gmail_case["gmail"] = dict(blocked_case["gmail"])
    live_gmail_case["gmail"]["thread_id"] = "thread-1"
    live_gmail_case["email"] = "mara@example.test"
    live_gmail_pack = preflight.build_preflight_pack(
        live_gmail_case,
        live_flags={"gmail": True},
        env={},
        gmail_client=fake_gmail,
    )
    gmail_status = live_gmail_pack["readback_collected"]["gmail"]
    assert_equal(gmail_status["source"], "gmail", "live Gmail source recorded")
    assert_equal(gmail_status["status"], "collected", "live Gmail full body clears Gmail source")
    assert_equal(gmail_status["live_called"], True, "live Gmail fake client called")
    assert_equal(gmail_status["thread_id"], "thread-1", "thread id summarized")
    assert_equal(gmail_status["message_count"], 2, "thread message count summarized")
    assert_equal(gmail_status["latest_inbound"]["id"], "m1", "latest inbound summarized")
    assert_equal(gmail_status["latest_inbound"]["body_present"], True, "latest inbound body presence summarized")
    assert_equal(gmail_status["latest_sent"]["id"], "m2", "latest sent summarized")
    assert_equal(gmail_status["has_newer_sent_reply"], True, "sent-after-inbound detected")
    assert_not_in("fixture Gmail body is empty or snippet-only", " ".join(live_gmail_pack["blocked_because"]), "live body clears snippet-only blocker")
    assert_equal(live_gmail_pack["safe_to_create_live_gmail_draft"], False, "live Gmail evidence never enables live draft creation")
    for call in fake_gmail.calls:
        assert_in(call["kind"], ["threads.get"], "live Gmail uses thread GET only when thread id supplied")
        assert_equal(call["kwargs"].get("userId"), "me", "Gmail user scoped to me")
    gmail_report_text = json.dumps(live_gmail_pack, sort_keys=True)
    assert_not_in("extra " * 50, gmail_report_text, "full unbounded Gmail body not dumped")
    assert_not_in("Bearer", gmail_report_text, "Gmail report excludes bearer strings")
    assert_not_in("token", gmail_report_text.lower(), "Gmail report excludes token strings")

    fake_missing = fake_gmail_client_with_thread()
    missing_gmail_pack = preflight.build_preflight_pack(
        {"id": "no-gmail-live-inputs", "title": "No Gmail identifiers", "gmail": {"body": "fixture"}},
        live_flags={"gmail": True},
        env={"GOOGLE_TOKEN_PATH": "/tmp/fake-google-token.json"},
        gmail_client=fake_missing,
    )
    missing_gmail_status = missing_gmail_pack["readback_collected"]["gmail"]
    assert_equal(missing_gmail_status["status"], "missing", "missing Gmail identifiers fail closed")
    assert_equal(missing_gmail_status["live_called"], False, "missing Gmail identifiers do not call network")
    assert_equal(fake_missing.calls, [], "no Gmail network calls without narrow identifiers")

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

    fake_xero = FakeXeroReadOnlyClient()
    live_xero_case = live_case_with_inputs()
    live_xero_case["xero_refs"] = ["INV-9999", "QU-0114"]
    live_xero_case["quote_number"] = "QU-0114"
    live_xero_pack = preflight.build_preflight_pack(
        live_xero_case,
        live_flags={"xero": True},
        env={},
        xero_client=fake_xero,
    )
    xero_status = live_xero_pack["readback_collected"]["xero"]
    assert_equal(xero_status["source"], "xero", "live Xero source recorded")
    assert_equal(xero_status["status"], "collected", "live Xero summarizes matches")
    assert_equal(xero_status["live_called"], True, "live Xero fake client called")
    assert_equal(xero_status["row_counts"]["invoices"], 1, "live Xero invoice count bounded")
    assert_equal(xero_status["row_counts"]["quotes"], 1, "live Xero quote count bounded")
    assert_equal(xero_status["row_counts"]["contacts"], 1, "live Xero contact count bounded")
    assert_equal(xero_status["invoices"][0]["invoice_number"], "INV-9999", "invoice number summarized")
    assert_equal(xero_status["invoices"][0]["amount_paid"], 1234.56, "payment evidence summarized from invoice")
    assert_equal(xero_status["payments_evidence"][0]["payment_count"], 1, "payment count summarized without dumping payment ids")
    assert_equal(xero_status["quotes"][0]["quote_number"], "QU-0114", "quote number summarized")
    assert_equal(xero_status["contact"]["name"], "Renee Wilson", "contact summarized")
    assert_equal(len(fake_xero.calls), 3, "live Xero uses bounded invoice/contact/quote reads")
    for call in fake_xero.calls:
        assert_in(call["path"], ["/Invoices", "/Contacts", "/Quotes"], "Xero accounting path allowlisted")
        assert_not_in("method", call, "fake Xero client does not receive mutating method option")
        assert_equal(call["params"].get("page"), "1", "Xero reads are first-page bounded")
    xero_report_text = json.dumps(live_xero_pack, sort_keys=True)
    for secretish in ["invoice-secret-id-not-output", "contact-secret-id-not-output", "quote-secret-id-not-output", "pay-secret-id-not-output"]:
        assert_not_in(secretish, xero_report_text, "Xero internal ids not included in preflight pack")
    assert_not_in("Very long private line dump", xero_report_text, "unbounded Xero line items not dumped")
    for forbidden_secret in ["Bearer", "Basic", "token", "client_secret", "xero-tenant-id"]:
        assert_not_in(forbidden_secret.lower(), xero_report_text.lower(), f"Xero report excludes {forbidden_secret}")

    missing_xero_fake = FakeXeroReadOnlyClient()
    no_xero_inputs_pack = preflight.build_preflight_pack(
        {"id": "no-xero-live-inputs", "title": "No Xero identifiers", "gmail": {"body": "fixture"}},
        live_flags={"xero": True},
        env={"XERO_CLIENT_ID": "cid", "XERO_CLIENT_SECRET": "secret"},
        xero_client=missing_xero_fake,
    )
    no_xero_inputs_status = no_xero_inputs_pack["readback_collected"]["xero"]
    assert_equal(no_xero_inputs_status["status"], "missing", "missing Xero identifiers fail closed")
    assert_equal(no_xero_inputs_status["live_called"], False, "missing Xero identifiers do not call accounting endpoints")
    assert_equal(missing_xero_fake.calls, [], "no Xero accounting calls without narrow identifiers")

    missing_xero_config_fake = FakeXeroReadOnlyClient()
    no_xero_config_pack = preflight.build_preflight_pack(
        live_xero_case,
        live_flags={"xero": True},
        env={"XERO_CLIENT_ID": "cid"},
        xero_client=None,
    )
    no_xero_config_status = no_xero_config_pack["readback_collected"]["xero"]
    assert_equal(no_xero_config_status["status"], "missing_adapter_or_config", "missing Xero config fails closed like Phase 4A")
    assert_equal(no_xero_config_status["live_called"], False, "missing Xero config does not call accounting endpoints")
    assert_equal(missing_xero_config_fake.calls, [], "unused fake has no calls")

    script_source = SCRIPT.read_text().lower()
    adapter_source = ADAPTER.read_text().lower()
    gmail_adapter_source = GMAIL_ADAPTER.read_text().lower()
    xero_adapter_source = XERO_ADAPTER.read_text().lower()
    for forbidden in preflight.FORBIDDEN_MUTATION_TOKENS:
        assert_not_in(forbidden, script_source, f"preflight script excludes mutation token {forbidden}")
    for forbidden in supabase_adapter.FORBIDDEN_MUTATION_TOKENS:
        assert_not_in(forbidden, adapter_source, f"Supabase adapter excludes mutation token {forbidden}")
    for forbidden in gmail_adapter.FORBIDDEN_MUTATION_TOKENS:
        assert_not_in(forbidden, gmail_adapter_source, f"Gmail adapter excludes mutation token {forbidden}")
    for forbidden in xero_adapter.FORBIDDEN_ACCOUNTING_MUTATION_TOKENS:
        assert_not_in(forbidden, xero_adapter_source, f"Xero adapter excludes accounting mutation token {forbidden}")
    combined_source = script_source + "\n" + adapter_source + "\n" + gmail_adapter_source + "\n" + xero_adapter_source
    for forbidden_name in ["post", "patch", "put", "delete", "upsert", "insert", "update", "rpc"]:
        assert_not_in(f"def {forbidden_name}", combined_source, f"adapter exposes no {forbidden_name} helper")
    for forbidden_name in ["send", "reply", "modify", "trash", "delete"]:
        assert_not_in(f"def {forbidden_name}", gmail_adapter_source, f"Gmail adapter exposes no {forbidden_name} helper")
        assert_not_in("." + forbidden_name + "(", gmail_adapter_source, f"Gmail adapter cannot reach {forbidden_name} call")
    for broad_import in ["google_api", "innate_gmail_supabase_watchdog", "lead_source_of_truth_reconciliation_readonly"]:
        assert_not_in(broad_import, script_source, f"preflight does not import broad Gmail helper {broad_import}")
        assert_not_in(broad_import, gmail_adapter_source, f"Gmail adapter does not import broad Gmail helper {broad_import}")
    for forbidden_name in ["create", "approve", "void"]:
        assert_not_in(f"def {forbidden_name}", xero_adapter_source, f"Xero adapter exposes no {forbidden_name} helper")
        assert_not_in("." + forbidden_name + "(", xero_adapter_source, f"Xero adapter cannot reach {forbidden_name} call")
    for forbidden_path in ["/invoices/", "/quotes/", "/payments"]:
        assert_not_in(forbidden_path, xero_adapter_source, f"Xero adapter avoids mutation-prone item/payment path {forbidden_path}")
    assert_in("token", xero_adapter_source, "Xero adapter may include isolated auth token exchange")
    assert_in("identity.xero.com/connect/token", xero_adapter_source, "Xero auth token endpoint is isolated from accounting reads")
    assert_in("api.xero.com/api.xro/2.0", xero_adapter_source, "Xero accounting base is separate from token endpoint")

    print("ok: tuesday_live_readback_preflight unit checks passed")


if __name__ == "__main__":
    main()
