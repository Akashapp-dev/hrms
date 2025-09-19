import '../load-env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { nanoid } from 'nanoid';
import { neon } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const usePg = (process.env.DATA_MODE || '').toLowerCase() !== 'json' && !!process.env.DATABASE_URL;
const sql = usePg ? neon(process.env.DATABASE_URL) : null;

// ---------------- File fallback for local/dev ----------------
const dataDir = process.env.DATA_DIR ? process.env.DATA_DIR : path.join(__dirname, '..', '..', 'data');
const dbFile = path.join(dataDir, 'db.json');
function fileEnsure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    const seed = { users: [], templates: [], documents: [] };
    fs.writeFileSync(dbFile, JSON.stringify(seed, null, 2));
  }
}
function fileRead() {
  fileEnsure();
  const raw = fs.readFileSync(dbFile, 'utf8');
  return JSON.parse(raw);
}
function fileWrite(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

// ---------------- Postgres helpers ----------------
async function createTables() {
  await sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    dept TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    template_id TEXT,
    content TEXT,
    data JSONB,
    rendered TEXT,
    file_name TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`;
}

function rowToUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    dept: r.dept || '',
    role: r.role,
    passwordHash: r.password_hash,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}
function rowToTemplate(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    content: r.content,
    description: r.description || '',
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}
function rowToDocument(r) {
  if (!r) return null;
  let dataVal = r.data;
  if (typeof dataVal === 'string') {
    try { dataVal = JSON.parse(dataVal); } catch { /* keep as string if invalid */ }
  }
  return {
    id: r.id,
    templateId: r.template_id,
    content: r.content,
    data: dataVal || {},
    rendered: r.rendered,
    fileName: r.file_name || null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export async function init() {
  if (usePg) {
    await createTables();
  } else {
    fileEnsure();
  }
}

export async function list(collection, filterFn = null) {
  if (!usePg) {
    const db = fileRead();
    const arr = db[collection] || [];
    return filterFn ? arr.filter(filterFn) : arr;
  }
  if (collection === 'users') {
    const rows = await sql`SELECT id, username, name, dept, role, password_hash, created_at, updated_at FROM users`;
    const out = rows.map(rowToUser);
    return filterFn ? out.filter(filterFn) : out;
  }
  if (collection === 'templates') {
    const rows = await sql`SELECT id, name, content, description, created_at, updated_at FROM templates`;
    const out = rows.map(rowToTemplate);
    return filterFn ? out.filter(filterFn) : out;
  }
  if (collection === 'documents') {
    const rows = await sql`SELECT id, template_id, content, data, rendered, file_name, created_at, updated_at FROM documents`;
    const out = rows.map(rowToDocument);
    return filterFn ? out.filter(filterFn) : out;
  }
  return [];
}

export async function findById(collection, id) {
  if (!usePg) {
    const db = fileRead();
    return db[collection].find((r) => r.id === id) || null;
  }
  if (collection === 'users') {
    const rows = await sql`SELECT id, username, name, dept, role, password_hash, created_at, updated_at FROM users WHERE id = ${id}`;
    return rowToUser(rows[0]);
  }
  if (collection === 'templates') {
    const rows = await sql`SELECT id, name, content, description, created_at, updated_at FROM templates WHERE id = ${id}`;
    return rowToTemplate(rows[0]);
  }
  if (collection === 'documents') {
    const rows = await sql`SELECT id, template_id, content, data, rendered, file_name, created_at, updated_at FROM documents WHERE id = ${id}`;
    return rowToDocument(rows[0]);
  }
  return null;
}

export async function add(collection, item) {
  const now = Date.now();
  const id = item.id || nanoid(12);
  if (!usePg) {
    const db = fileRead();
    const record = { id, createdAt: now, updatedAt: now, ...item };
    db[collection].push(record);
    fileWrite(db);
    return record;
  }
  if (collection === 'users') {
    const rows = await sql`INSERT INTO users (id, username, name, dept, role, password_hash, created_at, updated_at)
      VALUES (${id}, ${item.username}, ${item.name || item.username}, ${item.dept || ''}, ${item.role || 'editor'}, ${item.passwordHash}, ${now}, ${now})
      RETURNING id, username, name, dept, role, password_hash, created_at, updated_at`;
    return rowToUser(rows[0]);
  }
  if (collection === 'templates') {
    const rows = await sql`INSERT INTO templates (id, name, content, description, created_at, updated_at)
      VALUES (${id}, ${item.name}, ${item.content}, ${item.description || ''}, ${now}, ${now})
      RETURNING id, name, content, description, created_at, updated_at`;
    return rowToTemplate(rows[0]);
  }
  if (collection === 'documents') {
    const rows = await sql`INSERT INTO documents (id, template_id, content, data, rendered, file_name, created_at, updated_at)
      VALUES (${id}, ${item.templateId || null}, ${item.content || ''}, ${JSON.stringify(item.data || {})}::jsonb, ${item.rendered || ''}, ${item.fileName || null}, ${now}, ${now})
      RETURNING id, template_id, content, data, rendered, file_name, created_at, updated_at`;
    return rowToDocument(rows[0]);
  }
  throw new Error(`Unknown collection: ${collection}`);
}

export async function update(collection, id, updater) {
  const now = Date.now();
  if (!usePg) {
    const db = fileRead();
    const idx = db[collection].findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const updated = { ...db[collection][idx], ...updater, updatedAt: now };
    db[collection][idx] = updated;
    fileWrite(db);
    return updated;
  }
  if (collection === 'users') {
    const existing = await findById('users', id);
    if (!existing) return null;
    const merged = { ...existing, ...updater };
    const rows = await sql`UPDATE users SET
      username = ${merged.username},
      name = ${merged.name},
      dept = ${merged.dept || ''},
      role = ${merged.role},
      password_hash = ${merged.passwordHash},
      updated_at = ${now}
      WHERE id = ${id}
      RETURNING id, username, name, dept, role, password_hash, created_at, updated_at`;
    return rowToUser(rows[0]);
  }
  if (collection === 'templates') {
    const existing = await findById('templates', id);
    if (!existing) return null;
    const merged = { ...existing, ...updater };
    const rows = await sql`UPDATE templates SET
      name = ${merged.name},
      content = ${merged.content},
      description = ${merged.description || ''},
      updated_at = ${now}
      WHERE id = ${id}
      RETURNING id, name, content, description, created_at, updated_at`;
    return rowToTemplate(rows[0]);
  }
  if (collection === 'documents') {
    const existing = await findById('documents', id);
    if (!existing) return null;
    const merged = { ...existing, ...updater };
    const rows = await sql`UPDATE documents SET
      template_id = ${merged.templateId || null},
      content = ${merged.content || ''},
      data = ${JSON.stringify(merged.data || {})}::jsonb,
      rendered = ${merged.rendered || ''},
      file_name = ${merged.fileName || null},
      updated_at = ${now}
      WHERE id = ${id}
      RETURNING id, template_id, content, data, rendered, file_name, created_at, updated_at`;
    return rowToDocument(rows[0]);
  }
  throw new Error(`Unknown collection: ${collection}`);
}

export async function remove(collection, id) {
  if (!usePg) {
    const db = fileRead();
    const idx = db[collection].findIndex((r) => r.id === id);
    if (idx === -1) return false;
    db[collection].splice(idx, 1);
    fileWrite(db);
    return true;
  }
  if (collection === 'users') {
    await sql`DELETE FROM users WHERE id = ${id}`;
    return true;
  }
  if (collection === 'templates') {
    await sql`DELETE FROM templates WHERE id = ${id}`;
    return true;
  }
  if (collection === 'documents') {
    await sql`DELETE FROM documents WHERE id = ${id}`;
    return true;
  }
  throw new Error(`Unknown collection: ${collection}`);
}
