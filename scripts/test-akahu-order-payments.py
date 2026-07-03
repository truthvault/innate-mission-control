#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "sync-akahu-order-payments.py"

spec = importlib.util.spec_from_file_location("sync_akahu_order_payments", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def document(invoice_number: str, *, line: str, reference: str = "Camilla Penney dining table") -> dict:
    return {
        "id": invoice_number,
        "order_id": f"order-{invoice_number}",
        "xero_invoice_number": invoice_number,
        "total": "2125.00",
        "contact_name": "Camilla Penney",
        "status": "AUTHORISED",
        "line_items": [{"description": line}],
        "raw_xero": {"Reference": reference},
    }


deposit = document(
    "INV-1148",
    line="2m classic oval dining table. 50% balance due upon completion before delivery.",
)
balance = document(
    "INV-1149",
    line="2m classic oval dining table. 50% deposit paid on INV-1148.",
    reference="Camilla Penney dining table balance",
)
documents = [deposit, balance]


def transaction(reference: str) -> dict:
    return {
        "_id": f"tx-{reference}",
        "amount": "2125.00",
        "date": "2026-06-02T12:00:00Z",
        "description": reference,
        "meta": {"reference": reference, "particulars": "Camilla Penney"},
        "merchant": {"name": "Camilla Penney"},
    }


explicit_deposit_rows = module.matched_rows([transaction("INV-1148")], documents, "Innate Furniture Ltd")
assert len(explicit_deposit_rows) == 1
assert explicit_deposit_rows[0]["xero_invoice_number"] == "INV-1148"
assert explicit_deposit_rows[0]["match_status"] == "matched"
assert explicit_deposit_rows[0]["match_confidence"] == "1.00"

explicit_balance_rows = module.matched_rows([transaction("INV-1149")], documents, "Innate Furniture Ltd")
assert len(explicit_balance_rows) == 1
assert explicit_balance_rows[0]["xero_invoice_number"] == "INV-1149"
assert explicit_balance_rows[0]["match_status"] == "matched"

ambiguous_rows = module.matched_rows([transaction("Camilla Penney")], documents, "Innate Furniture Ltd")
assert all(row["match_status"] != "matched" for row in ambiguous_rows)
assert all(row["xero_invoice_number"] != "INV-1149" for row in ambiguous_rows)
assert len(ambiguous_rows) == 1
assert ambiguous_rows[0]["match_status"] == "probable"
assert "same_amount_sibling_requires_invoice_reference" in ambiguous_rows[0]["match_reasons"]

print("Akahu order payment matching checks passed.")
