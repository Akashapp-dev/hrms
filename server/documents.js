// server/src/documents.js
import express from 'express';
import { nanoid } from 'nanoid';
import puppeteer from 'puppeteer';
import { db } from './db.js';
import { renderTemplate } from './templating.js';

export const documentsRouter = express.Router();

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
            body { font-family: system-ui, Segoe UI, Roboto, Ubuntu, sans-serif; color: #111; }
            h1,h2,h3,strong { color: #000; }
          </style>
        </head>
        <body>${rendered}</body>
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
