import express from 'express';
import { add, list, findById } from './db.js';
import { renderTemplate } from './templating.js';

// Lazy-load Puppeteer to support both local (puppeteer) and serverless (puppeteer-core + @sparticuz/chromium)
async function launchBrowser() {
  try {
    const puppeteer = (await import('puppeteer')).default;
    return await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  } catch (e) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteerCore = (await import('puppeteer-core')).default;
    return await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless ?? true,
    });
  }
}

export const documentsRouter = express.Router();

// Prepare HTML for print/PDF: ensure justified text and Annexure on new page
function prepareForPrint(html = '') {
  if (!html || typeof html !== 'string') return '';
  let out = html;

  // Respect explicit page break markers if present in template
  // <hr class="pagebreak"> or <div class="page-break"></div>
  out = out.replace(/<hr[^>]*class=["'][^"']*pagebreak[^"']*["'][^>]*\/>/gi, '<div class="page-break"></div>');
  out = out.replace(/<div[^>]*class=["'][^"']*(?:page-break|pagebreak)[^"']*["'][^>]*><\/div>/gi, '<div class="page-break"></div>');

  // Auto-insert a page break before Annexure section headers if found
  // Case 1: A heading starting with "Annexure"
  out = out.replace(/(<h[1-6][^>]*>\s*Annexure[^<]*<\/h[1-6]>)/gi, '<div class="page-break"></div>$1');
  // Case 2: A paragraph whose first words are Annexure (optionally wrapped in <strong>/<b>)
  out = out.replace(/(<p[^>]*>\s*(?:<(?:strong|b)[^>]*>\s*)?Annexure[^<]*(?:<\/(?:strong|b)>)?[^<]*<\/p>)/gi, '<div class="page-break"></div>$1');

  // Wrap Annexure section (from first Annexure heading/paragraph to end) so we can style tables smaller
  if (!/class=["'][^"']*annexure-section/i.test(out)) {
    const m = out.match(/(<h[1-6][^>]*>\s*Annexure[\s\S]*?<\/h[1-6]>|<p[^>]*>\s*(?:<(?:strong|b)[^>]*>\s*)?Annexure[\s\S]*?<\/p>)/i);
    if (m && m.index != null) {
      const startIdx = out.indexOf(m[1]);
      out = out.slice(0, startIdx) + '<div class="annexure-section">' + out.slice(startIdx) + '</div>';
    }
  }

  return out;
}

// List documents
documentsRouter.get('/', async (req, res) => {
  const items = await list('documents');
  res.json({ items });
});

// Render and save a document
// Body: { templateId?, content?, data }
documentsRouter.post('/', async (req, res) => {
  if (req.user?.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
  const { templateId, content, data } = req.body || {};
  let tpl = content;
  if (!tpl && templateId) {
    const t = (await list('templates')).find((x) => x.id === templateId);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    tpl = t.content;
  }
  if (!tpl) return res.status(400).json({ error: 'templateId or content required' });
  const rendered = renderTemplate(tpl, data || {});
  const doc = await add('documents', {
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
      const t = (await list('templates')).find((x) => x.id === templateId);
      if (!t) return res.status(404).json({ error: 'Template not found' });
      tpl = t.content;
    }
    if (!tpl) return res.status(400).json({ error: 'templateId or content required' });

    const rendered = renderTemplate(tpl, data || {});
    // Normalize/augment HTML for print: justify text and start Annexure on a new page
    const prepared = prepareForPrint(rendered);
    // Save history (include preferred filename if provided)
    let preferred = (fileName || '').trim();
    if (preferred && !preferred.toLowerCase().endsWith('.pdf')) preferred += '.pdf';
    const doc = await add('documents', {
      templateId: templateId || null,
      content: tpl,
      data: data || {},
      rendered,
      fileName: preferred || null,
    });

    const browser = await launchBrowser();
    const page = await browser.newPage();
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            /* Letterhead spacing: extra top and bottom margins */
            @page { size: A4; margin: 30mm 16mm 20mm 16mm; }
            body { font-family: system-ui, Segoe UI, Roboto, Ubuntu, sans-serif; color: #111; line-height: 1.5; }
            h1,h2,h3,strong { color: #000; }
            /* Default justification for readable print */
            p, li, div, td, th { text-align: justify; text-justify: inter-word; }
            h1,h2,h3,h4,h5,h6 { text-align: left; }
            /* Page break helpers */
            .page-break { page-break-before: always; break-before: page; }
            .annexure, .annexure-start { page-break-before: always; break-before: page; }
            table { width: 100%; border-collapse: collapse; }
            td, th { vertical-align: top; }
            /* Avoid splitting blocks across pages */
            p, h1, h2, h3, h4, h5, h6,
            ul, ol, li,
            table, thead, tbody, tr,
            blockquote, pre { page-break-inside: avoid; break-inside: avoid; }
            /* Reduce orphan/widow lines */
            p { orphans: 3; widows: 3; }
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
      margin: { top: '30mm', right: '16mm', bottom: '20mm', left: '16mm' }
    });
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
documentsRouter.get('/:id', async (req, res) => {
  const doc = await findById('documents', req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ item: doc });
});

// Download rendered as HTML file
documentsRouter.get('/:id/download', async (req, res) => {
  const doc = await findById('documents', req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const filename = `document-${doc.id}.html`;
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${filename}</title></head><body>${doc.rendered}</body></html>`);
});

// Download as PDF again using stored rendered HTML and saved name
documentsRouter.get('/:id/download-pdf', async (req, res) => {
  try {
    const doc = await findById('documents', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const browser = await launchBrowser();
    const page = await browser.newPage();
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            /* Letterhead spacing: extra top and bottom margins */
            @page { size: A4; margin: 30mm 16mm 20mm 16mm; }
            body { font-family: system-ui, Segoe UI, Roboto, Ubuntu, sans-serif; color: #111; line-height: 1.5; }
            h1,h2,h3,strong { color: #000; }
            p, li, div, td, th { text-align: justify; text-justify: inter-word; }
            h1,h2,h3,h4,h5,h6 { text-align: left; }
            .page-break { page-break-before: always; break-before: page; }
            .annexure, .annexure-start { page-break-before: always; break-before: page; }
            table { width: 100%; border-collapse: collapse; }
            td, th { vertical-align: top; }
            /* Avoid splitting blocks across pages */
            p, h1, h2, h3, h4, h5, h6,
            ul, ol, li,
            table, thead, tbody, tr,
            blockquote, pre { page-break-inside: avoid; break-inside: avoid; }
            /* Reduce orphan/widow lines */
            p { orphans: 3; widows: 3; }
            .annexure-section { font-size: 12px; }
            .annexure-section table { width: 100% !important; table-layout: fixed; font-size: 12px !important; }
            .annexure-section th, .annexure-section td { padding: 4px 6px !important; line-height: 1.3 !important; word-break: break-word; hyphens: auto; }
          </style>
        </head>
        <body>${prepareForPrint(doc.rendered || '')}</body>
      </html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '30mm', right: '16mm', bottom: '20mm', left: '16mm' }
    });
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
