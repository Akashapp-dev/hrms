import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const publicDir = path.resolve(__dirname, '..', '..', 'public');
  const distDir = path.join(publicDir, 'dist');
  const src = path.join(publicDir, 'index.html');
  const out = path.join(distDir, 'index.html');

  try {
    await fs.mkdir(distDir, { recursive: true });
    let html = await fs.readFile(src, 'utf8');
    // Remove HTML comments
    html = html.replace(/<!--[^]*?-->/g, '');
    // Collapse whitespace between tags
    html = html.replace(/>\s+</g, '><');
    // Trim
    html = html.trim();
    await fs.writeFile(out, html, 'utf8');
    console.log(`Minified index.html -> ${path.relative(publicDir, out)}`);
  } catch (err) {
    console.error('Failed to minify index.html:', err);
    process.exit(1);
  }
}

main();

