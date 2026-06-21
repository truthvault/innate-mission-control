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
import re
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
        "order_financial_documents?select=id,order_id,xero_invoice_number,total,contact_name,status,"
        "issued_at,due_at,sent_at,amount_due,line_items,raw_xero,archived_at"
        "&xero_invoice_number=not.is.null&archived_at=is.null&limit=500"
    ) or []


def normalize_invoice_number(value: Any) -> str | None:
    match = re.search(r"\bINV-?\d+\b", str(value or ""), flags=re.IGNORECASE)
    if not match:
        return None
    clean = match.group(0).upper().replace(" ", "")
    return clean if clean.startswith("INV-") else clean.replace("INV", "INV-", 1)


def referenced_invoice_numbers(text: str) -> set[str]:
    return {
        normalized
        for raw in re.findall(r"\bINV-?\d+\b", text, flags=re.IGNORECASE)
        if (normalized := normalize_invoice_number(raw))
    }


def document_invoice_number(document: dict[str, Any]) -> str | None:
    return normalize_invoice_number(document.get("xero_invoice_number"))


def document_line_text(document: dict[str, Any]) -> str:
    lines = document.get("line_items")
    if not isinstance(lines, list):
        return ""
    descriptions: list[str] = []
    for line in lines:
        if isinstance(line, dict):
            descriptions.append(clean_text(line.get("description")))
        else:
            descriptions.append(clean_text(line))
    return " ".join(description for description in descriptions if description)


def document_reference_text(document: dict[str, Any]) -> str:
    raw = document.get("raw_xero") if isinstance(document.get("raw_xero"), dict) else {}
    return " ".join([
        clean_text(raw.get("Reference")),
        clean_text(raw.get("reference")),
    ]).lower()


def document_is_balance_invoice(document: dict[str, Any]) -> bool:
    reference_text = document_reference_text(document)
    line_text = document_line_text(document).lower()
    combined = f"{reference_text} {line_text}"
    return bool(
        re.search(r"\bbalance\b", reference_text)
        or re.search(r"deposit\s+paid\s+on\s+inv-?\d+", combined)
        or re.search(r"50\s*%\s*deposit\s+paid", combined)
    )


