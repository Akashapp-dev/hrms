// One-time migration: import data/db.json into Postgres (Neon)
// Usage:
//   - PowerShell (Windows):  $env:DATABASE_URL='postgres://...'; npm --prefix server run migrate:json
//   - Bash:                  DATABASE_URL='postgres://...' npm --prefix server run migrate:json

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const dsn = process.env.DATABASE_URL || process.argv[2];
  if (!dsn) {
    console.error('DATABASE_URL not set. Pass as env var or first argument.');
    process.exit(1);
  }
  const sql = neon(dsn);

  // Ensure tables
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

  // Load JSON
  const jsonPath = path.resolve(__dirname, '..', '..', 'data', 'db.json');
  let raw;
  try {
    raw = await readFile(jsonPath, 'utf8');
  } catch (e) {
    console.error('Failed to read data/db.json:', e.message);
    process.exit(1);
  }
  const data = JSON.parse(raw || '{}');
  const users = Array.isArray(data.users) ? data.users : [];
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const documents = Array.isArray(data.documents) ? data.documents : [];

  let uCount = 0, tCount = 0, dCount = 0;

  // Users
  for (const u of users) {
    const created = Number(u.createdAt || Date.now());
    const updated = Number(u.updatedAt || created);
    try {
      await sql`INSERT INTO users (id, username, name, dept, role, password_hash, created_at, updated_at)
        VALUES (${u.id}, ${u.username}, ${u.name || u.username}, ${u.dept || ''}, ${u.role || 'editor'}, ${u.passwordHash || ''}, ${created}, ${updated})
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          name = EXCLUDED.name,
          dept = EXCLUDED.dept,
          role = EXCLUDED.role,
          password_hash = EXCLUDED.password_hash,
          created_at = LEAST(users.created_at, EXCLUDED.created_at),
          updated_at = GREATEST(users.updated_at, EXCLUDED.updated_at)`;
      uCount++;
    } catch (e) {
      console.warn(`User ${u.id || u.username} skipped:`, e.message);
    }
  }

  // Templates
  for (const t of templates) {
    const created = Number(t.createdAt || Date.now());
    const updated = Number(t.updatedAt || created);
    try {
      await sql`INSERT INTO templates (id, name, content, description, created_at, updated_at)
        VALUES (${t.id}, ${t.name}, ${t.content || ''}, ${t.description || ''}, ${created}, ${updated})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          content = EXCLUDED.content,
          description = EXCLUDED.description,
          created_at = LEAST(templates.created_at, EXCLUDED.created_at),
          updated_at = GREATEST(templates.updated_at, EXCLUDED.updated_at)`;
      tCount++;
    } catch (e) {
      console.warn(`Template ${t.id || t.name} skipped:`, e.message);
    }
  }

  // Documents
  for (const d of documents) {
    const created = Number(d.createdAt || Date.now());
    const updated = Number(d.updatedAt || created);
    try {
      await sql`INSERT INTO documents (id, template_id, content, data, rendered, file_name, created_at, updated_at)
        VALUES (${d.id}, ${d.templateId || null}, ${d.content || ''}, ${sql.json(d.data || {})}, ${d.rendered || ''}, ${d.fileName || null}, ${created}, ${updated})
        ON CONFLICT (id) DO UPDATE SET
          template_id = EXCLUDED.template_id,
          content = EXCLUDED.content,
          data = EXCLUDED.data,
          rendered = EXCLUDED.rendered,
          file_name = EXCLUDED.file_name,
          created_at = LEAST(documents.created_at, EXCLUDED.created_at),
          updated_at = GREATEST(documents.updated_at, EXCLUDED.updated_at)`;
      dCount++;
    } catch (e) {
      console.warn(`Document ${d.id} skipped:`, e.message);
    }
  }

  console.log(`Migrated: users=${uCount}, templates=${tCount}, documents=${dCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

