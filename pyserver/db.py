import os
import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from psycopg_pool import ConnectionPool
import psycopg

DATABASE_URL = os.getenv("DATABASE_URL")
USE_PG = bool(DATABASE_URL)

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
DB_FILE = DATA_DIR / "db.json"

_pool: Optional[ConnectionPool] = None


def _ensure_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_FILE.exists():
        DB_FILE.write_text(json.dumps({"users": [], "templates": [], "documents": []}, indent=2), encoding="utf-8")


def _load_file() -> Dict[str, List[Dict[str, Any]]]:
    _ensure_file()
    with DB_FILE.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _save_file(data: Dict[str, List[Dict[str, Any]]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with DB_FILE.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)



def get_pool() -> ConnectionPool:
    global _pool
    if not USE_PG:
        raise RuntimeError("Postgres pool requested but DATABASE_URL unset")
    if _pool is None:
        _pool = ConnectionPool(DATABASE_URL, kwargs={"autocommit": True})
    return _pool



def init_db():
    if not USE_PG:
        _ensure_file()
        return
    pool = get_pool()
    with pool.connection() as con:
        with con.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                  id TEXT PRIMARY KEY,
                  username TEXT UNIQUE NOT NULL,
                  name TEXT NOT NULL,
                  dept TEXT NOT NULL DEFAULT '',
                  role TEXT NOT NULL,
                  password_hash TEXT NOT NULL,
                  created_at BIGINT NOT NULL,
                  updated_at BIGINT NOT NULL
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS templates (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  content TEXT NOT NULL,
                  description TEXT NOT NULL DEFAULT '',
                  created_at BIGINT NOT NULL,
                  updated_at BIGINT NOT NULL
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                  id TEXT PRIMARY KEY,
                  template_id TEXT,
                  content TEXT,
                  data JSONB,
                  rendered TEXT,
                  file_name TEXT,
                  created_at BIGINT NOT NULL,
                  updated_at BIGINT NOT NULL
                )
                """
            )



def list_items(table: str) -> List[Dict[str, Any]]:
    if not USE_PG:
        data = _load_file()
        return [dict(item) for item in data.get(table, [])]
    pool = get_pool()
    with pool.connection() as con:
        with con.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(f"SELECT * FROM {table}")
            return [dict(r) for r in cur.fetchall()]



def find_by_id(table: str, id: str) -> Optional[Dict[str, Any]]:
    if not USE_PG:
        data = _load_file()
        for item in data.get(table, []):
            if item.get("id") == id:
                return dict(item)
        return None
    pool = get_pool()
    with pool.connection() as con:
        with con.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(f"SELECT * FROM {table} WHERE id = %s", (id,))
            r = cur.fetchone()
            return dict(r) if r else None



def add_item(table: str, item: Dict[str, Any]) -> Dict[str, Any]:
    now = int(time.time() * 1000)
    rec = {**item}
    rec.setdefault("id", uuid.uuid4().hex[:12])
    if USE_PG:
        rec.setdefault("created_at", now)
        rec.setdefault("updated_at", now)
        pool = get_pool()
        with pool.connection() as con:
            with con.cursor(row_factory=psycopg.rows.dict_row) as cur:
                if table == "users":
                    cur.execute(
                        """
                        INSERT INTO users (id, username, name, dept, role, password_hash, created_at, updated_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING *
                        """,
                        (
                            rec["id"],
                            rec["username"],
                            rec.get("name") or rec["username"],
                            rec.get("dept", ""),
                            rec.get("role", "editor"),
                            rec["passwordHash"],
                            rec["created_at"],
                            rec["updated_at"],
                        ),
                    )
                elif table == "templates":
                    cur.execute(
                        """
                        INSERT INTO templates (id, name, content, description, created_at, updated_at)
                        VALUES (%s,%s,%s,%s,%s,%s)
                        RETURNING *
                        """,
                        (
                            rec["id"],
                            rec["name"],
                            rec.get("content", ""),
                            rec.get("description", ""),
                            rec["created_at"],
                            rec["updated_at"],
                        ),
                    )
                elif table == "documents":
                    cur.execute(
                        """
                        INSERT INTO documents (id, template_id, content, data, rendered, file_name, created_at, updated_at)
                        VALUES (%s,%s,%s,%s::jsonb,%s,%s,%s,%s)
                        RETURNING *
                        """,
                        (
                            rec["id"],
                            rec.get("templateId"),
                            rec.get("content", ""),
                            json.dumps(rec.get("data") or {}),
                            rec.get("rendered", ""),
                            rec.get("fileName"),
                            rec["created_at"],
                            rec["updated_at"],
                        ),
                    )
                else:
                    raise ValueError("Unknown table")
                return dict(cur.fetchone())
    # File fallback uses camelCase timestamps like Node backend
    rec.setdefault("createdAt", now)
    rec.setdefault("updatedAt", now)
    if table == "users":
        rec.setdefault("dept", "")
        rec.setdefault("role", "editor")
    data = _load_file()
    items = data.setdefault(table, [])
    items.append(rec)
    _save_file(data)
    return dict(rec)



def update_item(table: str, id: str, updater: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    now = int(time.time() * 1000)
    existing = find_by_id(table, id)
    if not existing:
        return None
    if USE_PG:
        pool = get_pool()
        with pool.connection() as con:
            with con.cursor(row_factory=psycopg.rows.dict_row) as cur:
                if table == "users":
                    cur.execute(
                        """
                        UPDATE users SET username=%s, name=%s, dept=%s, role=%s, password_hash=%s, updated_at=%s
                        WHERE id=%s RETURNING *
                        """,
                        (
                            updater.get("username", existing.get("username")),
                            updater.get("name") or existing.get("name") or existing.get("username"),
                            updater.get("dept", existing.get("dept", "")),
                            updater.get("role", existing.get("role", "editor")),
                            updater.get("passwordHash") or existing.get("password_hash"),
                            now,
                            id,
                        ),
                    )
                elif table == "templates":
                    cur.execute(
                        """
                        UPDATE templates SET name=%s, content=%s, description=%s, updated_at=%s
                        WHERE id=%s RETURNING *
                        """,
                        (
                            updater.get("name", existing.get("name")),
                            updater.get("content", existing.get("content", "")),
                            updater.get("description", existing.get("description", "")),
                            now,
                            id,
                        ),
                    )
                elif table == "documents":
                    cur.execute(
                        """
                        UPDATE documents SET template_id=%s, content=%s, data=%s::jsonb, rendered=%s, file_name=%s, updated_at=%s
                        WHERE id=%s RETURNING *
                        """,
                        (
                            updater.get("templateId", existing.get("template_id")),
                            updater.get("content", existing.get("content", "")),
                            json.dumps(updater.get("data", existing.get("data") or {})),
                            updater.get("rendered", existing.get("rendered", "")),
                            updater.get("fileName", existing.get("file_name")),
                            now,
                            id,
                        ),
                    )
                else:
                    raise ValueError("Unknown table")
                return dict(cur.fetchone())
    data = _load_file()
    items = data.get(table, [])
    for idx, existing_item in enumerate(items):
        if existing_item.get("id") == id:
            merged = {**existing_item, **updater}
            merged["updatedAt"] = now
            items[idx] = merged
            _save_file(data)
            return dict(merged)
    return None



def remove_item(table: str, id: str) -> bool:
    if USE_PG:
        pool = get_pool()
        with pool.connection() as con:
            with con.cursor() as cur:
                cur.execute(f"DELETE FROM {table} WHERE id = %s", (id,))
                return cur.rowcount > 0
    data = _load_file()
    items = data.get(table, [])
    new_items = [item for item in items if item.get("id") != id]
    if len(new_items) == len(items):
        return False
    data[table] = new_items
    _save_file(data)
    return True