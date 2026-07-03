#!/usr/bin/env python3
"""
Read-only Meta/Instagram Stories audit helper for Innate.

This script deliberately does not publish, delete, update, schedule, or upload.
It reads the connected Facebook Page / Instagram professional account and downloads
active IG Story media for private audit notes.

Credential lookup order:
1. Environment variables: META_ACCESS_TOKEN, META_PAGE_ID, META_IG_USER_ID, META_API_VERSION
2. Keychain generic password service: innate-meta-access-token
3. Optional local env file: /Users/mack-mini/.hermes/profiles/content/secrets/meta_graph.env

Never commit tokens. The repo .gitignore excludes .env* and .secrets/, but the preferred
secret location is the profile secrets directory above.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import textwrap
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

GRAPH = "https://graph.facebook.com"
DEFAULT_VERSION = "v25.0"
SECRET_ENV_PATH = Path("/Users/mack-mini/.hermes/profiles/content/secrets/meta_graph.env")
AUDIT_ROOT = Path("/Users/mack-mini/innate-mission-control/reference/content-bank/social-audits/stories")


class MetaError(RuntimeError):
    pass


def load_env_file(path: Path = SECRET_ENV_PATH) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


def keychain_password(service: str) -> str | None:
    try:
        res = subprocess.run(
            ["security", "find-generic-password", "-a", os.environ.get("USER", ""), "-s", service, "-w"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=10,
            check=False,
        )
    except Exception:
        return None
    if res.returncode == 0 and res.stdout.strip():
        return res.stdout.strip()
    return None


@dataclass
class MetaConfig:
    access_token: str | None
    page_id: str | None
    ig_user_id: str | None
    version: str = DEFAULT_VERSION

    @classmethod
    def load(cls) -> "MetaConfig":
        file_env = load_env_file()
        token = os.environ.get("META_ACCESS_TOKEN") or file_env.get("META_ACCESS_TOKEN") or keychain_password("innate-meta-access-token")
        return cls(
            access_token=token,
            page_id=os.environ.get("META_PAGE_ID") or file_env.get("META_PAGE_ID"),
            ig_user_id=os.environ.get("META_IG_USER_ID") or file_env.get("META_IG_USER_ID"),
            version=os.environ.get("META_API_VERSION") or file_env.get("META_API_VERSION") or DEFAULT_VERSION,
        )

    def require_token(self) -> str:
        if not self.access_token:
            raise MetaError("Missing META_ACCESS_TOKEN. Store it in env, keychain service innate-meta-access-token, or profile secrets/meta_graph.env")
        return self.access_token

    def url(self, path: str) -> str:
        return f"{GRAPH}/{self.version}/{path.lstrip('/')}"


def redact_error(body: str) -> str:
    # Keep Meta error details useful but avoid accidental token leakage.
    body = body.replace(os.environ.get("META_ACCESS_TOKEN", "__NO_ENV_TOKEN__"), "[REDACTED]")
    return body[:2000]


def graph_get(cfg: MetaConfig, path: str, fields: str | None = None, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {"access_token": cfg.require_token()}
    if fields:
        params["fields"] = fields
    if extra:
        params.update(extra)
    full = cfg.url(path) + "?" + urllib.parse.urlencode(params, doseq=True)
    try:
        with urllib.request.urlopen(full, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise MetaError(f"Meta HTTP {e.code}: {redact_error(body)}") from e
    except urllib.error.URLError as e:
        raise MetaError(f"Meta network error: {e}") from e


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def download_url(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Innate Story Audit/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        path.write_bytes(resp.read())


def discover(cfg: MetaConfig) -> dict[str, Any]:
    me = graph_get(cfg, "me", fields="id,name")
    pages = graph_get(
        cfg,
        "me/accounts",
        fields="id,name,access_token,instagram_business_account{id,username,name},tasks",
    )
    safe_pages = []
    for page in pages.get("data", []):
        safe_pages.append({k: v for k, v in page.items() if k != "access_token"})
    return {"me": me, "pages": safe_pages}


def validate(cfg: MetaConfig) -> dict[str, Any]:
    out: dict[str, Any] = {"token_present": bool(cfg.access_token), "api_version": cfg.version}
    out["me"] = graph_get(cfg, "me", fields="id,name")
    if cfg.page_id:
        out["page"] = graph_get(cfg, cfg.page_id, fields="id,name,instagram_business_account{id,username,name}")
    else:
        out["page"] = "META_PAGE_ID not configured"
    if cfg.ig_user_id:
        out["instagram"] = graph_get(cfg, cfg.ig_user_id, fields="id,username,name,profile_picture_url")
    else:
        out["instagram"] = "META_IG_USER_ID not configured"
    return out


def list_stories(cfg: MetaConfig) -> dict[str, Any]:
    if not cfg.ig_user_id:
        raise MetaError("Missing META_IG_USER_ID. Run discover after adding a token, then save the IG user ID.")
    stories = graph_get(cfg, f"{cfg.ig_user_id}/stories", fields="id,media_type,media_url,thumbnail_url,permalink,timestamp,username,caption")
    enriched = []
    for item in stories.get("data", []):
        story_id = item.get("id")
        if story_id and ("media_url" not in item or "timestamp" not in item):
            try:
                item = graph_get(cfg, story_id, fields="id,media_type,media_url,thumbnail_url,permalink,timestamp,username,caption")
            except MetaError as e:
                item = {"id": story_id, "error": str(e)}
        enriched.append(item)
    return {"data": enriched, "paging": stories.get("paging")}


def audit_pull(cfg: MetaConfig) -> Path:
    stories = list_stories(cfg)
    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d_%H%M%S")
    out_dir = AUDIT_ROOT / stamp
    write_json(out_dir / "stories.json", stories)
    lines = [
        "# Innate IG Stories audit pull",
        "",
        f"Pulled: {datetime.now(timezone.utc).astimezone().isoformat()}",
        "Source: Meta Graph API, read-only.",
        "",
        "## Stories",
        "",
    ]
    for idx, item in enumerate(stories.get("data", []), start=1):
        sid = item.get("id", f"story-{idx}")
        mtype = item.get("media_type", "unknown")
        ts = item.get("timestamp", "unknown")
        media_url = item.get("media_url") or item.get("thumbnail_url")
        local_name = None
        if media_url:
            ext = ".mp4" if mtype == "VIDEO" else ".jpg"
            local_name = f"{idx:02d}-{sid}{ext}"
            try:
                download_url(media_url, out_dir / local_name)
            except Exception as e:
                local_name = f"DOWNLOAD_FAILED: {e}"
        lines.extend([
            f"### Story {idx}",
            f"- id: `{sid}`",
            f"- type: {mtype}",
            f"- timestamp: {ts}",
            f"- local media: {local_name or 'not available'}",
            f"- caption: {item.get('caption') or ''}",
            "- audit status: raw",
            "",
        ])
    (out_dir / "audit-notes.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out_dir


def print_env_template() -> None:
    print(textwrap.dedent(f"""
    # Save as {SECRET_ENV_PATH}
    # Keep this file private. Do not commit it.
    META_API_VERSION={DEFAULT_VERSION}
    META_ACCESS_TOKEN=PASTE_LONG_LIVED_READ_TOKEN_HERE
    META_PAGE_ID=INNATE_FACEBOOK_PAGE_ID
    META_IG_USER_ID=INNATE_INSTAGRAM_PROFESSIONAL_ACCOUNT_ID
    """).strip())


def print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only Meta/Instagram Stories audit helper for Innate")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("doctor", help="Check local setup without calling Meta unless a token is present")
    sub.add_parser("env-template", help="Print private env-file template")
    sub.add_parser("discover", help="Read /me/accounts and connected IG account IDs")
    sub.add_parser("validate", help="Validate token, page ID and IG user ID")
    sub.add_parser("stories", help="List active IG Stories, available for about 24 hours")
    sub.add_parser("pull", help="Download active Stories into the content-bank audit folder")
    args = parser.parse_args()

    cfg = MetaConfig.load()
    try:
        if args.cmd == "doctor":
            status = {
                "script": str(Path(__file__).resolve()),
                "secret_env_path": str(SECRET_ENV_PATH),
                "secret_env_exists": SECRET_ENV_PATH.exists(),
                "keychain_token_present": bool(keychain_password("innate-meta-access-token")),
                "env_token_present": bool(os.environ.get("META_ACCESS_TOKEN")),
                "token_available": bool(cfg.access_token),
                "page_id_configured": bool(cfg.page_id),
                "ig_user_id_configured": bool(cfg.ig_user_id),
                "api_version": cfg.version,
                "audit_root": str(AUDIT_ROOT),
                "mode": "read-only",
            }
            print_json(status)
        elif args.cmd == "env-template":
            print_env_template()
        elif args.cmd == "discover":
            print_json(discover(cfg))
        elif args.cmd == "validate":
            print_json(validate(cfg))
        elif args.cmd == "stories":
            print_json(list_stories(cfg))
        elif args.cmd == "pull":
            out = audit_pull(cfg)
            print(f"Pulled stories to {out}")
        return 0
    except MetaError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