def candidate_documents_for_transaction(item: dict[str, Any], documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    amount = qmoney(item.get("amount", 0))
    siblings = [doc for doc in documents if abs(amount - qmoney(doc.get("total", 0))) <= CENT]
    explicit_invoice_numbers = referenced_invoice_numbers(searchable_text(item))
    if not explicit_invoice_numbers:
        return siblings
    return [doc for doc in siblings if document_invoice_number(doc) in explicit_invoice_numbers]


def classify_match(item: dict[str, Any], document: dict[str, Any], sibling_count: int) -> tuple[str, Decimal, list[str]] | None:
    amount = qmoney(item.get("amount", 0))
    total = qmoney(document.get("total", 0))
    if amount <= 0 or abs(amount - total) > CENT:
        return None
    text = searchable_text(item)
    reasons = ["amount_exact"]
    invoice_number = document_invoice_number(document) or ""
    explicit_invoice_numbers = referenced_invoice_numbers(text)
    if explicit_invoice_numbers and invoice_number not in explicit_invoice_numbers:
        return None
    invoice_hit = any(token.lower() in text.replace("-", "") or token.lower() in text for token in invoice_tokens(invoice_number))
    if invoice_hit:
        reasons.append("invoice_reference_found")
        return "matched", Decimal("1.00"), reasons
    if document_is_balance_invoice(document):
        reasons.append("balance_invoice_without_explicit_reference")
        return None
    customer_tokens = name_tokens(document.get("contact_name"))
    if customer_tokens and any(token in text for token in customer_tokens):
        reasons.append("customer_name_found")
        if sibling_count > 1:
            reasons.append("same_amount_sibling_requires_invoice_reference")
            return "probable", Decimal("0.80"), reasons
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
            qmoney(item.get("amount", 0))
        except Exception:
            continue
        siblings = candidate_documents_for_transaction(item, documents)
        for document in siblings:
            classified = classify_match(item, document, len(siblings))
            if not classified:
                continue
            status, confidence, reasons = classified
            rows.append(payment_row(item, document, status, confidence, reasons, account_name))
    return rows


def row_key(row: dict[str, Any]) -> str:
    amount = ""
    if row.get("amount") is not None:
        try:
            amount = str(qmoney(row.get("amount")))
        except Exception:
            amount = str(row.get("amount") or "")
    return "|".join([
        str(row.get("order_id") or ""),
        str(row.get("source_system") or ""),
        str(row.get("external_transaction_id") or ""),
        str(row.get("xero_invoice_number") or ""),
        str(row.get("payment_date") or ""),
        amount,
        str(row.get("match_status") or ""),
    ])


def existing_payment_keys(candidate_rows: list[dict[str, Any]]) -> set[str]:
    invoice_numbers = sorted({str(row.get("xero_invoice_number") or "") for row in candidate_rows if row.get("xero_invoice_number")})
    if not invoice_numbers:
        return set()
    quoted = ",".join(parse.quote(number, safe="") for number in invoice_numbers)
    existing = supabase(
        "order_payments?select=order_id,source_system,external_transaction_id,xero_invoice_number,payment_date,amount,match_status"
        + f"&xero_invoice_number=in.({quoted})"
    ) or []
    return {row_key(row) for row in existing}


def new_only(candidate_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    existing = existing_payment_keys(candidate_rows)
    filtered: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in candidate_rows:
        key = row_key(row)
        if key in existing or key in seen:
            continue
        seen.add(key)
        filtered.append(row)
    return filtered


def external_key(row: dict[str, Any]) -> str | None:
    source = str(row.get("source_system") or "")
    external = str(row.get("external_transaction_id") or "")
    if not source or not external:
        return None
    return f"{source}|{external}"


def status_rank(status: Any) -> int:
    return {"matched": 3, "probable": 2, "unmatched": 1, "ignored": 0}.get(str(status or ""), 0)


def confidence_value(row: dict[str, Any]) -> Decimal:
    try:
        return Decimal(str(row.get("match_confidence") or "0"))
    except Exception:
        return Decimal("0")


def row_rank(row: dict[str, Any]) -> tuple[int, Decimal]:
    return status_rank(row.get("match_status")), confidence_value(row)


def dedupe_best_by_external(candidate_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keyed: dict[str, dict[str, Any]] = {}
    passthrough: list[dict[str, Any]] = []
    for row in candidate_rows:
        key = external_key(row)
        if not key:
            passthrough.append(row)
            continue
        previous = keyed.get(key)
        if previous is None or row_rank(row) > row_rank(previous):
            keyed[key] = row
    return [*passthrough, *keyed.values()]


def existing_payment_external_rows(candidate_rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    external_ids = sorted({str(row.get("external_transaction_id") or "") for row in candidate_rows if row.get("source_system") == "akahu" and row.get("external_transaction_id")})
    if not external_ids:
        return {}
    quoted = ",".join(parse.quote(value, safe="") for value in external_ids)
    existing = supabase(
        "order_payments?select=id,order_id,financial_document_id,source_system,external_transaction_id,"
        "xero_invoice_number,payment_date,amount,match_status,match_confidence"
        + f"&source_system=eq.akahu&external_transaction_id=in.({quoted})"
    ) or []
    return {key: row for row in existing if (key := external_key(row))}


def should_promote_existing_payment(existing: dict[str, Any], candidate: dict[str, Any]) -> bool:
    return row_rank(candidate) > row_rank(existing)


def update_existing_payment(existing_id: Any, row: dict[str, Any]) -> None:
    body = dict(row)
    body.pop("source_system", None)
    body.pop("external_transaction_id", None)
    supabase(
        f"order_payments?id=eq.{parse.quote(str(existing_id), safe='')}",
        method="PATCH",
        body=body,
        prefer="return=minimal",
    )


def write_payment_rows(candidate_rows: list[dict[str, Any]]) -> dict[str, int]:
    candidates = dedupe_best_by_external(candidate_rows)
    existing_exact = existing_payment_keys(candidates)
    existing_by_external = existing_payment_external_rows(candidates)
    insert_rows: list[dict[str, Any]] = []
    update_rows: list[tuple[Any, dict[str, Any]]] = []
    seen_exact: set[str] = set()
    for row in candidates:
        ext_key = external_key(row)
        if ext_key and ext_key in existing_by_external:
            existing = existing_by_external[ext_key]
            if should_promote_existing_payment(existing, row):
                update_rows.append((existing["id"], row))
            continue
        exact_key = row_key(row)
        if exact_key in existing_exact or exact_key in seen_exact:
            continue
        seen_exact.add(exact_key)
        insert_rows.append(row)
    if insert_rows:
        supabase(
            "order_payments",
            method="POST",
            body=insert_rows,
            prefer="return=minimal",
        )
    for existing_id, row in update_rows:
        update_existing_payment(existing_id, row)
    return {"inserted": len(insert_rows), "updated": len(update_rows), "written": len(insert_rows) + len(update_rows)}


def safe_patch(path: str, body: dict[str, Any]) -> None:
    try:
        supabase(path, method="PATCH", body=body, prefer="return=minimal")
    except RuntimeError as exc:
        message = str(exc).lower()
        if "lifecycle_stage" in message or "sent_channel" in message or "document_role" in message:
            return
        raise


def apply_matched_payment_state(candidate_rows: list[dict[str, Any]], documents: list[dict[str, Any]]) -> dict[str, int]:
    documents_by_id = {str(doc.get("id")): doc for doc in documents if doc.get("id")}
    updated_documents = 0
    updated_balance_orders = 0
    for row in candidate_rows:
        if row.get("match_status") != "matched":
            continue
        document_id = str(row.get("financial_document_id") or "")
        document = documents_by_id.get(document_id)
        if not document:
            continue
        amount = str(qmoney(row.get("amount", 0)))
        safe_patch(
            f"order_financial_documents?id=eq.{parse.quote(document_id, safe='')}",
            {
                "amount_paid": amount,
                "amount_due": "0.00",
                "lifecycle_stage": "paid",
            },
        )
        updated_documents += 1
        if document_is_balance_invoice(document) and row.get("order_id"):
            invoice_number = document.get("xero_invoice_number")
            safe_patch(
                f"orders?id=eq.{parse.quote(str(row.get('order_id')), safe='')}",
                {
                    "status": "finished",
                    "paid_on_date": row.get("payment_date"),
                    "next_action": f"Balance paid{f' on {invoice_number}' if invoice_number else ''}. Book freight/dispatch.",
                },
            )
            updated_balance_orders += 1
    return {"updated_documents": updated_documents, "updated_balance_orders": updated_balance_orders}


def pending_summaries(transactions: list[dict[str, Any]], documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for item in transactions:
        try:
            amount = qmoney(item.get("amount", 0))
        except Exception:
            continue
        siblings = candidate_documents_for_transaction(item, documents)
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
    candidate_rows = matched_rows(transactions, documents, account_name)
    settled_write = write_payment_rows(candidate_rows)
    lifecycle_write = apply_matched_payment_state(candidate_rows, documents)
    pending_transactions = pending_account_transactions(akahu, account) if include_pending else []
    pending_matches = pending_summaries(pending_transactions, documents)
    settled_external_ids = {str(row.get("external_transaction_id") or "") for row in candidate_rows}
    pending_rows: list[dict[str, Any]] = []
    for item in pending_transactions:
        if str(item.get("_id") or "") in settled_external_ids:
            continue
        try:
            qmoney(item.get("amount", 0))
        except Exception:
            continue
        siblings = candidate_documents_for_transaction(item, documents)
        for document in siblings:
            classified = classify_match(item, document, len(siblings))
            if not classified:
                continue
            _status, confidence, reasons = classified
            pending_rows.append(payment_row(item, document, "ignored", confidence, ["pending_akahu_transaction", *reasons], account_name))
    pending_write = write_payment_rows(pending_rows)
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
        "upserted": settled_write["written"],
        "inserted": settled_write["inserted"],
        "updated": settled_write["updated"],
        "payment_documents_marked_paid": lifecycle_write["updated_documents"],
        "balance_orders_marked_dispatch_ready": lifecycle_write["updated_balance_orders"],
        "pending_upserted": pending_write["written"],
        "pending_inserted": pending_write["inserted"],
        "pending_updated": pending_write["updated"],
        "matched": sum(1 for row in candidate_rows if row["match_status"] == "matched"),
        "probable": sum(1 for row in candidate_rows if row["match_status"] == "probable"),
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
