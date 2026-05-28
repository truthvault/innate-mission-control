#!/usr/bin/env python3
"""Apply the production order-intake SQL via Supabase MCP.

Loads local env files, including .secrets/supabase_setup.env when present. Never
prints secret values. Re-execs through the Hermes Python venv if the current
Python does not have the MCP client package installed.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "reference" / "tuesday" / "supabase-order-intake-schema-2026-05-28.sql"
HERMES_PYTHON = Path("/Users/mack-mini/.hermes/hermes-agent/venv/bin/python")


def load_local_env() -> None:
    for env_path in (ROOT / ".env.local", ROOT / ".env", ROOT / ".secrets" / "supabase_setup.env"):
        if not env_path.exists():
            continue
        for raw in env_path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def ensure_mcp_client() -> None:
    try:
        import mcp  # noqa: F401
    except ModuleNotFoundError:
        if HERMES_PYTHON.exists() and Path(sys.executable) != HERMES_PYTHON:
            os.execv(str(HERMES_PYTHON), [str(HERMES_PYTHON), *sys.argv])
        raise SystemExit("Missing Python MCP client package. Hermes venv was not available.")


async def apply_migration(sql_path: Path, name: str, project_ref: str) -> None:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    if not os.getenv("SUPABASE_ACCESS_TOKEN"):
        raise SystemExit("Missing SUPABASE_ACCESS_TOKEN. Values were not printed.")
    if not project_ref:
        raise SystemExit("Missing SUPABASE_PROJECT_REF.")
    env = os.environ.copy()
    env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + env.get("PATH", "")
    params = StdioServerParameters(
        command="/opt/homebrew/bin/npx",
        args=["-y", "@supabase/mcp-server-supabase"],
        env=env,
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            payload = {"project_id": project_ref, "name": name, "query": sql_path.read_text()}
            result = await session.call_tool("apply_migration", payload)
            print(f"apply_migration result for {sql_path.name}:")
            for content in result.content:
                print(getattr(content, "text", content))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Apply Tuesday order-intake Supabase schema")
    parser.add_argument("--name", default="order_intake_20260528")
    parser.add_argument("--project-ref", default="")
    parser.add_argument("sql_file", nargs="?", default=str(SQL_PATH))
    args = parser.parse_args(argv)
    load_local_env()
    ensure_mcp_client()
    project_ref = args.project_ref or os.getenv("SUPABASE_PROJECT_REF", "")
    sql_path = Path(args.sql_file).expanduser().resolve()
    asyncio.run(apply_migration(sql_path, re.sub(r"[^a-zA-Z0-9_]+", "_", args.name).strip("_"), project_ref))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
