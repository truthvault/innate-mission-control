#!/usr/bin/env python3
"""Narrow Xero accounting GET-only readback adapter for Tuesday Phase 4A.

Accounting/business-data access is read-only by construction: only allowlisted
collection GET paths are exposed. The optional identity token request is isolated
from accounting reads and never receives accounting paths or payloads.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import re
import urllib.parse
import urllib.request
from typing import Any, Callable

XERO_SOURCE = "xero"
TOKEN_URL = "https://identity.xero.com/connect/token"
CONNECTIONS_URL = "https://api.xero.com/connections"
ACCOUNTING_URL = "https://api.xero.com/api.xro/2.0"
HTTP_TIMEOUT_SECONDS = 20
MAX_ROWS_PER_QUERY = 5
ALLOWED_ACCOUNTING_PATHS = {"/Invoices", "/Contacts", "/Quotes"}
READ_SCOPE = "accounting.invoices accounting.contacts accounting.settings accounting.reports.read"
FORBIDDEN_ACCOUNTING_MUTATION_TOKENS = [
    "method=\"" + "put\"",
    "method=\"" + "patch\"",
    "method=\"" + "delete\"",
    "." + "create(",
    "." + "update(",
    "." + "approve(",
    "." + "send(",
    "." + "void(",
    "/" + "payments",
    "/" + "invoices/",
    "/" + "quotes/",
]

JsonGetter = Callable[..., Any]


class XeroReadOnlyError(RuntimeError):
    """Raised for sanitized Xero read-only adapter failures."""


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def safe_text(value: Any, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", str(value or "").replace("—", "-")).strip()
    return text[:limit]


def first_present(*values: Any) -> str | None:
    for value in values:
        text = safe_text(value, 240)
        if text:
            return text
    return None


def normalize_email(value: Any) -> str | None:
    text = safe_text(value, 320).lower()
    if "<" in text and ">" in text:
        text = text.split("<", 1)[1].split(">", 1)[0].strip()
    return text if "@" in text and "." in text.rsplit("@", 1)[-1] else None


def valid_ref(value: Any) -> str | None:
    text = safe_text(value, 120)
    return text if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_:\-./ ]{1,120}", text) else None


def parse_xero_refs(case: dict[str, Any]) -> dict[str, list[str]]:
    invoice_numbers: list[str] = []
    quote_numbers: list[str] = []
    references: list[str] = []
    for raw in case.get("xero_refs") or []:
        text = valid_ref(raw)
        if not text:
            continue
        upper = text.upper()
        if upper.startswith("INV-") or upper.startswith("INVOICE"):
            invoice_numbers.append(text)
        elif upper.startswith("QU-") or upper.startswith("QUOTE"):
            quote_numbers.append(text)
        else:
            references.append(text)
    for key in ["xero_invoice_number", "invoice_number"]:
        value = valid_ref(case.get(key))
        if value:
            invoice_numbers.append(value)
    for key in ["xero_quote_number", "quote_number"]:
        value = valid_ref(case.get(key))
        if value:
            quote_numbers.append(value)
    for key in ["xero_reference", "reference", "order_code", "orderCode", "lead_id", "order_id"]:
        value = valid_ref(case.get(key))
        if value:
            references.append(value)
    return {
        "invoice_numbers": list(dict.fromkeys(invoice_numbers))[:3],
        "quote_numbers": list(dict.fromkeys(quote_numbers))[:3],
        "references": list(dict.fromkeys(references))[:3],
    }


def extract_inputs(case: dict[str, Any]) -> dict[str, Any]:
    gmail = case.get("gmail") if isinstance(case.get("gmail"), dict) else {}
    refs = parse_xero_refs(case)
    contact_name = first_present(case.get("contact_name"), case.get("customer"), gmail.get("from"))
    return {
        **refs,
        "contact_id": valid_ref(case.get("xero_contact_id") or case.get("contact_id")),
        "contact_name": contact_name,
        "contact_email": normalize_email(case.get("email") or case.get("customer_email") or gmail.get("from")),
    }


def has_narrow_input(inputs: dict[str, Any]) -> bool:
    return any(
        bool(inputs.get(key))
        for key in ["invoice_numbers", "quote_numbers", "references", "contact_id", "contact_email", "contact_name"]
    )


def redacted_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in inputs.items() if value}


def xero_config(env: dict[str, str], client: Any | None = None) -> dict[str, str] | None:
    if client is not None:
        return {"mode": "injected"}
    access = first_present(env.get("XERO_ACCESS_TOKEN"))
    tenant = first_present(env.get("XERO_TENANT_ID"))
    if access and tenant:
        return {"mode": "bearer", "access": access, "tenant": tenant}
    client_id = first_present(env.get("XERO_CLIENT_ID"))
    client_secret = first_present(env.get("XERO_CLIENT_SECRET"))
    if client_id and client_secret:
        return {"mode": "client_credentials", "client_id": client_id, "client_secret": client_secret}
    return None


def default_get_json(url: str, *, headers: dict[str, str], timeout: int = HTTP_TIMEOUT_SECONDS) -> Any:
    req = urllib.request.Request(url, headers=headers)
    if req.get_method() != "GET":
        raise XeroReadOnlyError("Xero read-only adapter refused a non-GET accounting request")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def request_identity_token(client_id: str, client_secret: str, token_get_json: JsonGetter | None = None) -> str:
    if token_get_json:
        data = token_get_json(TOKEN_URL, client_id=client_id, client_secret=client_secret, scope=READ_SCOPE, timeout=HTTP_TIMEOUT_SECONDS)
    else:
        basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        body = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": READ_SCOPE}).encode()
        req = urllib.request.Request(
            TOKEN_URL,
            data=body,
            headers={"Authorization": "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as response:
            data = json.loads(response.read().decode("utf-8") or "{}")
    access = data.get("access_token") if isinstance(data, dict) else None
    if not access:
        raise XeroReadOnlyError("Xero identity token response missing access token")
    return str(access)


def request_connection(access_token: str, get_json: JsonGetter = default_get_json) -> dict[str, str]:
    data = get_json(CONNECTIONS_URL, headers={"Authorization": "Bearer " + access_token, "Accept": "application/json"}, timeout=HTTP_TIMEOUT_SECONDS)
    rows = data if isinstance(data, list) else []
    first = next((row for row in rows if isinstance(row, dict) and row.get("tenantId")), None)
    if not first:
        raise XeroReadOnlyError("Xero connections response missing tenant")
    return {"tenant": str(first.get("tenantId")), "tenant_name": safe_text(first.get("tenantName"), 120)}


class HttpXeroReadOnlyClient:
    def __init__(self, config: dict[str, str], get_json: JsonGetter = default_get_json, token_get_json: JsonGetter | None = None):
        self.config = dict(config)
        self.get_json = get_json
        self.token_get_json = token_get_json
        self._access: str | None = None
        self._tenant: str | None = None

    def _auth(self) -> tuple[str, str]:
        if self.config.get("mode") == "bearer":
            return self.config["access"], self.config["tenant"]
        if not self._access:
            self._access = request_identity_token(self.config["client_id"], self.config["client_secret"], self.token_get_json)
            connection = request_connection(self._access, self.get_json)
            self._tenant = connection["tenant"]
        return self._access, str(self._tenant)

    def get(self, path: str, params: dict[str, str] | None = None) -> Any:
        if path not in ALLOWED_ACCOUNTING_PATHS:
            raise XeroReadOnlyError("Xero read-only adapter refused non-allowlisted accounting path")
        access, tenant = self._auth()
        query = urllib.parse.urlencode(params or {})
        url = ACCOUNTING_URL + path + ("?" + query if query else "")
        return self.get_json(url, headers={"Authorization": "Bearer " + access, "xero-tenant-id": tenant, "Accept": "application/json"}, timeout=HTTP_TIMEOUT_SECONDS)


def where_equals(field: str, value: str) -> str:
    escaped = value.replace('"', '\\"')
    return f'{field}=="{escaped}"'


def invoice_params(inputs: dict[str, Any]) -> dict[str, str] | None:
    base = {"page": "1", "pageSize": str(MAX_ROWS_PER_QUERY), "summaryOnly": "true", "order": "UpdatedDateUTC DESC"}
    invoices = inputs.get("invoice_numbers") or []
    if invoices:
        return {**base, "InvoiceNumbers": ",".join(invoices[:3])}
    refs = inputs.get("references") or []
    if refs:
        return {**base, "where": where_equals("Reference", refs[0])}
    contact_name = inputs.get("contact_name")
    if contact_name:
        return {**base, "searchTerm": safe_text(contact_name, 80)}
    return None


def quote_params(inputs: dict[str, Any]) -> dict[str, str] | None:
    base = {"page": "1", "pageSize": str(MAX_ROWS_PER_QUERY), "order": "UpdatedDateUTC DESC"}
    quotes = inputs.get("quote_numbers") or []
    if quotes:
        return {**base, "QuoteNumbers": ",".join(quotes[:3])}
    refs = inputs.get("references") or []
    if refs:
        return {**base, "where": where_equals("Reference", refs[0])}
    return None


def contact_params(inputs: dict[str, Any]) -> dict[str, str] | None:
    base = {"page": "1", "pageSize": str(MAX_ROWS_PER_QUERY), "order": "UpdatedDateUTC DESC"}
    if inputs.get("contact_id"):
        return {**base, "IDs": inputs["contact_id"]}
    if inputs.get("contact_email"):
        return {**base, "where": where_equals("EmailAddress", inputs["contact_email"])}
    if inputs.get("contact_name"):
        return {**base, "searchTerm": safe_text(inputs["contact_name"], 80)}
    return None


def rows_from(body: Any, key: str) -> list[dict[str, Any]]:
    rows = body.get(key) if isinstance(body, dict) else []
    return [row for row in (rows or []) if isinstance(row, dict)][:MAX_ROWS_PER_QUERY]


def summarize_contact(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": safe_text(row.get("Name"), 140),
        "email_present": bool(row.get("EmailAddress")),
        "status": safe_text(row.get("ContactStatus"), 80),
    }


def summarize_invoice(row: dict[str, Any]) -> dict[str, Any]:
    contact = row.get("Contact") if isinstance(row.get("Contact"), dict) else {}
    return {
        "invoice_number": safe_text(row.get("InvoiceNumber"), 80),
        "reference": safe_text(row.get("Reference"), 120),
        "status": safe_text(row.get("Status"), 80),
        "date": safe_text(row.get("DateString") or row.get("Date"), 80),
        "due_date": safe_text(row.get("DueDateString") or row.get("DueDate"), 80),
        "contact_name": safe_text(contact.get("Name"), 140),
        "total": row.get("Total") if isinstance(row.get("Total"), (int, float)) else None,
        "amount_due": row.get("AmountDue") if isinstance(row.get("AmountDue"), (int, float)) else None,
        "amount_paid": row.get("AmountPaid") if isinstance(row.get("AmountPaid"), (int, float)) else None,
        "fully_paid_on_date": safe_text(row.get("FullyPaidOnDate"), 80),
    }


def summarize_quote(row: dict[str, Any]) -> dict[str, Any]:
    contact = row.get("Contact") if isinstance(row.get("Contact"), dict) else {}
    return {
        "quote_number": safe_text(row.get("QuoteNumber"), 80),
        "reference": safe_text(row.get("Reference"), 120),
        "status": safe_text(row.get("Status"), 80),
        "date": safe_text(row.get("DateString") or row.get("Date"), 80),
        "expiry_date": safe_text(row.get("ExpiryDateString") or row.get("ExpiryDate"), 80),
        "contact_name": safe_text(contact.get("Name"), 140),
        "total": row.get("Total") if isinstance(row.get("Total"), (int, float)) else None,
    }


def summarize_payments_from_invoices(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for row in rows[:MAX_ROWS_PER_QUERY]:
        payments = row.get("Payments") if isinstance(row.get("Payments"), list) else []
        amount_paid = row.get("AmountPaid") if isinstance(row.get("AmountPaid"), (int, float)) else None
        if payments or amount_paid:
            summaries.append({
                "invoice_number": safe_text(row.get("InvoiceNumber"), 80),
                "status": safe_text(row.get("Status"), 80),
                "amount_paid": amount_paid,
                "amount_due": row.get("AmountDue") if isinstance(row.get("AmountDue"), (int, float)) else None,
                "fully_paid_on_date": safe_text(row.get("FullyPaidOnDate"), 80),
                "payment_count": len(payments),
            })
    return summaries


def collect_xero_readback(
    case: dict[str, Any],
    env: dict[str, str],
    *,
    client: Any | None = None,
    get_json: JsonGetter | None = None,
    token_get_json: JsonGetter | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    fetched_at = now or utc_now()
    config = xero_config(env, client)
    if not config:
        return {
            "source": "live_readonly_requested",
            "status": "missing_adapter_or_config",
            "configured_hint_present": bool(first_present(env.get("XERO_CLIENT_ID"), env.get("XERO_ACCESS_TOKEN"), env.get("XERO_TENANT_ID"))),
            "live_called": False,
            "warnings": [],
            "blockers": ["live Xero read-only adapter not configured; Xero quote/invoice/contact/payment state not collected"],
        }

    inputs = extract_inputs(case)
    if not has_narrow_input(inputs):
        return {
            "source": XERO_SOURCE,
            "status": "missing",
            "live_called": False,
            "fetched_at": fetched_at,
            "inputs_used": {},
            "row_count": 0,
            "row_counts": {"contacts": 0, "quotes": 0, "invoices": 0},
            "warnings": [],
            "blockers": ["no narrow Xero contact/reference/quote/invoice input supplied; live read skipped"],
        }

    service = client or HttpXeroReadOnlyClient(config, get_json or default_get_json, token_get_json)
    warnings: list[str] = []
    blockers: list[str] = []
    contact_rows: list[dict[str, Any]] = []
    invoice_rows: list[dict[str, Any]] = []
    quote_rows: list[dict[str, Any]] = []
    try:
        params = invoice_params(inputs)
        if params:
            invoice_rows = rows_from(service.get("/Invoices", params), "Invoices")
        params = contact_params(inputs)
        if params:
            contact_rows = rows_from(service.get("/Contacts", params), "Contacts")
        params = quote_params(inputs)
        if params:
            try:
                quote_rows = rows_from(service.get("/Quotes", params), "Quotes")
            except Exception as exc:
                warnings.append("Xero Quotes read unavailable or unsupported; invoice/contact evidence returned: " + safe_text(type(exc).__name__, 80))
    except Exception as exc:
        return {
            "source": XERO_SOURCE,
            "status": "error",
            "live_called": True,
            "fetched_at": fetched_at,
            "inputs_used": redacted_inputs(inputs),
            "row_count": 0,
            "row_counts": {"contacts": 0, "quotes": 0, "invoices": 0},
            "warnings": warnings,
            "blockers": ["Xero read-only GET failed: " + safe_text(type(exc).__name__, 80)],
        }

    row_counts = {"contacts": len(contact_rows), "quotes": len(quote_rows), "invoices": len(invoice_rows)}
    if not any(row_counts.values()):
        blockers.append("Xero read-only GET returned no matching contact/quote/invoice rows")
    return {
        "source": XERO_SOURCE,
        "status": "collected" if any(row_counts.values()) else "missing",
        "live_called": True,
        "fetched_at": fetched_at,
        "inputs_used": redacted_inputs(inputs),
        "row_count": sum(row_counts.values()),
        "row_counts": row_counts,
        "contact": summarize_contact(contact_rows[0]) if contact_rows else None,
        "quotes": [summarize_quote(row) for row in quote_rows],
        "invoices": [summarize_invoice(row) for row in invoice_rows],
        "payments_evidence": summarize_payments_from_invoices(invoice_rows),
        "warnings": warnings,
        "blockers": blockers,
    }
