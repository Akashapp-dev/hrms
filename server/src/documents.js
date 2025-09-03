import express from 'express';
import { add, list, findById } from './db.js';
import { renderTemplate } from './templating.js';
import puppeteer from 'puppeteer';

export const documentsRouter = express.Router();

// List documents
documentsRouter.get('/', (req, res) => {
  const items = list('documents');
  res.json({ items });
});

// Render and save a document
// Body: { templateId?, content?, data }
documentsRouter.post('/', (req, res) => {
  if (req.user?.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
  const { templateId, content, data } = req.body || {};
  let tpl = content;
  if (!tpl && templateId) {
    const t = list('templates').find((x) => x.id === templateId);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    tpl = t.content;
  }
  if (!tpl) return res.status(400).json({ error: 'templateId or content required' });
  const rendered = renderTemplate(tpl, data || {});
  const doc = add('documents', {
    templateId: templateId || null,
    content: tpl,
    data: data || {},
    rendered,
  });
  res.json({ item: doc });
});

// Generate and download PDF (A4) from content/template
// Body: { templateId?, content?, data }
documentsRouter.post('/pdf', async (req, res) => {
  try {
    const { templateId, content, data, fileName } = req.body || {};
    // Viewers are allowed to download PDFs of what they can preview
    let tpl = content;
    if (!tpl && templateId) {
      const t = list('templates').find((x) => x.id === templateId);
      if (!t) return res.status(404).json({ error: 'Template not found' });
      tpl = t.content;
    }
    if (!tpl) return res.status(400).json({ error: 'templateId or content required' });

    const rendered = renderTemplate(tpl, data || {});
    // Save history (include preferred filename if provided)
    let preferred = (fileName || '').trim();
    if (preferred && !preferred.toLowerCase().endsWith('.pdf')) preferred += '.pdf';
    const doc = add('documents', {
      templateId: templateId || null,
      content: tpl,
      data: data || {},
      rendered,
      fileName: preferred || null,
    });

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 18mm 16mm; }
            body { font-family: system-ui, Segoe UI, Roboto, Ubuntu, sans-serif; color: #111; }
            h1,h2,h3,strong { color: #000; }
          </style>
        </head>
        <body>${rendered}</body>
      </html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' } });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    const fname = doc.fileName || `document-${doc.id}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(pdf);
  } catch (err) {
    console.error('PDF generate error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Get document
documentsRouter.get('/:id', (req, res) => {
  const doc = findById('documents', req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ item: doc });
});

// Download rendered as HTML file
documentsRouter.get('/:id/download', (req, res) => {
  const doc = findById('documents', req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const filename = `document-${doc.id}.html`;
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${filename}</title></head><body>${doc.rendered}</body></html>`);
});

// Download as PDF again using stored rendered HTML and saved name
documentsRouter.get('/:id/download-pdf', async (req, res) => {
  try {
    const doc = findById('documents', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 18mm 16mm; }
            body { font-family: system-ui, Segoe UI, Roboto, Ubuntu, sans-serif; color: #111; }
            h1,h2,h3,strong { color: #000; }
          </style>
        </head>
        <body>${doc.rendered || ''}</body>
      </html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' } });
    await browser.close();

    const fname = doc.fileName || `document-${doc.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(pdf);
  } catch (err) {
    console.error('PDF re-generate error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});
