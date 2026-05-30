#!/usr/bin/env python3
"""Narrow Gmail read-only evidence collector for Tuesday Phase 4A preflight."""
from __future__ import annotations

import base64
import datetime as dt
import email.utils
import html
import json
import os
import re
from pathlib import Path
from typing import Any

GMAIL_SOURCE = "gmail"
HTTP_TIMEOUT_SECONDS = 20
MAX_SEARCH_RESULTS = 5
BODY_PREVIEW_LIMIT = 360
FORBIDDEN_MUTATION_TOKENS = [
    "drafts." + "create",
    "drafts." + "se" + "nd",
    "messages." + "se" + "nd",
    "labels." + "mo" + "dify",
    "." + "mo" + "dify(",
    "." + "tr" + "ash(",
    "." + "de" + "lete(",
]


class GmailReadOnlyError(RuntimeError):
    """Raised for sanitized Gmail evidence collector failures."""


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def safe_text(value: Any, limit: int = 240) -> str:
    text = re.sub(r"\s+", " ", str(value or "").replace("—", "-")).strip()
    return text[:limit]


def preview_text(value: Any) -> str:
    return safe_text(value, BODY_PREVIEW_LIMIT)


def normalize_email(value: Any) -> str | None:
    text = safe_text(value, 320)
    _, addr = email.utils.parseaddr(text)
    addr = (addr or text).lower().strip()
    if "@" not in addr or "." not in addr.rsplit("@", 1)[-1]:
        return None
    return addr[:240]


def looks_like_gmail_id(value: Any) -> str | None:
    text = safe_text(value, 160)
    return text if re.fullmatch(r"[A-Za-z0-9_:\-.]{4,160}", text) else None


def extract_inputs(case: dict[str, Any]) -> dict[str, str | None]:
    gmail = case.get("gmail") if isinstance(case.get("gmail"), dict) else {}
    subject = safe_text(gmail.get("subject") or case.get("subject"), 160)
    return {
        "thread_id": looks_like_gmail_id(gmail.get("thread_id") or gmail.get("threadId") or case.get("gmail_thread_id")),
        "message_id": looks_like_gmail_id(gmail.get("message_id") or gmail.get("messageId") or case.get("gmail_message_id")),
        "email": normalize_email(case.get("email") or gmail.get("from") or case.get("customer_email")),
        "subject": subject or None,
        "after": safe_text(case.get("after") or case.get("date_after") or gmail.get("after"), 40) or None,
        "before": safe_text(case.get("before") or case.get("date_before") or gmail.get("before"), 40) or None,
    }


def has_narrow_input(inputs: dict[str, str | None]) -> bool:
    if inputs.get("thread_id") or inputs.get("message_id"):
        return True
    return bool(inputs.get("email") and inputs.get("subject"))


def gmail_config(env: dict[str, str], client: Any | None = None) -> dict[str, str] | None:
    if client is not None:
        return {"mode": "injected"}
    raw_path = env.get("GOOGLE_TOKEN_PATH") or env.get("GMAIL_READONLY_TOKEN_PATH")
    if raw_path:
        path = Path(raw_path).expanduser()
    elif env.get("HERMES_HOME"):
        path = Path(env["HERMES_HOME"]).expanduser() / "google_token.json"
    else:
        return None
    if not path.exists():
        return None
    return {"mode": "token_file", "path": str(path)}


def build_gmail_readonly_client(env: dict[str, str]) -> Any:
    config = gmail_config(env)
    if not config or not config.get("path"):
        raise GmailReadOnlyError("Gmail read-only credentials missing")
    from google.oauth2.credentials import Credentials  # type: ignore
    from google.auth.transport.requests import Request as GoogleAuthRequest  # type: ignore
    from googleapiclient.discovery import build  # type: ignore

    data = json.loads(Path(config["path"]).read_text())
    scopes = ["https://www.googleapis.com/auth/gmail.readonly"]
    creds = Credentials.from_authorized_user_info(data, scopes=scopes)
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleAuthRequest())
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def headers_map(message: dict[str, Any]) -> dict[str, str]:
    headers = (message.get("payload") or {}).get("headers") or []
    return {safe_text(item.get("name"), 80).lower(): str(item.get("value") or "") for item in headers if isinstance(item, dict)}


