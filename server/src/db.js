import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = path.join(__dirname, '..', '..', 'data');
const dbFile = path.join(dataDir, 'db.json');

function ensure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    const seed = { users: [], templates: [], documents: [] };
    fs.writeFileSync(dbFile, JSON.stringify(seed, null, 2));
  }
}

export function readDB() {
  ensure();
  const raw = fs.readFileSync(dbFile, 'utf8');
  return JSON.parse(raw);
}

export function writeDB(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

export function add(collection, item) {
  const db = readDB();
  const record = { id: nanoid(12), createdAt: Date.now(), updatedAt: Date.now(), ...item };
  db[collection].push(record);
  writeDB(db);
  return record;
}

export function update(collection, id, updater) {
  const db = readDB();
  const idx = db[collection].findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated = { ...db[collection][idx], ...updater, updatedAt: Date.now() };
  db[collection][idx] = updated;
  writeDB(db);
  return updated;
}

export function remove(collection, id) {
  const db = readDB();
  const idx = db[collection].findIndex((r) => r.id === id);
  if (idx === -1) return false;
  db[collection].splice(idx, 1);
  writeDB(db);
  return true;
}

export function findById(collection, id) {
  const db = readDB();
  return db[collection].find((r) => r.id === id) || null;
}

export function list(collection, filterFn = null) {
  const db = readDB();
  const arr = db[collection] || [];
  return filterFn ? arr.filter(filterFn) : arr;
}

