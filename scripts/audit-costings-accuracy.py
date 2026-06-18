#!/usr/bin/env python3
"""Audit and safely archive unverified Tuesday Costings rows.

This helper deliberately keeps all external writes inside Tuesday Costings
Supabase tables and only when called with --apply.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ENV_PATH = Path("/Users/mack-mini/innate-mission-control/.env.local")
DRIVE_HELPER = "/Users/mack-mini/.local/bin/hermes-drive-readonly"
GMAIL_HELPER = "/Users/mack-mini/.local/bin/hermes-gmail-readonly"
REPORT_DIR = Path("reports/costings-accuracy-2026-06-18")
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
SOURCE_SHEETS = {
    "11Gtdqog3w9NkLZT-XlPPEatzF_OR15_4m3mDr0RD3Fg": "Overview!A1:Z120",
    "1jNKiXhaojVJVvd2nGZBjUq2sxdLFgGgE8w9swltW8tc": "Simple costing!A1:Z120",
    "1RJM1HKi6QCRePtCEpNRbTrrRFAjYOIKGaN4jGMLYuYk": "Sheet1!A1:Z120",
    "1uZBoLwz07DXnUAJwH8l83ExzG4-Dce7xkn74HK6Tqzc": "Summary!A1:Z120",
    "1YgMmuf9WRuZ9MluoIJI8Tw_3A7CGf7a4NWlBhD00fFc": "Sheet1!A1:Z120",
}


def load_env() -> None:
    if not ENV_PATH.exists():
        raise SystemExit(f"Missing env file: {ENV_PATH}")
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Supabase:
    def __init__(self) -> None:
        load_env()
        self.url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or ""
        if not self.url or not self.key:
            raise SystemExit("Missing Supabase URL or service key")

    def request(self, method: str, path: str, payload: Any | None = None, prefer: str | None = None) -> Any:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        req = Request(f"{self.url}/rest/v1/{path}", data=data, method=method, headers=headers)
        try:
            with urlopen(req, timeout=45) as response:
                text = response.read().decode("utf-8")
                return json.loads(text) if text else None
        except HTTPError as err:
            body = err.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase {method} {path} failed: HTTP {err.code} {body[:700]}") from err

    def rows(self, path: str) -> list[dict[str, Any]]:
        return self.request("GET", path) or []

    def count(self, table: str, query: str = "") -> int:
        suffix = f"&{query}" if query else ""
        rows = self.rows(f"{table}?select=id{suffix}&limit=10000")
        return len(rows)

    def patch(self, table: str, query: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        return self.request("PATCH", f"{table}?{query}", payload, prefer="return=representation") or []

    def post(self, table: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        return self.request("POST", table, payload, prefer="return=representation") or []


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True))


def sheet_read(external_id: str, cell_range: str) -> dict[str, Any]:
    proc = subprocess.run([DRIVE_HELPER, "sheet", external_id, cell_range], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    if proc.returncode != 0:
        return {"ok": False, "error": (proc.stderr or proc.stdout).strip()[:700]}
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as err:
        return {"ok": False, "error": f"JSON decode failed: {err}"}
    values = payload.get("values") or []
    digest = hashlib.sha256(json.dumps(values, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return {
        "ok": bool(payload.get("ok")),
        "title": payload.get("title") or payload.get("name"),
        "range": cell_range,
        "row_count": len(values),
        "non_empty_row_count": sum(1 for row in values if any(str(cell).strip() for cell in row)),
        "sha256": digest,
        "sample_rows": values[:8],
    }


def search_helper(helper: str, command: str, terms: list[str]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for term in terms:
        proc = subprocess.run([helper, command, term], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        entry: dict[str, Any] = {"term": term, "ok": proc.returncode == 0}
        if proc.returncode != 0:
            entry["error"] = (proc.stderr or proc.stdout).strip()[:700]
        else:
            try:
                parsed = json.loads(proc.stdout)
            except json.JSONDecodeError:
                parsed = {"raw": proc.stdout[:1200]}
            entry["result"] = parsed
        results.append(entry)
    return results


def snapshot(db: Supabase) -> dict[str, Any]:
    data: dict[str, Any] = {"captured_at": now_iso(), "tables": {}, "views": {}}
    for table in TABLES:
        data["tables"][table] = db.rows(f"{table}?select=*&limit=10000")
    for view in VIEWS:
        data["views"][view] = db.rows(f"{view}?select=*&limit=10000")
    return data


def counts(db: Supabase) -> dict[str, Any]:
    result: dict[str, Any] = {"captured_at": now_iso(), "tables": {}, "views": {}}
    for table in TABLES:
        rows = db.rows(f"{table}?select=*&limit=5")
        result["tables"][table] = {"count": db.count(table), "sample": rows}
    for view in VIEWS:
        rows = db.rows(f"{view}?select=*&limit=5")
        result["views"][view] = {"count": db.count(view), "sample": rows}
    return result


def active_unverified(db: Supabase) -> dict[str, list[dict[str, Any]]]:
    return {
        "materials": db.rows("costing_materials?select=id,name,internal_code,is_active&is_active=eq.true&limit=10000"),
        "observations": db.rows("costing_price_observations?select=id,material_id,source_label,review_status,confidence,blocker&review_status=neq.rejected&limit=10000"),
        "current_prices": db.rows("costing_current_prices?select=id,material_id,status&status=eq.approved&limit=10000"),
        "product_sheets": db.rows("product_costing_sheets?select=id,product_name,product_code,status&status=neq.archived&limit=10000"),
        "product_versions": db.rows("product_costing_versions?select=id,sheet_id,ready_to_quote_status,approval_status&approval_status=neq.rejected&limit=10000"),
        "product_lines": db.rows("product_costing_lines?select=id,version_id,line_label,freshness_status,confidence&freshness_status=neq.missing_source&limit=10000"),
    }


def audit_event(db: Supabase, entity_type: str, entity_id: str, label: str, details: dict[str, Any]) -> None:
    db.post("costing_audit_events", {
        "event_type": "review",
        "entity_type": entity_type,
        "entity_id": entity_id,
        "event_label": label,
        "event_status": "succeeded",
        "actor": "Hermes Tuesday Costings accuracy audit 2026-06-18",
        "details": details,
    })


def apply_archive(db: Supabase) -> dict[str, Any]:
    changed: dict[str, Any] = {"materials": [], "observations": [], "current_prices": [], "product_sheets": [], "product_versions": [], "product_lines": []}
    reason = "Removed from active Costings/Orders views on 2026-06-18 accuracy audit: live evidence was not reverified to 100% accuracy during this worker run."

    for row in active_unverified(db)["current_prices"]:
        rows = db.patch("costing_current_prices", f"id=eq.{row['id']}", {"status": "rejected", "approval_note": reason})
        changed["current_prices"].extend(rows)
        audit_event(db, "current_price", row["id"], "Rejected unverified current price", {"reason": reason})

    for row in active_unverified(db)["observations"]:
        rows = db.patch("costing_price_observations", f"id=eq.{row['id']}", {"review_status": "rejected", "confidence": "unknown", "blocker": reason})
        changed["observations"].extend(rows)
        audit_event(db, "price_observation", row["id"], "Rejected unverified price observation", {"reason": reason, "previous_review_status": row.get("review_status")})

    for row in active_unverified(db)["product_versions"]:
        rows = db.patch("product_costing_versions", f"id=eq.{row['id']}", {
            "ready_to_quote_status": "blocked",
            "approval_status": "rejected",
            "blocker": reason,
            "notes": "Source can be reopened in some cases, but imported totals/line costs were not independently reverified against exact source row/cell and supplier/Xero proof.",
        })
        changed["product_versions"].extend(rows)
        audit_event(db, "product_version", row["id"], "Rejected unverified product costing version", {"reason": reason})

    for row in active_unverified(db)["product_lines"]:
        rows = db.patch("product_costing_lines", f"id=eq.{row['id']}", {"freshness_status": "missing_source", "confidence": "unknown", "blocker": reason})
        changed["product_lines"].extend(rows)
        audit_event(db, "product_line", row["id"], "Marked product costing line unverified", {"reason": reason, "line_label": row.get("line_label")})

    for row in active_unverified(db)["product_sheets"]:
        rows = db.patch("product_costing_sheets", f"id=eq.{row['id']}", {"status": "archived", "blocker": reason})
        changed["product_sheets"].extend(rows)
        audit_event(db, "product_sheet", row["id"], "Archived unverified product costing sheet", {"reason": reason, "product_name": row.get("product_name")})

    for row in active_unverified(db)["materials"]:
        rows = db.patch("costing_materials", f"id=eq.{row['id']}", {"is_active": False, "notes": reason})
        changed["materials"].extend(rows)
        audit_event(db, "material", row["id"], "Deactivated unverified material", {"reason": reason, "name": row.get("name")})

    return changed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Archive/reject/deactivate all currently active unverified costing rows.")
    args = parser.parse_args()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    db = Supabase()

    before = counts(db)
    write_json(REPORT_DIR / "before-counts-and-samples.json", before)
    snap = snapshot(db)
    write_json(REPORT_DIR / "backup-before-mutation.json", snap)

    evidence = {
        "captured_at": now_iso(),
        "drive_sheets": {external_id: sheet_read(external_id, cell_range) for external_id, cell_range in SOURCE_SHEETS.items()},
        "drive_searches": search_helper(DRIVE_HELPER, "search", ["costing", "price calculator", "Westimber", "TubeFab", "Vulcan", "steel", "Reverse Angled Steel", "Crossroads", "Quintin", "Jo Walsh", "Element 17", "Harrows", "Timber Vision"]),
        "gmail_searches": search_helper(GMAIL_HELPER, "search", ["Westimber", "panels@westimber.co.nz", "TubeFab", "Vulcan", "NZ Steel", "steel base", "Reverse Angled Steel", "Crossroads", "Product Costing", "price", "cost", "quote", "Jo Walsh", "Quintin", "Element 17", "Harrows"]),
    }
    write_json(REPORT_DIR / "evidence-searches.json", evidence)

    changed: dict[str, Any] = {}
    if args.apply:
        changed = apply_archive(db)
        write_json(REPORT_DIR / "changed-rows.json", changed)

    after = counts(db)
    write_json(REPORT_DIR / "after-counts-and-samples.json", after)
    print(json.dumps({
        "ok": True,
        "apply": args.apply,
        "before_tables": {k: v["count"] for k, v in before["tables"].items()},
        "before_views": {k: v["count"] for k, v in before["views"].items()},
        "after_tables": {k: v["count"] for k, v in after["tables"].items()},
        "after_views": {k: v["count"] for k, v in after["views"].items()},
        "changed_counts": {k: len(v) for k, v in changed.items()},
        "report_dir": str(REPORT_DIR),
    }, indent=2))


if __name__ == "__main__":
    main()
