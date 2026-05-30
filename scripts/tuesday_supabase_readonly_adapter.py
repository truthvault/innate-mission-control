#!/usr/bin/env python3
"""Narrow GET-only Supabase/Tuesday readback adapter for Phase 4A preflight.

Default callers must inject explicit live-readonly intent. This module exposes no
write helpers and only builds Supabase REST GET requests through ``get_json``.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import urllib.parse
import urllib.request
from typing import Any, Callable

SUPABASE_SOURCE = "supabase"
MAX_ROWS_PER_QUERY = 5
HTTP_TIMEOUT_SECONDS = 20
FORBIDDEN_MUTATION_TOKENS = [
    "method=\"" + "post\"",
    "method=\"" + "put\"",
    "method=\"" + "patch\"",
    "method=\"" + "delete\"",
    "." + "upsert(",
    "." + "insert(",
    "." + "update(",
    "." + "rpc(",
]

JsonGetter = Callable[..., Any]


class SupabaseReadOnlyError(RuntimeError):
    """Raised for sanitized read-only adapter failures."""


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def safe_text(value: Any, limit: int = 160) -> str:
    text = re.sub(r"\s+", " ", str(value or "").replace("—", "-")).strip()
    return text[:limit]


def first_present(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = safe_text(value, 240)
        if text:
            return text
    return None


def normalize_email(value: Any) -> str | None:
    text = safe_text(value, 240).lower()
    return text if "@" in text and "." in text.split("@")[-1] else None


def looks_like_uuid_or_id(value: Any) -> str | None:
    text = safe_text(value, 120)
    return text if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_:\-.]{2,120}", text) else None


def supabase_config(env: dict[str, str]) -> dict[str, str] | None:
    url = first_present(env.get("SUPABASE_URL"), env.get("NEXT_PUBLIC_SUPABASE_URL"))
    key = first_present(env.get("SUPABASE_SERVICE_ROLE_KEY"), env.get("SUPABASE_SECRET_KEY"), env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    if not url or not key:
        return None
    return {"url": url.rstrip("/"), "key": key}


def parse_xero_refs(case: dict[str, Any]) -> dict[str, list[str]]:
    invoice_numbers: list[str] = []
    quote_numbers: list[str] = []
    for raw in case.get("xero_refs") or []:
        text = safe_text(raw, 80)
        upper = text.upper()
        if upper.startswith("INV-") or upper.startswith("INVOICE"):
            invoice_numbers.append(text)
        elif upper.startswith("QU-") or upper.startswith("QUOTE"):
            quote_numbers.append(text)
    for key in ["xero_invoice_number", "invoice_number"]:
        value = first_present(case.get(key))
        if value:
            invoice_numbers.append(value)
    for key in ["xero_quote_number", "quote_number"]:
        value = first_present(case.get(key))
        if value:
            quote_numbers.append(value)
    return {"invoice_numbers": list(dict.fromkeys(invoice_numbers))[:3], "quote_numbers": list(dict.fromkeys(quote_numbers))[:3]}


def extract_inputs(case: dict[str, Any]) -> dict[str, Any]:
    gmail = case.get("gmail") if isinstance(case.get("gmail"), dict) else {}
    refs = parse_xero_refs(case)
    email = normalize_email(case.get("email")) or normalize_email(gmail.get("from"))
    lead_id = looks_like_uuid_or_id(case.get("lead_id") or case.get("leadId"))
    order_id = looks_like_uuid_or_id(case.get("order_id") or case.get("orderId"))
    monday_item_id = looks_like_uuid_or_id(case.get("monday_item_id") or case.get("mondayItemId"))
    order_code = first_present(case.get("order_code"), case.get("orderCode"))
    return {
        "lead_id": lead_id,
        "order_id": order_id,
        "email": email,
        "monday_item_id": monday_item_id,
        "order_code": order_code,
        **refs,
    }


def has_narrow_input(inputs: dict[str, Any]) -> bool:
    return any(
        bool(inputs.get(key))
        for key in ["lead_id", "order_id", "email", "monday_item_id", "order_code"]
    ) or bool(inputs.get("invoice_numbers")) or bool(inputs.get("quote_numbers"))


def redacted_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in inputs.items() if value}


def quote_value(value: str) -> str:
    escaped = value.replace('"', '\\"')
    return urllib.parse.quote(f'"{escaped}"', safe="")


def query_params(params: dict[str, str]) -> str:
    return urllib.parse.urlencode(params, safe="*,().:->")


def build_url(base_url: str, table: str, params: dict[str, str]) -> str:
    return f"{base_url}/rest/v1/{table}?{query_params(params)}"


def default_get_json(url: str, *, headers: dict[str, str], timeout: int = HTTP_TIMEOUT_SECONDS) -> Any:
    req = urllib.request.Request(url, headers=headers)
    if req.get_method() != "GET":
        raise SupabaseReadOnlyError("Supabase read-only adapter refused a non-GET request")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw) if raw else []


def get_rows(config: dict[str, str], table: str, params: dict[str, str], get_json: JsonGetter) -> list[dict[str, Any]]:
    url = build_url(config["url"], table, params)
    headers = {
        "Accept": "application/json",
        "apikey": config["key"],
        "Authorization": "Bearer " + config["key"],
    }
    body = get_json(url, headers=headers, timeout=HTTP_TIMEOUT_SECONDS)
    if isinstance(body, list):
        return [row for row in body if isinstance(row, dict)][:MAX_ROWS_PER_QUERY]
    if isinstance(body, dict):
        return [body]
    return []


def lead_params(inputs: dict[str, Any]) -> dict[str, str] | None:
    select = "id,customer_name,email,status,priority,owner,next_follow_up_at,last_interaction_at,next_action,source_system,monday_item_id,updated_at"
    if inputs.get("lead_id"):
        return {"select": select, "id": f"eq.{inputs['lead_id']}", "limit": str(MAX_ROWS_PER_QUERY)}
    if inputs.get("email"):
        return {"select": select, "email": f"ilike.{quote_value(inputs['email'])}", "limit": str(MAX_ROWS_PER_QUERY), "order": "updated_at.desc"}
    if inputs.get("monday_item_id"):
        return {"select": select, "monday_item_id": f"eq.{inputs['monday_item_id']}", "limit": str(MAX_ROWS_PER_QUERY)}
    return None


def order_params(inputs: dict[str, Any], lead_rows: list[dict[str, Any]]) -> dict[str, str] | None:
    select = "id,order_code,customer_name,status,priority,item_category,product_summary,order_date,due_date,paid_on_date,total_incl_gst,xero_invoice_number,xero_quote_number,updated_at"
    if inputs.get("order_id"):
        return {"select": select, "id": f"eq.{inputs['order_id']}", "limit": str(MAX_ROWS_PER_QUERY)}
    if inputs.get("order_code"):
        return {"select": select, "order_code": f"eq.{quote_value(inputs['order_code'])}", "limit": str(MAX_ROWS_PER_QUERY)}
    invoice_numbers = inputs.get("invoice_numbers") or []
    if invoice_numbers:
        return {"select": select, "xero_invoice_number": f"eq.{quote_value(invoice_numbers[0])}", "limit": str(MAX_ROWS_PER_QUERY)}
    quote_numbers = inputs.get("quote_numbers") or []
    if quote_numbers:
        return {"select": select, "xero_quote_number": f"eq.{quote_value(quote_numbers[0])}", "limit": str(MAX_ROWS_PER_QUERY)}
    for row in lead_rows:
        maybe_order_id = row.get("order_id") or row.get("converted_order_id")
        if maybe_order_id:
            return {"select": select, "id": f"eq.{looks_like_uuid_or_id(maybe_order_id)}", "limit": str(MAX_ROWS_PER_QUERY)}
    return None


def linked_rows_params(order_ids: list[str], lead_ids: list[str]) -> dict[str, str] | None:
    filters: list[str] = []
    if order_ids:
        filters.append("order_id.in.(" + ",".join(quote_value(item) for item in order_ids[:3]) + ")")
    if lead_ids:
        filters.append("lead_id.in.(" + ",".join(quote_value(item) for item in lead_ids[:3]) + ")")
    if not filters:
        return None
    return {"select": "id,lead_id,order_id,link_type,source_system,created_at", "or": "(" + ",".join(filters) + ")", "limit": str(MAX_ROWS_PER_QUERY)}


def by_order_params(order_ids: list[str], select: str) -> dict[str, str] | None:
    if not order_ids:
        return None
    return {"select": select, "order_id": "in.(" + ",".join(quote_value(item) for item in order_ids[:3]) + ")", "limit": str(MAX_ROWS_PER_QUERY)}


def summarize_lead(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": safe_text(row.get("id"), 120),
        "customer_name": safe_text(row.get("customer_name"), 120),
        "email_present": bool(row.get("email")),
        "status": safe_text(row.get("status"), 80),
        "priority": safe_text(row.get("priority"), 80),
        "owner": safe_text(row.get("owner"), 80),
        "next_follow_up_at": safe_text(row.get("next_follow_up_at"), 80),
        "last_interaction_at": safe_text(row.get("last_interaction_at"), 80),
        "next_action": safe_text(row.get("next_action"), 180),
        "source_system": safe_text(row.get("source_system"), 80),
        "monday_item_id": safe_text(row.get("monday_item_id"), 120),
        "updated_at": safe_text(row.get("updated_at"), 80),
    }


def summarize_order(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": safe_text(row.get("id"), 120),
        "order_code": safe_text(row.get("order_code"), 120),
        "customer_name": safe_text(row.get("customer_name"), 120),
        "status": safe_text(row.get("status"), 80),
        "priority": safe_text(row.get("priority"), 80),
        "item_category": safe_text(row.get("item_category"), 80),
        "product_summary": safe_text(row.get("product_summary"), 180),
        "order_date": safe_text(row.get("order_date"), 80),
        "due_date": safe_text(row.get("due_date"), 80),
        "paid_on_date": safe_text(row.get("paid_on_date"), 80),
        "total_incl_gst": row.get("total_incl_gst"),
        "xero_invoice_number": safe_text(row.get("xero_invoice_number"), 80),
        "xero_quote_number": safe_text(row.get("xero_quote_number"), 80),
        "updated_at": safe_text(row.get("updated_at"), 80),
    }


def summarize_link(row: dict[str, Any]) -> dict[str, Any]:
    return {key: safe_text(row.get(key), 120) for key in ["id", "lead_id", "order_id", "link_type", "source_system", "created_at"]}


def summarize_financial_document(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": safe_text(row.get("id"), 120),
        "order_id": safe_text(row.get("order_id"), 120),
        "xero_invoice_number": safe_text(row.get("xero_invoice_number"), 80),
        "xero_quote_number": safe_text(row.get("xero_quote_number"), 80),
        "status": safe_text(row.get("status"), 80),
        "issued_at": safe_text(row.get("issued_at"), 80),
        "due_at": safe_text(row.get("due_at"), 80),
        "total": row.get("total"),
        "amount_paid": row.get("amount_paid"),
        "amount_due": row.get("amount_due"),
    }


def summarize_payment(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": safe_text(row.get("id"), 120),
        "order_id": safe_text(row.get("order_id"), 120),
        "source_system": safe_text(row.get("source_system"), 80),
        "payment_date": safe_text(row.get("payment_date"), 80),
        "amount": row.get("amount"),
        "match_status": safe_text(row.get("match_status"), 80),
        "match_confidence": row.get("match_confidence"),
        "xero_invoice_number": safe_text(row.get("xero_invoice_number"), 80),
    }


def collect_tuesday_readback(
    case: dict[str, Any],
    env: dict[str, str],
    *,
    get_json: JsonGetter | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    fetched_at = now or utc_now()
    config = supabase_config(env)
    if not config:
        return {
            "source": "live_readonly_requested",
            "status": "missing_adapter_or_config",
            "configured_hint_present": bool(first_present(env.get("SUPABASE_URL"), env.get("NEXT_PUBLIC_SUPABASE_URL"))),
            "live_called": False,
            "blockers": ["live Supabase read-only adapter not configured; Supabase/Tuesday row not collected"],
        }

    inputs = extract_inputs(case)
    if not has_narrow_input(inputs):
        return {
            "source": SUPABASE_SOURCE,
            "status": "missing",
            "live_called": False,
            "fetched_at": fetched_at,
            "inputs_used": {},
            "row_counts": {"leads": 0, "orders": 0, "order_links": 0, "financial_documents": 0, "payments": 0},
            "warnings": [],
            "blockers": ["no narrow Supabase identifiers supplied; live read skipped"],
        }

    getter = get_json or default_get_json
    warnings: list[str] = []
    blockers: list[str] = []
    try:
        lead_rows: list[dict[str, Any]] = []
        params = lead_params(inputs)
        if params:
            lead_rows = get_rows(config, "leads", params, getter)

        order_rows: list[dict[str, Any]] = []
        params = order_params(inputs, lead_rows)
        if params:
            order_rows = get_rows(config, "orders", params, getter)

        lead_ids = [safe_text(row.get("id"), 120) for row in lead_rows if row.get("id")]
        order_ids = [safe_text(row.get("id"), 120) for row in order_rows if row.get("id")]

        link_rows: list[dict[str, Any]] = []
        params = linked_rows_params(order_ids, lead_ids)
        if params:
            try:
                link_rows = get_rows(config, "order_links", params, getter)
            except Exception as exc:  # table may not exist in older envs; don't broaden reads
                warnings.append("order_links read failed or unavailable: " + safe_text(type(exc).__name__, 60))

        financial_rows: list[dict[str, Any]] = []
        params = by_order_params(order_ids, "id,order_id,xero_invoice_number,xero_quote_number,status,issued_at,due_at,total,amount_paid,amount_due")
        if params:
            try:
                financial_rows = get_rows(config, "order_financial_documents", params, getter)
            except Exception as exc:
                warnings.append("financial document read failed or unavailable: " + safe_text(type(exc).__name__, 60))

        payment_rows: list[dict[str, Any]] = []
        params = by_order_params(order_ids, "id,order_id,source_system,payment_date,amount,match_status,match_confidence,xero_invoice_number")
        if params:
            try:
                payment_rows = get_rows(config, "order_payments", params, getter)
            except Exception as exc:
                warnings.append("payment read failed or unavailable: " + safe_text(type(exc).__name__, 60))
    except Exception as exc:
        return {
            "source": SUPABASE_SOURCE,
            "status": "error",
            "live_called": True,
            "fetched_at": fetched_at,
            "inputs_used": redacted_inputs(inputs),
            "row_counts": {"leads": 0, "orders": 0, "order_links": 0, "financial_documents": 0, "payments": 0},
            "warnings": warnings,
            "blockers": ["Supabase read-only GET failed: " + safe_text(type(exc).__name__, 80)],
        }

    row_counts = {
        "leads": len(lead_rows),
        "orders": len(order_rows),
        "order_links": len(link_rows),
        "financial_documents": len(financial_rows),
        "payments": len(payment_rows),
    }
    matched = row_counts["leads"] + row_counts["orders"]
    if matched == 0:
        blockers.append("Supabase read-only GET returned no matching lead/order rows")
    status = "collected" if matched else "missing"
    return {
        "source": SUPABASE_SOURCE,
        "status": status,
        "live_called": True,
        "fetched_at": fetched_at,
        "inputs_used": redacted_inputs(inputs),
        "row_count": sum(row_counts.values()),
        "row_counts": row_counts,
        "lead": summarize_lead(lead_rows[0]) if lead_rows else None,
        "order": summarize_order(order_rows[0]) if order_rows else None,
        "order_links": [summarize_link(row) for row in link_rows],
        "financial_documents": [summarize_financial_document(row) for row in financial_rows],
        "payments": [summarize_payment(row) for row in payment_rows],
        "warnings": warnings,
        "blockers": blockers,
    }
