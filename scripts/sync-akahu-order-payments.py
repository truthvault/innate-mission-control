#!/usr/bin/env python3
"""Sync exact/probable Akahu payment evidence into Tuesday order_payments.

Reads Akahu through the existing local Midas read-only Akahu module. It never prints
or accepts token values, and it does not initiate payments.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from urllib import error, parse, request

ROOT = Path(__file__).resolve().parents[1]
MIDAS_BASE = Path(os.getenv("MIDAS_FINANCE_DIR", "/Users/mack-mini/.hermes/profiles/midas/midas-finance"))
MIDAS_AKAHU = MIDAS_BASE / "tools" / "sync_akahu_transactions.py"
DEFAULT_ACCOUNT_NAME = "Innate Furniture Ltd"
CENT = Decimal("0.01")
SENSITIVE_KEYS = {"_user", "_account", "_connection", "account", "connection", "user", "account_number", "formatted_account", "token", "access_token"}


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_envs() -> None:
    load_env(ROOT / ".env.local")
    load_env(ROOT / ".env")
    load_env(MIDAS_BASE / ".env")


def supabase_config() -> tuple[str, str]:
    load_envs()
    url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SECRET_KEY") or ""
    if not url or not key:
        raise SystemExit("Missing Supabase service-role env for order payment sync.")
    return url, key


def supabase(path: str, *, method: str = "GET", body: Any = None, prefer: str | None = None) -> Any:
    url, key = supabase_config()
    payload = json.dumps(body).encode() if body is not None else None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = request.Request(f"{url}/rest/v1/{path}", data=payload, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=90) as response:
            text = response.read().decode()
            return json.loads(text) if text else None
    except error.HTTPError as exc:
        text = exc.read().decode(errors="replace")
        raise RuntimeError(f"Supabase payment sync failed: HTTP {exc.code} {text[:500]}") from exc


def load_midas_akahu():
    if not MIDAS_AKAHU.exists():
        raise SystemExit(f"Midas Akahu sync module not found: {MIDAS_AKAHU}")
    spec = importlib.util.spec_from_file_location("midas_sync_akahu_transactions", MIDAS_AKAHU)
    if spec is None or spec.loader is None:
        raise SystemExit("Could not load Midas Akahu sync module.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def qmoney(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def date_only(value: Any) -> str | None:
    text = str(value or "")
    return text[:10] if len(text) >= 10 else None


def clean_text(value: Any) -> str:
    return " ".join(str(value or "").split())


def invoice_tokens(invoice_number: str) -> set[str]:
    clean = invoice_number.upper().replace(" ", "")
    return {clean, clean.replace("-", ""), clean.replace("INV", "INV-")}


def name_tokens(name: str | None) -> set[str]:
    parts = [part.lower() for part in clean_text(name).replace("&", " ").split() if len(part) >= 3]
    if not parts:
        return set()
    tokens = set(parts)
    if len(parts) >= 2:
        tokens.add(" ".join(parts[:2]))
    return tokens


def searchable_text(item: dict[str, Any]) -> str:
    meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
    merchant = item.get("merchant") if isinstance(item.get("merchant"), dict) else {}
    fields = [
        item.get("description"),
        meta.get("reference"),
        meta.get("particulars"),
        meta.get("code"),
        merchant.get("name"),
    ]
    return " ".join(clean_text(field) for field in fields if field).lower()


def redacted_raw(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: ("[REDACTED]" if key in SENSITIVE_KEYS else redacted_raw(val)) for key, val in value.items()}
    if isinstance(value, list):
        return [redacted_raw(item) for item in value]
    return value


def safe_tail(value: Any, keep: int = 4) -> str:
    text = str(value or "")
    return "[redacted]..." + text[-keep:] if text else "[none]"


def selected_account(akahu: Any, account_name: str) -> dict[str, Any]:
    accounts = akahu.request("/accounts").get("items", [])
    matches = [account for account in accounts if account.get("name") == account_name]
    if len(matches) != 1:
        names = sorted(account.get("name") or "(unnamed)" for account in accounts)
        raise SystemExit(f"Expected exactly one Akahu account named {account_name!r}; found {len(matches)}. Available names: {names}")
    return matches[0]


def request_account_refresh(akahu: Any, account: dict[str, Any]) -> dict[str, Any]:
    user, app = akahu.require_tokens()
    account_id = str(account.get("_id") or "")
    api = getattr(akahu, "API", "https://api.akahu.io/v1")
    req = request.Request(
        f"{api}/refresh/{parse.quote(account_id)}",
        method="POST",
        headers={
            "Authorization": f"Bearer {user}",
            "X-Akahu-Id": app,
            "Accept": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            return {"requested": True, "ok": 200 <= response.status < 300, "status": response.status}
    except error.HTTPError as exc:
        return {"requested": True, "ok": False, "status": exc.code, "message": exc.read().decode(errors="replace")[:220]}


def account_transactions(akahu: Any, account: dict[str, Any], start: str, end: str) -> list[dict[str, Any]]:
    account_id = str(account.get("_id") or "")
    payload = akahu.request_all_pages(f"/accounts/{account_id}/transactions", {"start": start, "end": end})
    return payload.get("items", []) if isinstance(payload, dict) else []


def pending_account_transactions(akahu: Any, account: dict[str, Any]) -> list[dict[str, Any]]:
    account_id = str(account.get("_id") or "")
    try:
        payload = akahu.request(f"/accounts/{account_id}/transactions/pending")
    except Exception:
        return []
    return payload.get("items", []) if isinstance(payload, dict) else []


def fetch_documents() -> list[dict[str, Any]]:
    return supabase(
        "order_financial_documents?select=id,order_id,xero_invoice_number,total,contact_name,status,archived_at&xero_invoice_number=not.is.null&archived_at=is.null&limit=500"
    ) or []


def classify_match(item: dict[str, Any], document: dict[str, Any], sibling_count: int) -> tuple[str, Decimal, list[str]] | None:
    amount = qmoney(item.get("amount", 0))
    total = qmoney(document.get("total", 0))
    if amount <= 0 or abs(amount - total) > CENT:
        return None
    text = searchable_text(item)
    reasons = ["amount_exact"]
    invoice_number = str(document.get("xero_invoice_number") or "")
    invoice_hit = any(token.lower() in text.replace("-", "") or token.lower() in text for token in invoice_tokens(invoice_number))
    if invoice_hit:
        reasons.append("invoice_reference_found")
        return "matched", Decimal("1.00"), reasons
    customer_tokens = name_tokens(document.get("contact_name"))
    if customer_tokens and any(token in text for token in customer_tokens):
        reasons.append("customer_name_found")
        return "matched", Decimal("0.99"), reasons
    if sibling_count == 1:
        reasons.append("amount_only_single_candidate")
        return "probable", Decimal("0.90"), reasons
    return None


def payment_row(item: dict[str, Any], document: dict[str, Any], status: str, confidence: Decimal, reasons: list[str], account_name: str) -> dict[str, Any]:
    meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
    merchant = item.get("merchant") if isinstance(item.get("merchant"), dict) else {}
    return {
        "order_id": document.get("order_id"),
        "financial_document_id": document.get("id"),
        "source_system": "akahu",
        "external_transaction_id": item.get("_id"),
        "payment_date": date_only(item.get("date")),
        "amount": str(qmoney(item.get("amount", 0))),
        "currency": "NZD",
        "payer_name": clean_text(merchant.get("name")) or None,
        "bank_reference": clean_text(meta.get("reference")) or None,
        "bank_particulars": clean_text(meta.get("particulars")) or None,
        "bank_code": clean_text(meta.get("code")) or None,
        "bank_account_name": account_name,
        "xero_invoice_number": document.get("xero_invoice_number"),
        "match_status": status,
        "match_confidence": str(confidence),
        "match_reasons": reasons,
        "raw_akahu": redacted_raw(item),
    }


def matched_rows(transactions: list[dict[str, Any]], documents: list[dict[str, Any]], account_name: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in transactions:
        try:
            amount = qmoney(item.get("amount", 0))
        except Exception:
            continue
        siblings = [doc for doc in documents if abs(amount - qmoney(doc.get("total", 0))) <= CENT]
        for document in siblings:
            classified = classify_match(item, document, len(siblings))
            if not classified:
                continue
            status, confidence, reasons = classified
            rows.append(payment_row(item, document, status, confidence, reasons, account_name))
    return rows


def pending_summaries(transactions: list[dict[str, Any]], documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for item in transactions:
        try:
            amount = qmoney(item.get("amount", 0))
        except Exception:
            continue
        siblings = [doc for doc in documents if abs(amount - qmoney(doc.get("total", 0))) <= CENT]
        for document in siblings:
            classified = classify_match(item, document, len(siblings))
            if not classified:
                continue
            status, confidence, reasons = classified
            summaries.append({
                "invoice_number": document.get("xero_invoice_number"),
                "contact_name": document.get("contact_name"),
                "date": date_only(item.get("date")),
                "amount": str(amount),
                "match_status": status,
                "match_confidence": str(confidence),
                "match_reasons": reasons,
            })
    return summaries


def sync(start: str, end: str, *, account_name: str, refresh: bool, include_pending: bool) -> dict[str, Any]:
    load_envs()
    akahu_user = bool(os.getenv("AKAHU_USER_TOKEN"))
    akahu_app = bool(os.getenv("AKAHU_APP_TOKEN"))
    if not akahu_user or not akahu_app:
        raise SystemExit("Missing AKAHU_USER_TOKEN or AKAHU_APP_TOKEN in Midas .env. Values were not printed.")
    akahu = load_midas_akahu()
    account = selected_account(akahu, account_name)
    refresh_result = request_account_refresh(akahu, account) if refresh else {"requested": False}
    documents = fetch_documents()
    if not documents:
        return {
            "ok": True,
            "start": start,
            "end": end,
            "account_name": account.get("name"),
            "account_id_tail": safe_tail(account.get("_id")),
            "refresh": refresh_result,
            "documents": 0,
            "transactions": 0,
            "upserted": 0,
            "note": "No Xero intake documents found yet.",
        }
    transactions = account_transactions(akahu, account, start, end)
    rows = matched_rows(transactions, documents, account_name)
    if rows:
        supabase(
            "order_payments?on_conflict=source_system,external_transaction_id",
            method="POST",
            body=rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )
    pending_transactions = pending_account_transactions(akahu, account) if include_pending else []
    pending_matches = pending_summaries(pending_transactions, documents)
    settled_external_ids = {str(row.get("external_transaction_id") or "") for row in rows}
    pending_rows: list[dict[str, Any]] = []
    for item in pending_transactions:
        if str(item.get("_id") or "") in settled_external_ids:
            continue
        try:
            amount = qmoney(item.get("amount", 0))
        except Exception:
            continue
        siblings = [doc for doc in documents if abs(amount - qmoney(doc.get("total", 0))) <= CENT]
        for document in siblings:
            classified = classify_match(item, document, len(siblings))
            if not classified:
                continue
            _status, confidence, reasons = classified
            pending_rows.append(payment_row(item, document, "ignored", confidence, ["pending_akahu_transaction", *reasons], account_name))
    if pending_rows:
        supabase(
            "order_payments?on_conflict=source_system,external_transaction_id",
            method="POST",
            body=pending_rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )
    return {
        "ok": True,
        "start": start,
        "end": end,
        "account_name": account.get("name"),
        "account_id_tail": safe_tail(account.get("_id")),
        "refreshed": account.get("refreshed") or {},
        "refresh": refresh_result,
        "documents": len(documents),
        "transactions": len(transactions),
        "pending_transactions": len(pending_transactions),
        "upserted": len(rows),
        "pending_upserted": len(pending_rows),
        "matched": sum(1 for row in rows if row["match_status"] == "matched"),
        "probable": sum(1 for row in rows if row["match_status"] == "probable"),
        "pending_matches": len(pending_matches),
        "pending_match_preview": pending_matches[:5],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sync Akahu payment evidence into Tuesday order_payments")
    parser.add_argument("--days", type=int, default=int(os.getenv("ORDER_INTAKE_AKAHU_DAYS", "45")))
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--account-name", default=os.getenv("AKAHU_ORDER_ACCOUNT_NAME", DEFAULT_ACCOUNT_NAME))
    parser.add_argument("--refresh", action="store_true", help="Request an Akahu refresh for the selected account before reading transactions.")
    parser.add_argument("--no-pending", action="store_true", help="Skip pending transaction review.")
    args = parser.parse_args(argv)
    today = date.today()
    start = args.start or (today - timedelta(days=args.days)).isoformat()
    end = args.end or (today + timedelta(days=1)).isoformat()
    print(json.dumps(sync(start, end, account_name=args.account_name, refresh=args.refresh, include_pending=not args.no_pending), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
