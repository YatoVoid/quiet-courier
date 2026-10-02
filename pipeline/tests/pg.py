import json
import shutil
import socket
import subprocess
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row

REPO = Path(__file__).resolve().parents[2]
WEB = REPO / "web"
MIGRATIONS = WEB / "db" / "migrations"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_postgres():
    """An in-memory Postgres (PGlite, from web/) with the site's real migrations applied."""
    if not shutil.which("node") or not (WEB / "node_modules" / "@electric-sql" / "pglite-socket").exists():
        pytest.skip("needs node and `npm ci` in web/")
    port = _free_port()
    proc = subprocess.Popen(["node", str(WEB / "test" / "pglite-server.mjs"), str(port)],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    line = proc.stdout.readline()
    if "ready" not in line:
        proc.kill()
        raise RuntimeError(f"pglite did not start: {line}")
    url = f"postgresql://postgres@127.0.0.1:{port}/postgres?sslmode=disable"
    conn = psycopg.connect(url, autocommit=True, row_factory=dict_row)
    journal = json.loads((MIGRATIONS / "meta" / "_journal.json").read_text())
    for entry in journal["entries"]:
        for stmt in (MIGRATIONS / f"{entry['tag']}.sql").read_text().split("--> statement-breakpoint"):
            if stmt.strip():
                conn.execute(stmt)
    return proc, conn, url
