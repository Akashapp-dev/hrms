// server/src/documents.js
import express from 'express';
import { nanoid } from 'nanoid';
import puppeteer from 'puppeteer';
import { db } from './db.js';
import { renderTemplate } from './templating.js';

export const documentsRouter = express.Router();

// Prepare HTML for print/PDF: ensure justified text and Annexure on new page
function prepareForPrint(html = '') {
  if (!html || typeof html !== 'string') return '';
  let out = html;

  // Respect explicit page break markers if present in template
  out = out.replace(/<hr[^>]*class=["'][^"']*pagebreak[^"']*["'][^>]*\/>/gi, '<div class="page-break"></div>');
  out = out.replace(/<div[^>]*class=["'][^"']*(?:page-break|pagebreak)[^"']*["'][^>]*><\/div>/gi, '<div class="page-break"></div>');

  // Auto-insert a page break before Annexure section headers if found
  out = out.replace(/(<h[1-6][^>]*>\s*Annexure[^<]*<\/h[1-6]>)/gi, '<div class="page-break"></div>$1');
  out = out.replace(/(<p[^>]*>\s*(?:<(?:strong|b)[^>]*>\s*)?Annexure[^<]*(?:<\/(?:strong|b)>)?[^<]*<\/p>)/gi, '<div class="page-break"></div>$1');

  // Wrap Annexure section (from first Annexure header/paragraph to end) for compact styling
  if (!/class=["'][^"']*annexure-section/i.test(out)) {
    const m = out.match(/(<h[1-6][^>]*>\s*Annexure[\s\S]*?<\/h[1-6]>|<p[^>]*>\s*(?:<(?:strong|b)[^>]*>\s*)?Annexure[\s\S]*?<\/p>)/i);
    if (m && m.index != null) {
      const startIdx = out.indexOf(m[1]);
      out = out.slice(0, startIdx) + '<div class="annexure-section">' + out.slice(startIdx) + '</div>';
    }
  }

  return out;
}

/**
 * GET /api/documents
 * List last N documents (default 100).
 */
documentsRouter.get('/', async (req, res) => {
  try {
    const items = await db.all('documents');
    // sort by updatedAt DESC
    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json({ items: items.slice(0, 100) });
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * POST /api/documents
 * Create/render a document (HTML). Saves to DB.
 * body: { content: string, data: object, templateId?: string }
 */
documentsRouter.post('/', async (req, res) => {
  try {
    const { content, data, templateId = null } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const rendered = renderTemplate(content, data || {});
    const prepared = prepareForPrint(rendered);
    const prepared = prepareForPrint(rendered);
    const now = Date.now();
    const doc = {
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
      templateId,
      content,
      data: data || {},
      rendered
    };
    await db.add('documents', doc);
    res.json({ item: doc });
  } catch (err) {
    console.error('Render document error:', err);
    res.status(500).json({ error: 'Failed to render document' });
  }
});

/**
 * GET /api/documents/:id/download
 * Download rendered HTML as a file.
 */
documentsRouter.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.get('documents', id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="document-${id}.html"`);
    res.send(doc.rendered || '');
  } catch (err) {
    console.error('Download document error:', err);
    res.status(500).json({ error: 'Failed to download' });
  }
});

/**
 * POST /api/documents/pdf
 * Create & download a PDF (also saves the doc in DB).
 * body: { content: string, data: object, templateId?: string }
 */
documentsRouter.post('/pdf', async (req, res) => {
  try {
    const { content, data, templateId = null } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Missing content' });

    // Render with the same templating you already use elsewhere
    const rendered = renderTemplate(content, data || {});

    // Save history (same structure as HTML route)
    const now = Date.now();
    const doc = {
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
      templateId,
      content,
      data: data || {},
      rendered
    };
    await db.add('documents', doc);

    // Generate PDF
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Optional: basic print styles wrapper so page.pdf renders cleanly
    const html = `
      <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            @page { size: A4; margin: 18mm 16mm; }
            body { font-family: system-ui, Segoe UI, Roboto, Ubuntu, sans-serif; color: #111; line-height: 1.5; }
            h1,h2,h3,strong { color: #000; }
            p, li, div, td, th { text-align: justify; text-justify: inter-word; }
            h1,h2,h3,h4,h5,h6 { text-align: left; }
            .page-break { page-break-before: always; break-before: page; }
            .annexure, .annexure-start { page-break-before: always; break-before: page; }
            table { width: 100%; border-collapse: collapse; }
            td, th { vertical-align: top; }
            /* Annexure: compact tables */
            .annexure-section { font-size: 12px; }
            .annexure-section table { width: 100% !important; table-layout: fixed; font-size: 12px !important; }
            .annexure-section th, .annexure-section td { padding: 4px 6px !important; line-height: 1.3 !important; word-break: break-word; hyphens: auto; }
          </style>
        </head>
        <body>${prepared}</body>
      </html>`;

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="document-${doc.id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('PDF generate error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});
