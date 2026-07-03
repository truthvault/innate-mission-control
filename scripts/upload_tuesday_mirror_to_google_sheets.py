#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"]


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: upload_tuesday_mirror_to_google_sheets.py <workbook.json>")
    workbook_path = Path(sys.argv[1])
    workbook = json.loads(workbook_path.read_text())

    # Tuesday profile has its own Google token. The root ~/.hermes token may be
    # valid for Gmail but missing Sheets scope, so prefer the active profile token.
    token_candidates = [
        Path.home() / ".hermes" / "profiles" / "innate-gmail-push" / "google_token.json",
        Path.home() / ".hermes" / "profiles" / "tuesday" / "google_token.json",
        Path.home() / ".hermes" / "google_token.json",
    ]
    token_path = next((p for p in token_candidates if p.exists()), None)
    if token_path is None:
        raise SystemExit("Missing Google token: checked Tuesday profile and root Hermes token paths")

    creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_path.write_text(creds.to_json())
    if not creds.valid:
        raise SystemExit("Google credentials are not valid for Sheets upload. Re-authorize Google Workspace with Sheets/Drive scopes.")

    sheets = build("sheets", "v4", credentials=creds)

    tab_titles = [tab["name"][:100] for tab in workbook["tabs"]]
    spreadsheet_body = {
        "properties": {"title": workbook["title"]},
        "sheets": [{"properties": {"title": title}} for title in tab_titles],
    }
    spreadsheet = sheets.spreadsheets().create(body=spreadsheet_body, fields="spreadsheetId,spreadsheetUrl,sheets.properties").execute()
    spreadsheet_id = spreadsheet["spreadsheetId"]
    sheet_props = {s["properties"]["title"]: s["properties"] for s in spreadsheet["sheets"]}

    value_ranges = []
    for tab in workbook["tabs"]:
        title = tab["name"][:100]
        values = tab["values"]
        value_ranges.append({"range": f"'{title}'!A1", "values": values})

    sheets.spreadsheets().values().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"valueInputOption": "RAW", "data": value_ranges},
    ).execute()

    requests = []
    for tab in workbook["tabs"]:
        title = tab["name"][:100]
        props = sheet_props[title]
        sheet_id = props["sheetId"]
        values = tab["values"]
        row_count = max(len(values) + 10, 100)
        col_count = max((len(values[0]) if values else 1) + 5, 26)
        requests.append({
            "updateSheetProperties": {
                "properties": {"sheetId": sheet_id, "gridProperties": {"frozenRowCount": 1, "rowCount": row_count, "columnCount": col_count}},
                "fields": "gridProperties.frozenRowCount,gridProperties.rowCount,gridProperties.columnCount",
            }
        })
        if values and len(values) > 1:
            requests.append({
                "setBasicFilter": {
                    "filter": {"range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": len(values), "startColumnIndex": 0, "endColumnIndex": len(values[0])}}
                }
            })
        requests.append({
            "repeatCell": {
                "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1},
                "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.1, "green": 0.1, "blue": 0.1}, "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": True}}},
                "fields": "userEnteredFormat(backgroundColor,textFormat)",
            }
        })
        if title.startswith("RAW "):
            requests.append({
                "addProtectedRange": {
                    "protectedRange": {
                        "range": {"sheetId": sheet_id},
                        "description": "RAW Supabase mirror — do not edit. Add corrections to FIX tabs.",
                        "warningOnly": True,
                    }
                }
            })
    # Add a few conditional formatting rules on the Needs Review and Source Health sheets.
    for target in ["VIEW Needs Review", "VIEW Source Health", "VIEW Orders", "VIEW Leads", "VIEW Samples"]:
        if target in sheet_props:
            sid = sheet_props[target]["sheetId"]
            requests.append({
                "addConditionalFormatRule": {
                    "rule": {
                        "ranges": [{"sheetId": sid}],
                        "booleanRule": {
                            "condition": {"type": "TEXT_CONTAINS", "values": [{"userEnteredValue": "red"}]},
                            "format": {"backgroundColor": {"red": 0.96, "green": 0.8, "blue": 0.78}},
                        },
                    },
                    "index": 0,
                }
            })
            requests.append({
                "addConditionalFormatRule": {
                    "rule": {
                        "ranges": [{"sheetId": sid}],
                        "booleanRule": {
                            "condition": {"type": "TEXT_CONTAINS", "values": [{"userEnteredValue": "yes"}]},
                            "format": {"backgroundColor": {"red": 1.0, "green": 0.92, "blue": 0.72}},
                        },
                    },
                    "index": 0,
                }
            })

    if requests:
        sheets.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()

    result = {
        "spreadsheetId": spreadsheet_id,
        "spreadsheetUrl": spreadsheet["spreadsheetUrl"],
        "title": workbook["title"],
        "tabs": len(workbook["tabs"]),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
