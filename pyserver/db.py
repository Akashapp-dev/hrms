import json
import os
import threading
from typing import Any, Dict, List, Optional

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'db.json'))
_lock = threading.Lock()


def _ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if not os.path.exists(DB_PATH):
        with open(DB_PATH, 'w', encoding='utf-8') as f:
            json.dump({"users": [], "templates": [], "documents": []}, f)


def read_db() -> Dict[str, Any]:
    _ensure_db()
    with _lock:
        with open(DB_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)


def write_db(db: Dict[str, Any]):
    with _lock:
        with open(DB_PATH, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False)


def list_items(collection: str) -> List[Dict[str, Any]]:
    db = read_db()
    return db.get(collection, [])


def add_item(collection: str, item: Dict[str, Any]) -> Dict[str, Any]:
    db = read_db()
    arr = db.setdefault(collection, [])
    # simple id: incrementing int or string
    next_id = str(max([int(x['id']) for x in arr if str(x.get('id','0')).isdigit()] + [0]) + 1)
    item = {**item, 'id': item.get('id') or next_id, 'createdAt': item.get('createdAt') or _now(), 'updatedAt': _now()}
    arr.append(item)
    write_db(db)
    return item


def update_item(collection: str, id_: str, changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    db = read_db()
    arr = db.get(collection, [])
    for i, it in enumerate(arr):
        if str(it.get('id')) == str(id_):
            updated = {**it, **changes, 'updatedAt': _now()}
            arr[i] = updated
            write_db(db)
            return updated
    return None


def remove_item(collection: str, id_: str) -> bool:
    db = read_db()
    arr = db.get(collection, [])
    n = len(arr)
    arr[:] = [x for x in arr if str(x.get('id')) != str(id_)]
    write_db(db)
    return len(arr) != n


def find_by_id(collection: str, id_: str) -> Optional[Dict[str, Any]]:
    return next((x for x in list_items(collection) if str(x.get('id')) == str(id_)), None)


def _now():
    import time
    return int(time.time() * 1000)

