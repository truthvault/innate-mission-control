#!/usr/bin/env python3
"""Reverify Tuesday Costings rows against live Drive/Xero evidence and update statuses.

No hard deletes. No Gmail/Drive/Xero writes. Supabase writes are limited to
Costings status/provenance/audit fields after a JSON backup is written.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ENV_PATH = Path("/Users/mack-mini/innate-mission-control/.env.local")
HERMES_INTEGRATIONS_PATH = Path("/Users/mack-mini/.hermes/secrets/innate-integrations.json")
DRIVE_HELPER = "/Users/mack-mini/.local/bin/hermes-drive-readonly"
REPORT_DIR = Path("reports/costings-source-verification-2026-06-18")

TABLES = [
    "costing_suppliers",
    "costing_materials",
    "costing_source_links",
    "costing_price_observations",
    "costing_current_prices",
    "product_costing_sheets",
    "product_costing_versions",
    "product_costing_lines",
    "costing_audit_events",
]
VIEWS = ["costing_material_summary", "product_costing_sheet_summary"]

SOURCE_RANGES = {
    "11Gtdqog3w9NkLZT-XlPPEatzF_OR15_4m3mDr0RD3Fg": ("Overview!A1:Z120", "element17"),
    "1jNKiXhaojVJVvd2nGZBjUq2sxdLFgGgE8w9swltW8tc": ("Simple costing!A1:Z120", "quintin_simple"),
    "1RJM1HKi6QCRePtCEpNRbTrrRFAjYOIKGaN4jGMLYuYk": ("Sheet1!A1:Z120", "quintin_v1"),
    "1uZBoLwz07DXnUAJwH8l83ExzG4-Dce7xkn74HK6Tqzc": ("Summary!A1:Z120", "jo_walsh"),
    "1YgMmuf9WRuZ9MluoIJI8Tw_3A7CGf7a4NWlBhD00fFc": ("Sheet1!A1:Z120", "westimber"),
}

KNOWN_XERO_INVOICES = ["00030367", "199139", "198822"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_env() -> None:
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("$", "").replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def same_num(a: Any, b: Any, tolerance: float = 0.02) -> bool:
    aa = num(a)
    bb = num(b)
    if aa is None and bb is None:
        return True
    if aa is None or bb is None:
        return False
    return abs(aa - bb) <= tolerance


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def q(value: str) -> str:
    return urllib.parse.quote(str(value), safe="")


class Supabase:
    def __init__(self) -> None:
        load_env()
        self.url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or ""
        if not self.url or not self.key:
            raise SystemExit("Missing Supabase URL or service key")

    def request(self, method: str, path: str, payload: Any | None = None, prefer: str | None = None) -> Any:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        req = urllib.request.Request(f"{self.url}/rest/v1/{path}", data=body, method=method, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else None

    def rows(self, path: str) -> list[dict[str, Any]]:
        return self.request("GET", path) or []

    def patch(self, table: str, filter_query: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        return self.request("PATCH", f"{table}?{filter_query}", payload, prefer="return=representation") or []

    def post(self, table: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        return self.request("POST", table, payload, prefer="return=representation") or []


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True))


def snapshot(db: Supabase) -> dict[str, Any]:
    data: dict[str, Any] = {"captured_at": now_iso(), "tables": {}, "views": {}}
    for table in TABLES:
        data["tables"][table] = db.rows(f"{table}?select=*&limit=10000")
    for view in VIEWS:
        data["views"][view] = db.rows(f"{view}?select=*&limit=10000")
    return data


def counts(db: Supabase) -> dict[str, int]:
    result: dict[str, int] = {}
    for table in TABLES:
        result[table] = len(db.rows(f"{table}?select=id&limit=10000"))
    for view in VIEWS:
        result[view] = len(db.rows(f"{view}?select=id&limit=10000"))
    return result


def read_sheet(external_id: str, cell_range: str) -> dict[str, Any]:
    proc = subprocess.run([DRIVE_HELPER, "sheet", external_id, cell_range], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    if proc.returncode != 0:
        return {"ok": False, "external_id": external_id, "range": cell_range, "error": (proc.stderr or proc.stdout).strip()[:1000], "values": []}
    payload = json.loads(proc.stdout)
    values = payload.get("values") or []
    digest = hashlib.sha256(json.dumps(values, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return {
        "ok": bool(payload.get("ok")),
        "external_id": external_id,
        "range": cell_range,
        "row_count": len(values),
        "non_empty_row_count": sum(1 for row in values if any(str(c).strip() for c in row)),
        "sha256": digest,
        "values": values,
    }


def sheet_map() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for external_id, (cell_range, key) in SOURCE_RANGES.items():
        sheet = read_sheet(external_id, cell_range)
        sheet["key"] = key
        out[external_id] = sheet
    return out


def cell(row: list[Any], idx: int) -> Any:
    return row[idx] if idx < len(row) else None


def find_component_row(values: list[list[Any]], label: str, unit_cost: Any, qty: Any, total: Any) -> tuple[int | None, list[Any] | None]:
    for idx, row in enumerate(values, 1):
        if str(cell(row, 0) or "").strip() != label:
            continue
        if unit_cost is not None and not same_num(cell(row, 1), unit_cost):
            continue
        if qty is not None and not same_num(cell(row, 2), qty):
            continue
        if total is not None and not same_num(cell(row, 3), total):
            continue
        return idx, row
    return None, None


def find_westimber_value(values: list[list[Any]], label: str, value: Any) -> tuple[int | None, list[Any] | None]:
    positions = {
        "Laminating price /m3": (0, 1),
        "Face-Laminating price /m3": (5, 6),
        "DG panels price /m3": (0, 1),
        "D4S price /m3 (under 200LM)": (5, 6),
        "F2 panels price /m3": (0, 1),
        "D4S price /m3 (over 200LM)": (5, 6),
    }
    pos = positions.get(label)
    if not pos:
        return None, None
    label_idx, value_idx = pos
    for idx, row in enumerate(values, 1):
        if str(cell(row, label_idx) or "").strip() == label and same_num(cell(row, value_idx), value):
            return idx, row
    return None, None


def find_element17_line(values: list[list[Any]], line_label: str, qty: Any, total: Any) -> tuple[int | None, list[Any] | None]:
    for idx, row in enumerate(values, 1):
        code = str(cell(row, 0) or "").strip()
        if not code or code == "Overall Total":
            continue
        label = " - ".join(str(x).strip() for x in [code, cell(row, 1), cell(row, 2)] if str(x or "").strip())
        if label == line_label and same_num(cell(row, 3), qty) and same_num(cell(row, 4), total):
            return idx, row
    return None, None


def row_by_label(values: list[list[Any]], label: str) -> list[Any] | None:
    for row in values:
        if str(cell(row, 0) or "").strip() == label:
            return row
    return None


def verify_version(sheet_key: str, values: list[list[Any]], version: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    evidence: dict[str, Any] = {"sheet_key": sheet_key}
    if sheet_key == "element17":
        row = row_by_label(values, "Overall Total")
        ok = bool(row) and same_num(cell(row, 4), version.get("total_cost_ex_gst")) and same_num(cell(row, 5), version.get("sell_price_ex_gst"))
        evidence.update({"row_label": "Overall Total", "total_cell": "E", "sell_cell": "F"})
        return ok, evidence
    if sheet_key == "quintin_simple":
        total_row = row_by_label(values, "Estimated total cost excl. GST")
        quote_row = row_by_label(values, "Selected quote total")
        ok = bool(total_row and quote_row) and same_num(cell(total_row, 3), version.get("total_cost_ex_gst")) and same_num(cell(quote_row, 1), version.get("sell_price_ex_gst")) and same_num(cell(quote_row, 3), version.get("gross_profit_ex_gst"))
        evidence.update({"total_row": "Estimated total cost excl. GST", "quote_row": "Selected quote total"})
        return ok, evidence
    if sheet_key == "quintin_v1":
        total_row = row_by_label(values, "Subtotal")
        sell_row = row_by_label(values, "Total sell price excl. GST")
        profit_row = row_by_label(values, "Profit")
        ok = bool(total_row and sell_row and profit_row) and same_num(cell(total_row, 3), version.get("total_cost_ex_gst")) and same_num(cell(sell_row, 3), version.get("sell_price_ex_gst")) and same_num(cell(profit_row, 3), version.get("gross_profit_ex_gst"))
        evidence.update({"total_row": "Subtotal", "sell_row": "Total sell price excl. GST", "profit_row": "Profit"})
        return ok, evidence
    if sheet_key == "jo_walsh":
        total_row = row_by_label(values, "Subtotal")
        sell_row = row_by_label(values, "Subtotal + margin excl. GST")
        profit_row = row_by_label(values, "Profit")
        ok = bool(total_row and sell_row and profit_row) and same_num(cell(total_row, 3), version.get("total_cost_ex_gst")) and same_num(cell(sell_row, 3), version.get("sell_price_ex_gst")) and same_num(cell(profit_row, 3), version.get("gross_profit_ex_gst"))
        evidence.update({"total_row": "Subtotal", "sell_row": "Subtotal + margin excl. GST", "profit_row": "Profit"})
        return ok, evidence
    return False, evidence


def unit_for_label(label: str, default: str | None) -> str:
    t = label.lower()
    if "labour" in t or "sanding" in t or "oil coat" in t or "qa / clean" in t or "drawings" in t or "admin" in t:
        return "hour"
    if "tōtara timber" in t or "top timber" in t:
        return "lm"
    if "westimber laminating" in t:
        return "m3"
    if "/m3" in t or "price /m3" in t:
        return "m3"
    if "outdoor" in t or re.match(r"ff\d+", t) or "stools" in t:
        return "quote line"
    return default or "each"


def line_type_for_label(label: str, default: str | None) -> str:
    t = label.lower()
    if "freight" in t or "delivery" in t or "pickup" in t or "collection" in t or "transport" in t:
        return "freight"
    if "labour" in t or "sanding" in t or "oil coat" in t or "qa / clean" in t or "drawings" in t or "admin" in t:
        return "labour"
    if "machining" in t or "cad" in t or "programming" in t or "precision" in t:
        return "machining"
    if "oil" in t or "finish" in t:
        return "finish"
    if "hardware" in t or "insert" in t or "power" in t or "pandora" in t or "c-channel" in t:
        return "hardware"
    if "timber" in t or "westimber" in t or "tōtara" in t:
        return "material"
    return default or "other"


def xero_credentials() -> tuple[str | None, str | None]:
    load_env()
    client_id = os.environ.get("XERO_CLIENT_ID")
    client_secret = os.environ.get("XERO_CLIENT_SECRET")
    if client_id and client_secret:
        return client_id, client_secret
    if HERMES_INTEGRATIONS_PATH.exists():
        parsed = json.loads(HERMES_INTEGRATIONS_PATH.read_text())
        env = parsed.get("mcp", {}).get("servers", {}).get("xero", {}).get("env", {})
        return env.get("XERO_CLIENT_ID"), env.get("XERO_CLIENT_SECRET")
    return None, None


def xero_known_invoice_lines() -> dict[str, Any]:
    client_id, client_secret = xero_credentials()
    if not client_id or not client_secret:
        return {"ok": False, "error": "Xero read-only credentials not configured", "invoices": {}}
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    token_body = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "accounting.invoices accounting.contacts accounting.settings accounting.reports.read"}).encode()
    token_req = urllib.request.Request("https://identity.xero.com/connect/token", data=token_body, method="POST", headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"})
    with urllib.request.urlopen(token_req, timeout=45) as response:
        token = json.loads(response.read().decode())["access_token"]
    conn_req = urllib.request.Request("https://api.xero.com/connections", headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    with urllib.request.urlopen(conn_req, timeout=45) as response:
        connections = json.loads(response.read().decode())
    tenant = next((c.get("tenantId") for c in connections if c.get("tenantId")), None)
    if not tenant:
        return {"ok": False, "error": "No Xero tenant returned", "invoices": {}}
    invoices: dict[str, Any] = {}
    for invoice_number in KNOWN_XERO_INVOICES:
        params = urllib.parse.urlencode({"page": "1", "pageSize": "5", "summaryOnly": "false", "searchTerm": invoice_number, "order": "UpdatedDateUTC DESC"})
        req = urllib.request.Request(f"https://api.xero.com/api.xro/2.0/Invoices?{params}", headers={"Authorization": f"Bearer {token}", "xero-tenant-id": tenant, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode())
        candidates = data.get("Invoices") or []
        found = [inv for inv in candidates if invoice_number in str(inv.get("InvoiceNumber") or "")]
        if not found and candidates:
            found = candidates[:1]
        if found:
            inv = found[0]
            invoices[invoice_number] = {
                "type": inv.get("Type"),
                "invoice_number": inv.get("InvoiceNumber"),
                "contact": (inv.get("Contact") or {}).get("Name"),
                "date": inv.get("DateString"),
                "total": inv.get("Total"),
                "reference": inv.get("Reference"),
                "lines": [
                    {
                        "description": line.get("Description"),
                        "quantity": line.get("Quantity"),
                        "unit_amount": line.get("UnitAmount"),
                        "line_amount": line.get("LineAmount"),
                    }
                    for line in inv.get("LineItems") or []
                ],
            }
    return {"ok": True, "captured_at": now_iso(), "invoices": invoices}


def xero_line_verified(label: str, unit_cost: Any, qty: Any, xero: dict[str, Any]) -> bool:
    if not xero.get("ok"):
        return False
    target = label.lower()
    checks: list[tuple[str, list[str]]] = []
    if "table machining" in target or "cnc table machining" in target:
        checks.append(("00030367", ["table machining cost"]))
    if "drum bases" in target:
        checks.append(("00030367", ["drum bases machining"]))
    if "cad" in target or "programming" in target:
        checks.append(("00030367", ["one off cad fee"]))
    if "plywood" in target or "internal discs" in target:
        checks.append(("00030367", ["plywood inserts"]))
    if "pandora" in target or "power unit" in target:
        checks.extend([("199139", ["elsafe pandora"]), ("198822", ["elsafe pandora"])])
    if "jackson electrical delivery" in target:
        checks.extend([("199139", ["delivery"]), ("198822", ["delivery"])])
    for inv_num, terms in checks:
        inv = xero.get("invoices", {}).get(inv_num)
        if not inv:
            continue
        for line in inv.get("lines", []):
            desc = (line.get("description") or "").lower()
            if all(term in desc for term in terms) and same_num(line.get("unit_amount"), unit_cost) and same_num(line.get("quantity"), qty):
                return True
    return False


def audit_event(db: Supabase, entity_type: str, entity_id: str, label: str, status: str, details: dict[str, Any], apply: bool) -> None:
    if not apply:
        return
    db.post("costing_audit_events", {
        "event_type": "review",
        "entity_type": entity_type,
        "entity_id": entity_id,
        "event_label": label,
        "event_status": status,
        "actor": "Hermes Tuesday Costings source verification 2026-06-18",
        "details": details,
    })


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write reversible Costings verification status updates to Supabase.")
    args = parser.parse_args()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    db = Supabase()

    before_counts = counts(db)
    before = snapshot(db)
    write_json(REPORT_DIR / "backup-before-source-verification.json", before)
    write_json(REPORT_DIR / "before-counts.json", before_counts)

    sheets = sheet_map()
    xero = xero_known_invoice_lines()
    write_json(REPORT_DIR / "drive-sheets-live.json", {k: {kk: vv for kk, vv in v.items() if kk != "values"} for k, v in sheets.items()})
    write_json(REPORT_DIR / "xero-known-invoice-lines.json", xero)

    source_links = db.rows("costing_source_links?select=*&limit=10000")
    link_by_id = {row["id"]: row for row in source_links}
    link_by_external = {row.get("external_id"): row for row in source_links if row.get("external_id")}

    product_sheets = db.rows("product_costing_sheets?select=*&limit=10000")
    versions = db.rows("product_costing_versions?select=*&limit=10000")
    lines = db.rows("product_costing_lines?select=*&limit=10000")
    observations = db.rows("costing_price_observations?select=*&limit=10000")
    materials = db.rows("costing_materials?select=*&limit=10000")

    sheet_by_id = {row["id"]: row for row in product_sheets}
    version_by_id = {row["id"]: row for row in versions}

    verified_obs: set[str] = set()
    verified_versions: set[str] = set()
    verified_lines: set[str] = set()
    changed: dict[str, int] = {"source_links": 0, "observations_fresh": 0, "observations_rejected": 0, "versions_verified": 0, "versions_rejected": 0, "lines_fresh": 0, "lines_missing_source": 0, "sheets_active": 0, "sheets_archived": 0, "materials_active": 0, "materials_inactive": 0}
    evidence_rows: list[dict[str, Any]] = []

    # Mark source links re-opened and hash current source data.
    for external_id, link in link_by_external.items():
        sheet = sheets.get(external_id)
        if not sheet:
            continue
        metadata = link.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        metadata.update({
            "reverified_at": now_iso(),
            "reverified_by": "Hermes source verification 2026-06-18",
            "sheet_range": sheet.get("range"),
            "sheet_sha256": sheet.get("sha256"),
            "sheet_row_count": sheet.get("row_count"),
            "sheet_non_empty_row_count": sheet.get("non_empty_row_count"),
        })
        if args.apply:
            db.patch("costing_source_links", f"id=eq.{q(link['id'])}", {"metadata": metadata})
            changed["source_links"] += 1

    # Product versions and sheets.
    for version in versions:
        sheet_record = sheet_by_id.get(version.get("sheet_id"))
        link = link_by_id.get(version.get("source_link_id") or sheet_record.get("source_link_id") if sheet_record else "") if sheet_record else None
        external_id = link.get("external_id") if link else None
        sheet = sheets.get(external_id or "")
        ok = False
        detail: dict[str, Any] = {}
        if sheet and sheet.get("ok"):
            ok, detail = verify_version(sheet.get("key"), sheet.get("values") or [], version)
            detail.update({"external_id": external_id, "source_label": link.get("source_label"), "sheet_sha256": sheet.get("sha256")})
        payload: dict[str, Any]
        if ok:
            verified_versions.add(version["id"])
            payload = {
                "source_hash": sheet.get("sha256"),
                "ready_to_quote_status": "needs_review",
                "approval_status": "unapproved",
                "blocker": None,
                "notes": "Source totals re-opened and matched on 2026-06-18. Accurate as source-backed costing evidence, but not promoted to approved quote/current-price truth.",
            }
            if args.apply:
                db.patch("product_costing_versions", f"id=eq.{q(version['id'])}", payload)
                changed["versions_verified"] += 1
                audit_event(db, "product_version", version["id"], "Source totals reverified", "succeeded", detail, True)
        else:
            payload = {
                "ready_to_quote_status": "blocked",
                "approval_status": "rejected",
                "blocker": "Removed from active Costings/Orders views on 2026-06-18: source totals could not be reverified exactly.",
            }
            if args.apply:
                db.patch("product_costing_versions", f"id=eq.{q(version['id'])}", payload)
                changed["versions_rejected"] += 1
                audit_event(db, "product_version", version["id"], "Source totals not reverified", "needs_review", detail, True)
        evidence_rows.append({"entity": "product_version", "id": version["id"], "ok": ok, "detail": detail})

    for product in product_sheets:
        linked_versions = [v for v in versions if v.get("sheet_id") == product["id"]]
        ok = any(v["id"] in verified_versions for v in linked_versions)
        payload = {"status": "active", "blocker": None, "notes": "Active because latest source sheet was re-opened and totals matched on 2026-06-18. Still requires quote approval before use as canonical pricing."} if ok else {"status": "archived", "blocker": "Archived on 2026-06-18 because no product costing version could be reverified exactly."}
        if args.apply:
            db.patch("product_costing_sheets", f"id=eq.{q(product['id'])}", payload)
            changed["sheets_active" if ok else "sheets_archived"] += 1
            audit_event(db, "product_sheet", product["id"], "Product sheet source verification", "succeeded" if ok else "needs_review", {"verified": ok, "product_name": product.get("product_name")}, True)

    # Product lines.
    for line in lines:
        version = version_by_id.get(line.get("version_id"))
        sheet_record = sheet_by_id.get(version.get("sheet_id")) if version else None
        link = link_by_id.get(version.get("source_link_id") or sheet_record.get("source_link_id") if version and sheet_record else "") if version else None
        external_id = link.get("external_id") if link else None
        sheet = sheets.get(external_id or "")
        ok = False
        row_no: int | None = None
        row: list[Any] | None = None
        if sheet and sheet.get("ok"):
            values = sheet.get("values") or []
            if sheet.get("key") == "element17":
                row_no, row = find_element17_line(values, line.get("line_label") or "", line.get("quantity"), line.get("total_cost_ex_gst"))
            else:
                row_no, row = find_component_row(values, line.get("line_label") or "", line.get("unit_cost_ex_gst"), line.get("quantity"), line.get("total_cost_ex_gst"))
            ok = row_no is not None
        unit = unit_for_label(line.get("line_label") or "", line.get("unit"))
        ltype = line_type_for_label(line.get("line_label") or "", line.get("line_type"))
        xero_ok = xero_line_verified(line.get("line_label") or "", line.get("unit_cost_ex_gst"), line.get("quantity"), xero)
        detail = {"external_id": external_id, "source_label": link.get("source_label") if link else None, "source_row_number": row_no, "sheet_sha256": sheet.get("sha256") if sheet else None, "xero_line_verified": xero_ok}
        if ok:
            verified_lines.add(line["id"])
            payload = {
                "freshness_status": "fresh",
                "confidence": "high" if xero_ok else "medium",
                "blocker": None,
                "unit": unit,
                "line_type": ltype,
                "raw_payload": {**(line.get("raw_payload") or {}), "reverified_at": now_iso(), "source_row_number": row_no, "source_sheet_sha256": sheet.get("sha256"), "xero_line_verified": xero_ok},
            }
            if args.apply:
                db.patch("product_costing_lines", f"id=eq.{q(line['id'])}", payload)
                changed["lines_fresh"] += 1
                audit_event(db, "product_line", line["id"], "Source line reverified", "succeeded", detail, True)
        else:
            payload = {"freshness_status": "missing_source", "confidence": "unknown", "blocker": "Removed from active Costings breakdown on 2026-06-18: source line/cost could not be reverified exactly."}
            if args.apply:
                db.patch("product_costing_lines", f"id=eq.{q(line['id'])}", payload)
                changed["lines_missing_source"] += 1
                audit_event(db, "product_line", line["id"], "Source line not reverified", "needs_review", detail, True)
        evidence_rows.append({"entity": "product_line", "id": line["id"], "label": line.get("line_label"), "ok": ok, "detail": detail})

    # Price observations.
    for obs in observations:
        link = link_by_id.get(obs.get("source_link_id"))
        external_id = link.get("external_id") if link else None
        sheet = sheets.get(external_id or "")
        ok = False
        row_no: int | None = None
        if sheet and sheet.get("ok"):
            values = sheet.get("values") or []
            if sheet.get("key") == "westimber":
                row_no, _row = find_westimber_value(values, obs.get("supplier_item_label") or "", obs.get("unit_cost_ex_gst"))
            elif sheet.get("key") != "element17":
                row_no, _row = find_component_row(values, obs.get("supplier_item_label") or "", obs.get("unit_cost_ex_gst"), obs.get("quantity"), obs.get("line_cost_ex_gst"))
            ok = row_no is not None
        unit = unit_for_label(obs.get("supplier_item_label") or "", obs.get("unit"))
        xero_ok = xero_line_verified(obs.get("supplier_item_label") or "", obs.get("unit_cost_ex_gst"), obs.get("quantity"), xero)
        detail = {"external_id": external_id, "source_label": link.get("source_label") if link else None, "source_row_number": row_no, "sheet_sha256": sheet.get("sha256") if sheet else None, "xero_line_verified": xero_ok}
        if ok:
            verified_obs.add(obs["id"])
            payload = {
                "review_status": "fresh",
                "confidence": "high" if xero_ok else "medium",
                "blocker": None,
                "unit": unit,
                "notes": ((obs.get("notes") or "").strip() + "\n" if obs.get("notes") else "") + "Reverified against live source on 2026-06-18. Source-backed observation only, not an approved current price.",
                "raw_payload": {**(obs.get("raw_payload") or {}), "reverified_at": now_iso(), "source_row_number": row_no, "source_sheet_sha256": sheet.get("sha256"), "xero_line_verified": xero_ok},
            }
            if args.apply:
                db.patch("costing_price_observations", f"id=eq.{q(obs['id'])}", payload)
                changed["observations_fresh"] += 1
                audit_event(db, "price_observation", obs["id"], "Source observation reverified", "succeeded", detail, True)
        else:
            payload = {"review_status": "rejected", "confidence": "unknown", "blocker": "Removed from active Costings on 2026-06-18: source price/cost could not be reverified exactly."}
            if args.apply:
                db.patch("costing_price_observations", f"id=eq.{q(obs['id'])}", payload)
                changed["observations_rejected"] += 1
                audit_event(db, "price_observation", obs["id"], "Source observation not reverified", "needs_review", detail, True)
        evidence_rows.append({"entity": "price_observation", "id": obs["id"], "label": obs.get("supplier_item_label"), "ok": ok, "detail": detail})

    # Materials: active only when at least one observation for that material verified.
    verified_material_ids = {obs.get("material_id") for obs in observations if obs.get("id") in verified_obs and obs.get("material_id")}
    for material in materials:
        ok = material.get("id") in verified_material_ids
        unit = unit_for_label(material.get("name") or "", material.get("unit"))
        category = line_type_for_label(material.get("name") or "", material.get("category"))
        category_map = {"material": "timber" if "timber" in (material.get("name") or "").lower() or "westimber" in (material.get("name") or "").lower() else "other", "hardware": "power" if "pandora" in (material.get("name") or "").lower() else "hardware", "freight": "freight", "labour": "labour", "machining": "machining", "finish": "finish", "other": material.get("category") or "other"}
        payload = {"is_active": True, "unit": unit, "category": category_map.get(category, material.get("category") or "other"), "notes": "Active because at least one linked source observation was reverified on 2026-06-18. Not an approved current price until promoted separately."} if ok else {"is_active": False, "notes": "Inactive on 2026-06-18 because no linked source observation was reverified exactly."}
        if args.apply:
            db.patch("costing_materials", f"id=eq.{q(material['id'])}", payload)
            changed["materials_active" if ok else "materials_inactive"] += 1
            audit_event(db, "material", material["id"], "Material source verification", "succeeded" if ok else "needs_review", {"verified": ok, "name": material.get("name")}, True)

    write_json(REPORT_DIR / "verification-evidence.json", evidence_rows)
    after_counts = counts(db) if args.apply else before_counts
    if args.apply:
        write_json(REPORT_DIR / "after-counts.json", after_counts)
        write_json(REPORT_DIR / "backup-after-source-verification.json", snapshot(db))

    print(json.dumps({
        "ok": True,
        "apply": args.apply,
        "before_counts": before_counts,
        "after_counts": after_counts,
        "changed": changed,
        "verified": {
            "observations": len(verified_obs),
            "product_versions": len(verified_versions),
            "product_lines": len(verified_lines),
        },
        "xero_ok": xero.get("ok"),
        "report_dir": str(REPORT_DIR),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
