#!/usr/bin/env python3
"""Local read-only quote spine evidence adapter for Tuesday Phase 4A preflight.

This adapter is deliberately file/fixture-only. It reads only explicit local case
fields and local files named by the case, returns bounded summaries, and exposes
no network or mutation helpers.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

QUOTE_SPINE_SOURCE = "fixture"
MAX_TEXT = 180
MAX_LINES = 5
MAX_FILE_BYTES = 128 * 1024
FORBIDDEN_MUTATION_TOKENS = [
    "method=\"" + "post\"",
    "method=\"" + "put\"",
    "method=\"" + "patch\"",
    "method=\"" + "delete\"",
    "." + "upsert(",
    "." + "insert(",
    "." + "update(",
    "." + "rpc(",
    "drafts." + "create",
    "messages." + "send",
    "/" + "invoices/",
    "/" + "quotes/",
]


class QuoteSpineReadOnlyError(RuntimeError):
    """Raised for sanitized local quote evidence failures."""


def safe_text(value: Any, limit: int = MAX_TEXT) -> str:
    text = re.sub(r"\s+", " ", str(value or "").replace("—", "-")).strip()
    return text[:limit]


def first_present(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def number_or_none(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        text = value.strip().replace("$", "").replace(",", "")
        try:
            return float(text)
        except ValueError:
            return None
    return None


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "y", "checked", "complete", "passed"}
    return False


def normalize_mode(value: Any) -> str:
    text = safe_text(value, 40).lower()
    if text in {"delivery", "pickup", "tbc"}:
        return text
    if "pick" in text or "collect" in text:
        return "pickup"
    if "deliver" in text or "freight" in text or "ship" in text:
        return "delivery"
    if text in {"to be confirmed", "unknown", ""}:
        return "tbc" if text == "to be confirmed" else "unknown"
    return "unknown"


def local_path(value: Any) -> Path | None:
    text = safe_text(value, 500)
    if not text:
        return None
    path = Path(text).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path


def read_bounded_json(path: Path) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        raise QuoteSpineReadOnlyError("quote spine path missing")
    if path.stat().st_size > MAX_FILE_BYTES:
        raise QuoteSpineReadOnlyError("quote spine path too large")
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() in {".json", ".jsonc"}:
        data = json.loads(text)
        if not isinstance(data, dict):
            raise QuoteSpineReadOnlyError("quote spine JSON must be an object")
        return data
    return {"available": True, "source_note_present": bool(text.strip())}


def verify_evidence_path(value: Any, blockers: list[str], warnings: list[str]) -> str | None:
    path = local_path(value)
    if not path:
        return None
    if not path.exists() or not path.is_file():
        blockers.append("quote evidence path missing")
        return str(path)
    if path.stat().st_size > MAX_FILE_BYTES:
        warnings.append("quote evidence path too large to read; path retained only")
    return str(path)


def merge_sources(case: dict[str, Any], blockers: list[str], warnings: list[str]) -> tuple[dict[str, Any], list[str]]:
    data: dict[str, Any] = {}
    evidence_paths: list[str] = []
    for key in ["quote_spine", "quote_control"]:
        value = case.get(key)
        if isinstance(value, dict):
            data = {**data, **value}
    for key in ["quote_spine_path", "quote_input_path"]:
        path = local_path(case.get(key))
        if not path:
            continue
        try:
            data = {**data, **read_bounded_json(path)}
            evidence_paths.append(str(path))
        except (OSError, json.JSONDecodeError, QuoteSpineReadOnlyError) as exc:
            blockers.append(safe_text(exc, 120))
            evidence_paths.append(str(path))
    for raw in case.get("quote_evidence_paths") or []:
        path_text = verify_evidence_path(raw, blockers, warnings)
        if path_text:
            evidence_paths.append(path_text)
    return data, list(dict.fromkeys(evidence_paths))


def summarize_lines(value: Any) -> tuple[int, list[dict[str, Any]], bool]:
    rows = value if isinstance(value, list) else []
    summaries: list[dict[str, Any]] = []
    quantity_dependent = False
    for row in rows[:MAX_LINES]:
        if not isinstance(row, dict):
            continue
        if boolish(row.get("derived_from_batch_total")) or boolish(row.get("quantity_dependent")):
            quantity_dependent = True
        summaries.append({
            "description": safe_text(first_present(row.get("description"), row.get("label"), row.get("name")), 120),
            "quantity": number_or_none(first_present(row.get("quantity"), row.get("qty"))),
            "unit": safe_text(row.get("unit"), 40),
            "unit_price": number_or_none(first_present(row.get("unit_price"), row.get("unitPrice"), row.get("sell_unit"))),
            "line_total": number_or_none(first_present(row.get("line_total"), row.get("lineTotal"), row.get("total"))),
        })
    return len(rows), summaries, quantity_dependent


def delivery_required(case: dict[str, Any], freight_mode: str) -> bool:
    text = " ".join([safe_text(case.get("kind")), safe_text(case.get("title")), safe_text((case.get("gmail") or {}).get("subject"))]).lower()
    return freight_mode == "delivery" or any(term in text for term in ["delivery", "freight", "ship"])


def quoteish_case(case: dict[str, Any]) -> bool:
    text = " ".join([safe_text(case.get("kind")), safe_text(case.get("title")), safe_text((case.get("gmail") or {}).get("subject"))]).lower()
    kinds = {"quote_followup_candidate", "historical_quote", "quote_reply_candidate", "xero_quote_candidate", "customer_approval_invoice_candidate"}
    return case.get("kind") in kinds or any(term in text for term in ["quote", "invoice", "benchtop", "delivery", "xero"])


def collect_quote_spine_readback(case: dict[str, Any]) -> dict[str, Any]:
    warnings: list[str] = []
    blockers: list[str] = []
    data, evidence_paths = merge_sources(case, blockers, warnings)
    if not data and not quoteish_case(case):
        return {"source": "not_required_for_fixture", "status": "not_required", "live_called": False, "blockers": []}
    if not data:
        blockers.append("quote spine/calculator missing")

    available = boolish(first_present(data.get("available"), data.get("ready_to_quote"), data.get("readyToQuote")))
    margin_explicit = any(key in data for key in ["margin_checked", "marginChecked", "markup_percent", "markupPercent", "margin_percent", "marginPercent", "gross_margin_percent", "grossMarginPercent"])
    margin_checked = boolish(first_present(data.get("margin_checked"), data.get("marginChecked"))) or margin_explicit
    markup_percent = number_or_none(first_present(data.get("markup_percent"), data.get("markupPercent")))
    margin_percent = number_or_none(first_present(data.get("margin_percent"), data.get("marginPercent"), data.get("gross_margin_percent"), data.get("grossMarginPercent")))
    cost_total = number_or_none(first_present(data.get("cost_total"), data.get("costTotal"), data.get("subtotal_cost_ex_gst"), data.get("subtotalCostExGst")))
    quote_total = number_or_none(first_present(data.get("quote_total"), data.get("quoteTotal"), data.get("sell_price_ex_gst"), data.get("sellPriceExGst"), data.get("total")))
    freight_mode = normalize_mode(first_present(data.get("freight_mode"), data.get("freightMode"), data.get("delivery_mode"), data.get("deliveryMode")))
    delivery_destination = safe_text(first_present(data.get("delivery_destination"), data.get("deliveryDestination"), data.get("destination"), data.get("delivery_suburb"), data.get("deliverySuburb")), 180)
    line_count, line_items, line_quantity_dependent = summarize_lines(first_present(data.get("line_items"), data.get("lineItems"), data.get("lines")))

    if not available:
        blockers.append("quote spine/calculator missing")
    if not margin_checked:
        blockers.append("margin check missing")
    if delivery_required(case, freight_mode) and not delivery_destination and freight_mode not in {"pickup", "tbc"}:
        blockers.append("delivery destination missing")

    caveats = [safe_text(item, 200) for item in (data.get("caveats") or []) if safe_text(item)] if isinstance(data.get("caveats"), list) else []
    if boolish(data.get("quantity_dependent_pricing")) or boolish(data.get("quantityDependentPricing")) or line_quantity_dependent:
        caveats.append("Unit pricing is quantity-dependent: pricing is based on doing the quoted set together, and quantity changes may change unit pricing.")

    blockers = list(dict.fromkeys(blockers))
    warnings = list(dict.fromkeys(warnings))
    return {
        "source": QUOTE_SPINE_SOURCE if data else "fixture",
        "status": "collected" if not blockers else "missing_or_stale",
        "live_called": False,
        "available": available,
        "margin_checked": margin_checked,
        "markup_percent": markup_percent,
        "margin_percent": margin_percent,
        "cost_total": cost_total,
        "quote_total": quote_total,
        "delivery_destination": delivery_destination or None,
        "freight_mode": freight_mode,
        "line_item_count": line_count,
        "line_items": line_items,
        "evidence_paths": evidence_paths,
        "caveats": list(dict.fromkeys(caveats)),
        "warnings": warnings,
        "blockers": blockers,
    }
