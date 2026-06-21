#!/usr/bin/env python3
"""Import source-backed Tuesday Costings rows from selected Google Drive sheets.

Safety:
- Reads Google Sheets through the local read-only Drive helper.
- Writes only to the additive costing_* Supabase tables.
- Does not print Supabase secrets.
- Does not promote any observation to current approved price.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

DRIVE_HELPER = "/Users/mack-mini/.local/bin/hermes-drive-readonly"
ENV_PATH = Path("/Users/mack-mini/innate-mission-control/.env.local")
CAPTURED_BY = "Hermes Tuesday Costings import 2026-06-18"

SOURCE_SHEETS = {
    "element17": {
        "id": "11Gtdqog3w9NkLZT-XlPPEatzF_OR15_4m3mDr0RD3Fg",
        "name": "Product Costing Sheet - Element 17 - cleaned source-control copy 2026-06-11 2204",
        "url": "https://docs.google.com/spreadsheets/d/11Gtdqog3w9NkLZT-XlPPEatzF_OR15_4m3mDr0RD3Fg/edit",
        "range": "Overview!A1:Z120",
    },
    "quintin_simple": {
        "id": "1jNKiXhaojVJVvd2nGZBjUq2sxdLFgGgE8w9swltW8tc",
        "name": "Quintin Te Rūnanga boardroom table - simple costing",
        "url": "https://docs.google.com/spreadsheets/d/1jNKiXhaojVJVvd2nGZBjUq2sxdLFgGgE8w9swltW8tc/edit",
        "range": "Simple costing!A1:Z120",
    },
    "quintin_v1": {
        "id": "1RJM1HKi6QCRePtCEpNRbTrrRFAjYOIKGaN4jGMLYuYk",
        "name": "Innate Table Quote Calculator - Quintin v1",
        "url": "https://docs.google.com/spreadsheets/d/1RJM1HKi6QCRePtCEpNRbTrrRFAjYOIKGaN4jGMLYuYk/edit",
        "range": "Sheet1!A1:Z120",
    },
    "jo_walsh": {
        "id": "1uZBoLwz07DXnUAJwH8l83ExzG4-Dce7xkn74HK6Tqzc",
        "name": "Jo Walsh - Timber Vision 2200 costing - 2026-05-07",
        "url": "https://docs.google.com/spreadsheets/d/1uZBoLwz07DXnUAJwH8l83ExzG4-Dce7xkn74HK6Tqzc/edit",
        "range": "Summary!A1:Z120",
    },
    "westimber_calculator": {
        "id": "1YgMmuf9WRuZ9MluoIJI8Tw_3A7CGf7a4NWlBhD00fFc",
        "name": "Westimber Price Calculator",
        "url": "https://docs.google.com/spreadsheets/d/1YgMmuf9WRuZ9MluoIJI8Tw_3A7CGf7a4NWlBhD00fFc/edit",
        "range": "Sheet1!A1:Z120",
    },
}

SUPPLIER_HINTS = [
    ("westimber", "Westimber"),
    ("precision", "Precision Woodworks"),
    ("pieter", "Precision Woodworks"),
    ("jackson", "Jackson Electrical"),
    ("elsafe", "Jackson Electrical"),
    ("pandora", "Jackson Electrical"),
    ("vulcan", "Vulcan"),
    ("tubefab", "TubeFab"),
    ("mainfreight", "Mainfreight"),
]


def load_env() -> None:
    if not ENV_PATH.exists():
        raise SystemExit(f"Missing env file: {ENV_PATH}")
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def supabase_config() -> tuple[str, str]:
    load_env()
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or ""
    if not url or not key:
        raise SystemExit("Missing Supabase URL or service key in local env")
    return url, key


@dataclass
class Supabase:
    url: str
    key: str

    def request(self, method: str, path: str, payload: Any | None = None, prefer: str | None = None) -> Any:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        req = Request(f"{self.url}/rest/v1/{path}", data=data, method=method, headers=headers)
        try:
            with urlopen(req, timeout=30) as response:
                text = response.read().decode("utf-8")
                return json.loads(text) if text else None
        except HTTPError as err:
            body = err.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase {method} {path} failed: HTTP {err.code} {body[:500]}") from err

    def select_one(self, table: str, query: str) -> dict[str, Any] | None:
        rows = self.request("GET", f"{table}?{query}&limit=1")
        return rows[0] if rows else None

    def post(self, table: str, payload: dict[str, Any] | list[dict[str, Any]], on_conflict: str | None = None) -> Any:
        path = table
        if on_conflict:
            path += f"?on_conflict={quote(on_conflict)}"
        return self.request("POST", path, payload, prefer="resolution=merge-duplicates,return=representation")

    def patch(self, table: str, query: str, payload: dict[str, Any]) -> Any:
        return self.request("PATCH", f"{table}?{query}", payload, prefer="return=representation")

    def delete(self, table: str, query: str) -> None:
        self.request("DELETE", f"{table}?{query}", prefer="return=minimal")


def slug(text: str, max_len: int = 90) -> str:
    text = text.lower().replace("ō", "o").replace("ū", "u")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:max_len].strip("-") or "item"


def number(value: Any) -> float | None:
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


def pct(value: Any) -> float | None:
    n = number(value)
    if n is None:
        return None
    return n * 100 if abs(n) <= 1 else n


def cell(row: list[Any], idx: int) -> Any:
    return row[idx] if idx < len(row) else None


def sheet_values(sheet: dict[str, str]) -> list[list[Any]]:
    cmd = [DRIVE_HELPER, "sheet", sheet["id"], sheet["range"]]
    last_error = ""
    for attempt in range(3):
        proc = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode == 0:
            data = json.loads(proc.stdout)
            if not data.get("ok"):
                raise RuntimeError(f"Drive sheet read failed for {sheet['name']}: {data}")
            return data.get("values") or []
        last_error = (proc.stderr or proc.stdout or "").strip()
        time.sleep(1 + attempt)
    raise RuntimeError(f"Drive sheet read failed for {sheet['name']}: {last_error}")


def source_link(db: Supabase, sheet: dict[str, str]) -> dict[str, Any]:
    payload = {
        "source_type": "drive_sheet",
        "source_label": sheet["name"],
        "source_url": sheet["url"],
        "external_id": sheet["id"],
        "captured_by": CAPTURED_BY,
        "metadata": {"range": sheet["range"]},
    }
    rows = db.post("costing_source_links", payload, on_conflict="source_type,external_id")
    return rows[0]


def supplier_name_for(label: str, note: str = "") -> str | None:
    haystack = f"{label} {note}".lower()
    for needle, name in SUPPLIER_HINTS:
        if needle in haystack:
            return name
    if "labour" in haystack or "workshop" in haystack:
        return "Innate internal labour"
    return None


def supplier_id(db: Supabase, name: str | None, supplier_type: str = "supplier") -> str | None:
    if not name:
        return None
    normalized = re.sub(r"\s+", " ", name.strip().lower())
    existing = db.select_one("costing_suppliers", f"normalized_name=eq.{quote(normalized)}")
    if existing:
        return existing["id"]
    rows = db.post("costing_suppliers", {"name": name, "supplier_type": supplier_type})
    return rows[0]["id"]


def material_id(db: Supabase, internal_code: str, name: str, category: str, supplier: str | None, unit: str | None, supplier_code: str | None = None) -> str:
    existing = db.select_one("costing_materials", f"internal_code=eq.{quote(internal_code)}")
    sid = supplier_id(db, supplier, "labour" if supplier == "Innate internal labour" else "supplier")
    payload = {
        "name": name,
        "internal_code": internal_code,
        "supplier_id": sid,
        "supplier_code": supplier_code,
        "category": category,
        "unit": unit,
        "is_active": True,
    }
    if existing:
        db.patch("costing_materials", f"id=eq.{existing['id']}", payload)
        return existing["id"]
    rows = db.post("costing_materials", payload)
    return rows[0]["id"]


def upsert_product_sheet(db: Supabase, code: str, name: str, family: str, variant: str | None, link: dict[str, Any], notes: str | None = None) -> dict[str, Any]:
    payload = {
        "product_code": code,
        "product_name": name,
        "product_family": family,
        "default_variant": variant,
        "status": "needs_review",
        "source_link_id": link["id"],
        "source_type": "drive_sheet",
        "source_label": link["source_label"],
        "source_url": link["source_url"],
        "notes": notes,
        "blocker": "Imported as source-backed observation only. Not approved as current quoting truth.",
    }
    existing = db.select_one("product_costing_sheets", f"product_code=eq.{quote(code)}")
    if existing:
        return db.patch("product_costing_sheets", f"id=eq.{existing['id']}", payload)[0]
    return db.post("product_costing_sheets", payload)[0]


def upsert_version(db: Supabase, sheet_id: str, version_label: str, link: dict[str, Any], totals: dict[str, Any]) -> dict[str, Any]:
    query = f"sheet_id=eq.{sheet_id}&version_label=eq.{quote(version_label)}"
    payload = {
        "sheet_id": sheet_id,
        "version_label": version_label,
        "source_link_id": link["id"],
        "imported_by": CAPTURED_BY,
        "ready_to_quote_status": "needs_review",
        "approval_status": "unapproved",
        "blocker": "Needs review before use as an approved current costing.",
        **totals,
    }
    existing = db.select_one("product_costing_versions", query)
    if existing:
        return db.patch("product_costing_versions", f"id=eq.{existing['id']}", payload)[0]
    return db.post("product_costing_versions", payload)[0]


def replace_lines(db: Supabase, version_id: str, lines: list[dict[str, Any]]) -> int:
    db.delete("product_costing_lines", f"version_id=eq.{version_id}")
    if not lines:
        return 0
    for line in lines:
        line["version_id"] = version_id
        # PostgREST bulk inserts require identical object keys. Single-row inserts keep
        # this import robust when only some source rows carry extra raw payload.
        db.post("product_costing_lines", line)
    return len(lines)


def replace_observations(db: Supabase, link_id: str, observations: list[dict[str, Any]]) -> int:
    db.delete("costing_price_observations", f"source_link_id=eq.{link_id}")
    for observation in observations:
        # Some observations have Xero bill fields and some do not, so insert them
        # one at a time instead of forcing placeholder keys into source records.
        db.post("costing_price_observations", observation)
    return len(observations)


def line_type_for(label: str) -> str:
    text = label.lower()
    if "labour" in text or "sanding" in text or "assembly" in text or "qa" in text or "drawings" in text:
        return "labour"
    if "delivery" in text or "transport" in text or "freight" in text or "pickup" in text or "collection" in text:
        return "freight"
    if "oil" in text or "finish" in text:
        return "finish"
    if "hardware" in text or "insert" in text or "power" in text or "pandora" in text:
        return "hardware"
    if "machining" in text or "cad" in text or "programming" in text:
        return "machining"
    return "material"


def category_for(label: str) -> str:
    lt = line_type_for(label)
    if lt == "hardware" and ("power" in label.lower() or "pandora" in label.lower()):
        return "power"
    if lt == "material" and "timber" in label.lower():
        return "timber"
    return {
        "labour": "labour",
        "freight": "freight",
        "finish": "finish",
        "hardware": "hardware",
        "machining": "machining",
        "material": "other",
    }[lt]


def cost_line_observation(db: Supabase, link: dict[str, Any], sheet_key: str, label: str, cpu: float | None, qty: float | None, total: float | None, note: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    supplier = supplier_name_for(label, note or "")
    if not supplier and line_type_for(label) == "labour":
        supplier = "Innate internal labour"
    category = category_for(label)
    unit = "hour" if line_type_for(label) == "labour" else "each"
    mid = material_id(db, f"drive-{sheet_key}-{slug(label)}", label, category, supplier, unit)
    observation = {
        "material_id": mid,
        "supplier_id": supplier_id(db, supplier),
        "source_link_id": link["id"],
        "source_type": "drive_sheet",
        "source_label": link["source_label"],
        "source_url": link["source_url"],
        "supplier_item_label": label,
        "unit": unit,
        "quantity": qty,
        "unit_cost_ex_gst": cpu,
        "line_cost_ex_gst": total,
        "confidence": "medium" if note else "low",
        "review_status": "needs_review",
        "notes": note,
        "blocker": "Source-backed observation only. Not approved as current price.",
        "raw_payload": {"sheet_key": sheet_key, "source_note": note},
    }
    if note and "Inv " in note:
        m = re.search(r"Inv\s+([^\s,/)]+)", note)
        if m:
            observation["xero_bill_number"] = m.group(1)
        observation["xero_line_description"] = note[:500]
    line = {
        "material_id": mid,
        "line_type": line_type_for(label),
        "line_label": label,
        "quantity": qty,
        "unit": unit,
        "unit_cost_ex_gst": cpu,
        "total_cost_ex_gst": total,
        "source_line_reference": link["source_label"],
        "freshness_status": "needs_review",
        "confidence": observation["confidence"],
        "notes": note,
        "blocker": "Needs review before quote use.",
    }
    return observation, line


def parse_component_sheet(db: Supabase, sheet_key: str, code: str, product_name: str, family: str, variant: str | None, summary_labels: dict[str, str]) -> dict[str, int]:
    sheet = SOURCE_SHEETS[sheet_key]
    rows = sheet_values(sheet)
    link = source_link(db, sheet)
    product = upsert_product_sheet(db, code, product_name, family, variant, link)

    header_index = next(i for i, row in enumerate(rows) if cell(row, 0) == "Component Description")
    lines: list[dict[str, Any]] = []
    observations: list[dict[str, Any]] = []
    for row in rows[header_index + 1 :]:
        label = str(cell(row, 0) or "").strip()
        if not label:
            continue
        if label in summary_labels or label.startswith("Subtotal") or label.startswith("Estimated total") or label.startswith("Sell price scenario"):
            break
        if number(cell(row, 3)) is None:
            continue
        obs, line = cost_line_observation(db, link, sheet_key, label, number(cell(row, 1)), number(cell(row, 2)), number(cell(row, 3)), str(cell(row, 4) or "") or None)
        observations.append(obs)
        lines.append(line)

    summary: dict[str, Any] = {}
    for row in rows:
        label = str(cell(row, 0) or "").strip()
        if label in summary_labels:
            summary[summary_labels[label]] = number(cell(row, 3))
        if label == "Margin":
            summary["gross_margin_percent"] = pct(cell(row, 3))
        if label == "Total Labour Hours" or label == "Labour hours":
            summary["total_labour_hours"] = number(cell(row, 3))
        if label == "GST":
            summary.setdefault("raw_payload", {})["gst_source_value"] = number(cell(row, 3))

    if "total_cost_ex_gst" not in summary and "total_materials_ex_gst" in summary:
        summary["total_cost_ex_gst"] = summary["total_materials_ex_gst"]
    if "sell_price_ex_gst" in summary and "total_cost_ex_gst" in summary and "gross_profit_ex_gst" not in summary:
        summary["gross_profit_ex_gst"] = round(summary["sell_price_ex_gst"] - summary["total_cost_ex_gst"], 6)
    summary["notes"] = "Imported from Drive sheet. Totals and lines are source-backed observations, not approved current pricing."
    version = upsert_version(db, product["id"], "drive-import-2026-06-18", link, summary)
    return {
        "product_sheets": 1,
        "versions": 1,
        "lines": replace_lines(db, version["id"], lines),
        "observations": replace_observations(db, link["id"], observations),
    }


def parse_quintin_simple(db: Supabase) -> dict[str, int]:
    result = parse_component_sheet(
        db,
        "quintin_simple",
        "quintin-te-runanga-boardroom-simple-2026-05-11",
        "Quintin / Te Rūnanga boardroom table - simple costing",
        "Boardroom table",
        "3600mm custom boardroom table, timber drum/barrel bases, two OE Elsafe power units, Hamilton delivery/install allowance",
        {
            "Estimated total cost excl. GST": "total_cost_ex_gst",
        },
    )
    # The selected quote total row stores sell price in column B, gross profit in
    # column D, and margin in column E. Preserve those source positions exactly.
    sheet = SOURCE_SHEETS["quintin_simple"]
    rows = sheet_values(sheet)
    product = db.select_one("product_costing_sheets", f"product_code=eq.{quote('quintin-te-runanga-boardroom-simple-2026-05-11')}")
    if product:
        version = db.select_one("product_costing_versions", f"sheet_id=eq.{product['id']}&version_label=eq.{quote('drive-import-2026-06-18')}")
        if version:
            for row in rows:
                if str(cell(row, 0) or "").strip() == "Selected quote total":
                    db.patch(
                        "product_costing_versions",
                        f"id=eq.{version['id']}",
                        {
                            "sell_price_ex_gst": number(cell(row, 1)),
                            "gross_profit_ex_gst": number(cell(row, 3)),
                            "gross_margin_percent": pct(cell(row, 4)),
                        },
                    )
                    break
    return result


def parse_quintin_v1(db: Supabase) -> dict[str, int]:
    return parse_component_sheet(
        db,
        "quintin_v1",
        "quintin-table-quote-calculator-v1-2026-05-11",
        "Quintin boardroom table - pebble top with barrel bases",
        "Boardroom table",
        "Pebble top with barrel bases, two OE Elsafe power units, Hamilton delivery",
        {
            "Subtotal": "total_cost_ex_gst",
            "Total sell price excl. GST": "sell_price_ex_gst",
            "Total sell price incl. GST": "sell_price_incl_gst",
            "Profit": "gross_profit_ex_gst",
        },
    )


def parse_jo_walsh(db: Supabase) -> dict[str, int]:
    result = parse_component_sheet(
        db,
        "jo_walsh",
        "jo-walsh-timber-vision-2200-2026-05-07",
        "Jo Walsh - Timber Vision 2200 costing",
        "Dining table",
        "2200 Timber Vision dining table",
        {
            "Subtotal": "total_cost_ex_gst",
            "Subtotal + margin excl. GST": "sell_price_ex_gst",
            "Subtotal + margin incl. GST": "sell_price_incl_gst",
            "Profit": "gross_profit_ex_gst",
        },
    )
    # Add the source-provided markup/margin factor from the sheet label without treating it as approved policy.
    sheet = SOURCE_SHEETS["jo_walsh"]
    rows = sheet_values(sheet)
    link = source_link(db, sheet)
    product = db.select_one("product_costing_sheets", f"product_code=eq.{quote('jo-walsh-timber-vision-2200-2026-05-07')}")
    if product:
        version = db.select_one("product_costing_versions", f"sheet_id=eq.{product['id']}&version_label=eq.{quote('drive-import-2026-06-18')}")
        for row in rows:
            if str(cell(row, 0) or "").strip() == "Subtotal + margin excl. GST" and version:
                db.patch("product_costing_versions", f"id=eq.{version['id']}", {"markup_percent": pct(cell(row, 1))})
                break
    return result


def parse_element17(db: Supabase) -> dict[str, int]:
    sheet = SOURCE_SHEETS["element17"]
    rows = sheet_values(sheet)
    link = source_link(db, sheet)
    product = upsert_product_sheet(
        db,
        "element17-harrows-product-costing-batch-2026-06-11",
        "Element 17 / Harrows product costing batch",
        "Outdoor hospitality furniture batch",
        "Overview sheet with FF item codes and Harrows source quote comparison",
        link,
    )
    header_index = next(i for i, row in enumerate(rows) if cell(row, 0) == "Item Code")
    lines: list[dict[str, Any]] = []
    totals: dict[str, Any] = {"notes": "Overview totals imported from Drive sheet. Item detail tabs remain source evidence, not approved current pricing."}
    for row in rows[header_index + 1 :]:
        code = str(cell(row, 0) or "").strip()
        if not code:
            continue
        if code == "Overall Total":
            totals.update({
                "total_cost_ex_gst": number(cell(row, 4)),
                "sell_price_ex_gst": number(cell(row, 5)),
                "gross_profit_ex_gst": number(cell(row, 8)),
                "total_labour_hours": number(cell(row, 9)),
            })
            break
        label = " - ".join(str(x).strip() for x in [code, cell(row, 1), cell(row, 2)] if str(x or "").strip())
        lines.append({
            "line_type": "other",
            "line_label": label,
            "quantity": number(cell(row, 3)),
            "unit": "line",
            "total_cost_ex_gst": number(cell(row, 4)),
            "source_line_reference": str(cell(row, 11) or "") or link["source_label"],
            "freshness_status": "needs_review",
            "confidence": "medium",
            "notes": str(cell(row, 12) or cell(row, 10) or "") or None,
            "blocker": "Batch/quote line imported as source evidence only.",
            "raw_payload": {
                "sell_price_ex_gst": number(cell(row, 5)),
                "harrows_price": number(cell(row, 6)),
                "difference": number(cell(row, 7)),
                "profit": number(cell(row, 8)),
                "labour_hours": number(cell(row, 9)),
            },
        })
    version = upsert_version(db, product["id"], "drive-import-2026-06-18", link, totals)
    return {"product_sheets": 1, "versions": 1, "lines": replace_lines(db, version["id"], lines), "observations": 0}


def parse_westimber_calculator(db: Supabase) -> dict[str, int]:
    sheet = SOURCE_SHEETS["westimber_calculator"]
    rows = sheet_values(sheet)
    link = source_link(db, sheet)
    supplier = "Westimber"
    observations: list[dict[str, Any]] = []
    labels = [
        ("Laminating price /m3", 0, 1, "service"),
        ("Face-Laminating price /m3", 5, 6, "service"),
        ("DG panels price /m3", 0, 1, "timber"),
        ("D4S price /m3 (under 200LM)", 5, 6, "timber"),
        ("F2 panels price /m3", 0, 1, "timber"),
        ("D4S price /m3 (over 200LM)", 5, 6, "timber"),
    ]
    for row in rows:
        for expected, label_idx, value_idx, category in labels:
            if str(cell(row, label_idx) or "").strip() == expected:
                value = number(cell(row, value_idx))
                if value is None:
                    continue
                mid = material_id(db, f"westimber-calculator-{slug(expected)}", f"Westimber {expected}", "service" if category == "service" else "timber", supplier, "m3")
                observations.append({
                    "material_id": mid,
                    "supplier_id": supplier_id(db, supplier, "timber"),
                    "source_link_id": link["id"],
                    "source_type": "drive_sheet",
                    "source_label": link["source_label"],
                    "source_url": link["source_url"],
                    "supplier_item_label": expected,
                    "unit": "m3",
                    "unit_cost_ex_gst": value,
                    "confidence": "medium",
                    "review_status": "needs_review",
                    "notes": "Imported from Westimber Price Calculator. Needs supplier/current-price review before approval.",
                    "blocker": "Calculator value only, not approved current price.",
                    "raw_payload": {"sheet_key": "westimber_calculator", "source_label": expected},
                })
    return {"product_sheets": 0, "versions": 0, "lines": 0, "observations": replace_observations(db, link["id"], observations)}


def add_counts(a: dict[str, int], b: dict[str, int]) -> dict[str, int]:
    out = dict(a)
    for key, value in b.items():
        out[key] = out.get(key, 0) + value
    return out


def table_count(db: Supabase, table: str) -> int:
    rows = db.request("GET", f"{table}?select=id")
    return len(rows or [])


def main() -> int:
    url, key = supabase_config()
    db = Supabase(url, key)
    totals: dict[str, int] = {"product_sheets": 0, "versions": 0, "lines": 0, "observations": 0}
    for fn in [parse_quintin_simple, parse_quintin_v1, parse_jo_walsh, parse_element17, parse_westimber_calculator]:
        totals = add_counts(totals, fn(db))
    counts = {
        "costing_suppliers": table_count(db, "costing_suppliers"),
        "costing_materials": table_count(db, "costing_materials"),
        "costing_source_links": table_count(db, "costing_source_links"),
        "costing_price_observations": table_count(db, "costing_price_observations"),
        "costing_current_prices": table_count(db, "costing_current_prices"),
        "product_costing_sheets": table_count(db, "product_costing_sheets"),
        "product_costing_versions": table_count(db, "product_costing_versions"),
        "product_costing_lines": table_count(db, "product_costing_lines"),
    }
    print(json.dumps({"ok": True, "imported_this_run": totals, "table_counts": counts}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
