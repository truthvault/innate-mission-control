#!/usr/bin/env python3
"""Unit checks for scripts/tuesday_source_readback_harness.py."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "tuesday_source_readback_harness.py"
spec = importlib.util.spec_from_file_location("tuesday_source_readback_harness", SCRIPT)
harness = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(harness)


def run_case(case, cache=None):
    return harness.evaluate_case(case, cache or {}, live_supabase=False)


def assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def main():
    result = run_case(
        {
            "id": "snippet",
            "title": "snippet-only login admin",
            "sensitive": True,
            "gmail": {"subject": "New sign-in", "snippet": "Unknown browser", "body": ""},
        }
    )
    assert_equal(result["status"], "risky_sensitive", "security/admin classification")
    assert "gmail_body_empty_or_snippet_only" in result["conflicts"]

    result = run_case(
        {
            "id": "supplier",
            "kind": "supplier_bill",
            "title": "Westimber bill",
            "gmail": {"body": "fixture"},
        }
    )
    assert_equal(result["status"], "supplier_cost_evidence", "supplier bill classification")

    result = run_case(
        {
            "id": "old",
            "kind": "historical_quote",
            "title": "Old quote",
            "quote_date": "2021-07-09",
            "gmail": {"body": "fixture"},
        }
    )
    assert_equal(result["status"], "precedent_only", "old quote classification")

    result = run_case(
        {
            "id": "sent",
            "title": "latest sent supersedes inbound",
            "latest_sent_after_inbound": True,
            "gmail": {"body": "fixture"},
            "tuesday_supabase_fixture": [{"table": "leads", "status": "quoted"}],
        }
    )
    assert_equal(result["status"], "already_handled", "latest sent classification")

    cache = {
        "sentQuotes": [{"number": "QU-0114", "contact": "Janette and Michael Sharp", "status": "SENT", "total": 3260}],
        "recentPaidCustomerInvoices": [
            {"number": "INV-1143", "contact": "Janette and Michael Sharp", "status": "PAID", "total": 3260, "paid": 3260, "reference": "QU-0114 accepted - Janette and Michael Sharp dining table"}
        ],
    }
    result = run_case(
        {
            "id": "conflict",
            "title": "quote conflicts with paid invoice",
            "customer": "Janette and Michael Sharp",
            "xero_refs": ["QU-0114"],
            "gmail": {"body": "fixture"},
        },
        cache,
    )
    assert_equal(result["status"], "source_of_truth_unavailable", "xero conflict without Tuesday classification")
    assert "xero_quote_status_conflicts_with_paid_invoice" in result["conflicts"]

    result = run_case(
        {
            "id": "ops",
            "title": "stocktake",
            "monday_ops_island": True,
            "gmail": {"body": "fixture"},
        }
    )
    assert_equal(result["status"], "ops_island_monday", "Monday ops island classification")

    print("ok: tuesday_source_readback_harness unit checks passed")


if __name__ == "__main__":
    main()
