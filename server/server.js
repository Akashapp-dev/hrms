import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createApp } from './app-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = createApp();
const PORT = process.env.PORT || 3000;

// Serve static frontend
const publicDir = path.join(__dirname, '..', 'public');
// In production prefer prebuilt dist; in dev prefer live files for quick edits
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(publicDir, 'dist')));
  app.use(express.static(publicDir));
} else {
  app.use(express.static(publicDir));
  app.use(express.static(path.join(publicDir, 'dist')));
}

// Fallback to index.html for SPA style routes
app.get('*', (req, res) => {
  const distIndex = path.join(publicDir, 'dist', 'index.html');
  const pubIndex = path.join(publicDir, 'index.html');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  return res.sendFile(pubIndex);
});

app.listen(PORT, () => {
  console.log(`HRMS Template App running on http://localhost:${PORT}`);
});
