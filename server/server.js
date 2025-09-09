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
// If a prebuilt dist exists, serve it first so /app.js and /styles.css resolve to minified builds
app.use(express.static(path.join(publicDir, 'dist')));
app.use(express.static(publicDir));

// Fallback to index.html for SPA style routes
app.get('*', (req, res) => {
  const distIndex = path.join(publicDir, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) return res.sendFile(distIndex);
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`HRMS Template App running on http://localhost:${PORT}`);
});
