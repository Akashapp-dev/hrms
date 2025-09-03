// src/templates.js
import express from 'express';
import mammoth from 'mammoth';
import multer from 'multer';
import { add, findById, list, remove, update } from './db.js';

export const templatesRouter = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

/* ----------------------------- helpers ----------------------------- */

function toSafeVar(str, idx) {
  if (!str) return `field_${idx}`;
  const s = String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || `field_${idx}`;
}

/**
 * Normalize HTML produced by DOCX -> HTML (Word/Mammoth) to reduce large gaps.
 * - removes empty <p>, &nbsp; paragraphs
 * - collapses multiple <br>
 * - trims whitespace between tags
 */
function normalizeHtml(html = '') {
  if (!html || typeof html !== 'string') return '';
  return html
    // remove completely empty paragraphs
    .replace(/<p>\s*<\/p>/gi, '')
    // remove paragraphs that only contain &nbsp; or spaces
    .replace(/<p>(?:&nbsp;|\s)+<\/p>/gi, '')
    // collapse multiple <br> runs into a single <br>
    .replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
    // trim whitespace between tags to avoid accidental gaps
    .replace(/>\s+</g, '><');
}

/**
 * Replace yellow-highlighted spans/blocks with {{placeholders}} and collect defaults.
 * We look for inline style background-color: yellow / #ffff00 on any tag.
 */
function extractHighlightedPlaceholders(html) {
  if (!html || typeof html !== 'string') return { html: '', vars: [], defaults: {} };
  let idx = 1;
  const defaults = {};
  const vars = [];

  // Any tag with style containing background-color: yellow / #ffff00
  const pattern =
    /<([a-zA-Z0-9]+)([^>]*style\s*=\s*"(?:[^"]*?\bbackground(?:-color)?\s*:\s*(?:yellow|#?ffff00)[^"]*)")[^>]*>([\s\S]*?)<\/\1>/gi;

  const out = html.replace(pattern, (_full, _tag, _attrs, inner) => {
    // extract plain text of the highlighted area to propose a key / default
    const text = (inner || '').replace(/<[^>]+>/g, '').trim();
    const key = toSafeVar(text, idx++);
    if (!vars.includes(key)) vars.push(key);
    if (defaults[key] == null) defaults[key] = text || '';
    return `{{${key}}}`;
  });

  return { html: out, vars, defaults };
}

/* ----------------------------- routes ----------------------------- */

// List templates
templatesRouter.get('/', (req, res) => {
  const items = list('templates');
  res.json({ items });
});

// Create template
templatesRouter.post('/', (req, res) => {
  if (req.user?.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
  const { name, content, description } = req.body || {};
  if (!name || !content) return res.status(400).json({ error: 'name and content required' });
  const t = add('templates', { name, content, description: description || '' });
  res.json({ item: t });
});

// Update template
templatesRouter.put('/:id', (req, res) => {
  if (req.user?.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  const { name, content, description } = req.body || {};
  const t = update('templates', id, { name, content, description: description || '' });
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ item: t });
});

// Delete template
templatesRouter.delete('/:id', (req, res) => {
  if (req.user?.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  const ok = remove('templates', id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Get template by id
templatesRouter.get('/:id', (req, res) => {
  const t = findById('templates', req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ item: t });
});

/**
 * Import a template from an uploaded file (.html/.htm/.docx)
 * - For .docx, uses Mammoth to convert to HTML
 * - Normalizes spacing to avoid large gaps
 * - Replaces yellow-highlighted regions with {{placeholders}}
 * - Returns proposed variable list + defaults
 */
templatesRouter.post('/import', upload.single('file'), async (req, res) => {
  if (req.user?.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'file required' });

  try {
    const name = (req.file.originalname || 'Imported Template').replace(/\.(html?|docx)$/i, '');
    let html = '';

    if (/\.docx$/i.test(req.file.originalname)) {
      const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
      html = result.value || '';
      // Clean up spacing artifacts from Word → HTML
      html = normalizeHtml(html);
    } else {
      html = req.file.buffer.toString('utf8');
      // Normalize uploaded HTML too (users sometimes paste HTML with many blank <p>)
      html = normalizeHtml(html);
    }

    // Replace yellow highlights with {{placeholders}}
    const { html: contentWithPlaceholders, vars, defaults } = extractHighlightedPlaceholders(html);

    // Final pass to be safe (in case highlight replacement introduced whitespace)
    const content = normalizeHtml(contentWithPlaceholders);

    res.json({ name, content, vars, defaults });
  } catch (e) {
    console.error('Template import failed:', e);
    res.status(500).json({ error: 'Import failed' });
  }
});