def all_addresses(value: str) -> set[str]:
    return {addr.lower() for _, addr in email.utils.getaddresses([value or ""]) if addr}


def decode_part_body(part: dict[str, Any]) -> str:
    data = ((part.get("body") or {}).get("data"))
    if not data:
        return ""
    try:
        padded = str(data) + "=" * (-len(str(data)) % 4)
        return base64.urlsafe_b64decode(padded.encode()).decode("utf-8", errors="replace")
    except Exception:
        return ""


def encode_body_for_test(text: str) -> str:
    return base64.urlsafe_b64encode((text or "").encode()).decode().rstrip("=")


def extract_text(payload: dict[str, Any]) -> str:
    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        return decode_part_body(payload)
    if mime == "text/html":
        raw = decode_part_body(payload)
        raw = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
        raw = re.sub(r"(?is)<br\s*/?>", "\n", raw)
        raw = re.sub(r"(?is)</p>", "\n", raw)
        return html.unescape(re.sub(r"(?is)<.*?>", " ", raw))
    parts = payload.get("parts") or []
    return "\n".join(text for text in (extract_text(part) for part in parts if isinstance(part, dict)) if text)


def body_text(message: dict[str, Any]) -> str:
    text = extract_text(message.get("payload") or {})
    text = re.sub(r"\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


def message_time(message: dict[str, Any]) -> int:
    try:
        return int(message.get("internalDate") or 0)
    except Exception:
        return 0


def is_sent_message(message: dict[str, Any]) -> bool:
    labels = {str(label).upper() for label in (message.get("labelIds") or [])}
    if "SENT" in labels:
        return True
    headers = headers_map(message)
    from_addr = normalize_email(headers.get("from")) or ""
    return from_addr.endswith("@innatefurniture.co.nz") or "innate" in from_addr


def summarize_message(message: dict[str, Any] | None) -> dict[str, Any] | None:
    if not message:
        return None
    headers = headers_map(message)
    body = body_text(message)
    return {
        "id": safe_text(message.get("id"), 160),
        "date": safe_text(headers.get("date"), 120),
        "from": safe_text(headers.get("from"), 180),
        "subject": safe_text(headers.get("subject"), 180),
        "snippet": safe_text(message.get("snippet"), 220),
        "body_present": bool(body),
        "body_preview": preview_text(body),
    }


def build_bounded_query(inputs: dict[str, str | None]) -> str | None:
    email_addr = inputs.get("email")
    subject = inputs.get("subject")
    if not email_addr or not subject:
        return None
    words = [word for word in re.findall(r"[A-Za-z0-9][A-Za-z0-9'\-]{2,}", subject) if word.lower() not in {"re", "fwd", "the", "and", "for"}]
    if not words:
        return None
    query = f'(from:{email_addr} OR to:{email_addr}) subject:"{" ".join(words[:6])}"'
    if inputs.get("after"):
        query += f" after:{inputs['after']}"
    if inputs.get("before"):
        query += f" before:{inputs['before']}"
    return query


def fetch_thread(client: Any, inputs: dict[str, str | None]) -> tuple[dict[str, Any] | None, list[str]]:
    warnings: list[str] = []
    user = "me"
    thread_id = inputs.get("thread_id")
    if not thread_id and inputs.get("message_id"):
        msg = client.users().messages().get(userId=user, id=inputs["message_id"], format="metadata", metadataHeaders=["From", "To", "Cc", "Date", "Subject"]).execute()
        thread_id = safe_text(msg.get("threadId"), 160)
    if not thread_id:
        query = build_bounded_query(inputs)
        if not query:
            return None, warnings
        found = client.users().messages().list(userId=user, q=query, maxResults=MAX_SEARCH_RESULTS).execute()
        matches = found.get("messages") or []
        if not matches:
            return None, warnings
        if len(matches) > MAX_SEARCH_RESULTS:
            warnings.append("Gmail search result was capped")
        thread_id = safe_text(matches[0].get("threadId"), 160)
        if not thread_id and matches[0].get("id"):
            msg = client.users().messages().get(userId=user, id=matches[0]["id"], format="metadata", metadataHeaders=["From", "To", "Cc", "Date", "Subject"]).execute()
            thread_id = safe_text(msg.get("threadId"), 160)
    if not thread_id:
        return None, warnings
    thread = client.users().threads().get(userId=user, id=thread_id, format="full").execute()
    return thread, warnings


def collect_gmail_readback(
    case: dict[str, Any],
    env: dict[str, str],
    *,
    client: Any | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    fetched_at = now or utc_now()
    config = gmail_config(env, client)
    if not config:
        return {
            "source": "live_readonly_requested",
            "status": "missing_adapter_or_config",
            "configured_hint_present": bool(env.get("GOOGLE_TOKEN_PATH") or env.get("GMAIL_READONLY_TOKEN_PATH") or env.get("HERMES_HOME")),
            "live_called": False,
            "blockers": ["live Gmail read-only adapter not configured; Gmail full thread/latest inbound/latest sent not collected"],
            "warnings": [],
        }
    inputs = extract_inputs(case)
    if not has_narrow_input(inputs):
        return {
            "source": GMAIL_SOURCE,
            "status": "missing",
            "live_called": False,
            "fetched_at": fetched_at,
            "thread_id": None,
            "message_count": 0,
            "latest_inbound": None,
            "latest_sent": None,
            "has_newer_sent_reply": False,
            "warnings": [],
            "blockers": ["no narrow Gmail thread/message/email+subject input supplied; live read skipped"],
        }
    service = client or build_gmail_readonly_client(env)
    warnings: list[str] = []
    try:
        thread, read_warnings = fetch_thread(service, inputs)
        warnings.extend(read_warnings)
    except Exception as exc:
        return {
            "source": GMAIL_SOURCE,
            "status": "error",
            "live_called": True,
            "fetched_at": fetched_at,
            "thread_id": inputs.get("thread_id"),
            "message_count": 0,
            "latest_inbound": None,
            "latest_sent": None,
            "has_newer_sent_reply": False,
            "warnings": warnings,
            "blockers": ["Gmail read-only GET failed: " + safe_text(type(exc).__name__, 80)],
        }
    if not thread:
        return {
            "source": GMAIL_SOURCE,
            "status": "missing",
            "live_called": True,
            "fetched_at": fetched_at,
            "thread_id": inputs.get("thread_id"),
            "message_count": 0,
            "latest_inbound": None,
            "latest_sent": None,
            "has_newer_sent_reply": False,
            "warnings": warnings,
            "blockers": ["Gmail read-only GET returned no matching thread"],
        }
    messages = [msg for msg in (thread.get("messages") or []) if isinstance(msg, dict)]
    messages.sort(key=message_time)
    inbound = [msg for msg in messages if not is_sent_message(msg)]
    sent = [msg for msg in messages if is_sent_message(msg)]
    latest_inbound = inbound[-1] if inbound else None
    latest_sent = sent[-1] if sent else None
    inbound_body = body_text(latest_inbound or {}) if latest_inbound else ""
    blockers: list[str] = []
    if not latest_inbound or not inbound_body:
        blockers.append("Gmail live thread has no latest inbound full body")
    has_newer = bool(latest_inbound and latest_sent and message_time(latest_sent) > message_time(latest_inbound))
    return {
        "source": GMAIL_SOURCE,
        "status": "collected" if latest_inbound and inbound_body else "missing_or_partial",
        "live_called": True,
        "fetched_at": fetched_at,
        "thread_id": safe_text(thread.get("id") or (latest_inbound or {}).get("threadId") or inputs.get("thread_id"), 160),
        "message_count": len(messages),
        "latest_inbound": summarize_message(latest_inbound),
        "latest_sent": summarize_message(latest_sent),
        "has_newer_sent_reply": has_newer,
        "warnings": warnings,
        "blockers": blockers,
    }
