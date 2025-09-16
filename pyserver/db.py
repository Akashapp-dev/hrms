import os
from typing import Any, Dict, List, Optional

from psycopg_pool import ConnectionPool
import psycopg

DATABASE_URL = os.getenv("DATABASE_URL")

_pool: Optional[ConnectionPool] = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL not set for Python backend")
        _pool = ConnectionPool(DATABASE_URL, kwargs={"autocommit": True})
    return _pool


def init_db():
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
    pool = get_pool()
    with pool.connection() as con:
        with con.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(f"SELECT * FROM {table}")
            return [dict(r) for r in cur.fetchall()]


def find_by_id(table: str, id: str) -> Optional[Dict[str, Any]]:
    pool = get_pool()
    with pool.connection() as con:
        with con.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(f"SELECT * FROM {table} WHERE id = %s", (id,))
            r = cur.fetchone()
            return dict(r) if r else None


def add_item(table: str, item: Dict[str, Any]) -> Dict[str, Any]:
    import time, uuid, json
    now = int(time.time() * 1000)
    rec = {"id": item.get("id") or uuid.uuid4().hex[:12], **item}
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
            row = cur.fetchone()
            return dict(row)


def update_item(table: str, id: str, updater: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    import time, json
    pool = get_pool()
    now = int(time.time() * 1000)
    existing = find_by_id(table, id)
    if not existing:
        return None
    merged = {**existing, **updater}
    merged["updated_at"] = now
    with pool.connection() as con:
        with con.cursor(row_factory=psycopg.rows.dict_row) as cur:
            if table == "users":
                cur.execute(
                    """
                    UPDATE users SET username=%s, name=%s, dept=%s, role=%s, password_hash=%s, updated_at=%s
                    WHERE id=%s RETURNING *
                    """,
                    (
                        merged["username"],
                        merged.get("name") or merged["username"],
                        merged.get("dept", ""),
                        merged.get("role", "editor"),
                        merged.get("passwordHash") or existing.get("password_hash"),
                        merged["updated_at"],
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
                        merged["name"],
                        merged.get("content", ""),
                        merged.get("description", ""),
                        merged["updated_at"],
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
                        merged.get("templateId"),
                        merged.get("content", ""),
                        json.dumps(merged.get("data") or {}),
                        merged.get("rendered", ""),
                        merged.get("fileName"),
                        merged["updated_at"],
                        id,
                    ),
                )
            else:
                raise ValueError("Unknown table")
            return dict(cur.fetchone())


def remove_item(table: str, id: str) -> bool:
    pool = get_pool()
    with pool.connection() as con:
        with con.cursor() as cur:
            cur.execute(f"DELETE FROM {table} WHERE id = %s", (id,))
            return cur.rowcount > 0

