How It Works on Vercel

Static UI: Built to public/dist and served at the site root (no npm start).
API: Vercel Function at /api routes requests to the Express app (/api/auth, /api/templates, /api/documents, etc.).
PDF: Uses headless Chromium in serverless; function memory/time set in vercel.json.
Deploy Steps

Push to GitHub and Import into Vercel, or run:
npm i -g vercel
vercel (first deploy, follow prompts)
vercel --prod (production)
Set environment variables in Vercel:
JWT_SECRET: a strong secret (required for real use)
DATA_DIR: left as /tmp/hrms-data in vercel.json (ephemeral; see note below)
CORS_ORIGIN: not needed for same-origin (/api) setup
Build happens automatically using:
Install: npm --prefix server install --no-audit --no-fund
Build: npm --prefix server run build → public/dist
Important Notes

Persistence: /tmp is ephemeral and can reset between invocations. Your JSON file DB will not persist on Vercel. For production, switch server/src/db.js to a real datastore:
Vercel Postgres/Neon, MongoDB Atlas, Supabase, or Vercel KV.
I can help replace the simple readDB/writeDB/add/update/remove with a DB-backed implementation.
Cookies/CORS: With same-origin /api, CORS is not required. Your cookie settings (SameSite=None; Secure in production) are fine on HTTPS.
Puppeteer size/time: PDF routes are heavier; I set 1024 MB and 60s. Bump if needed.
Local Dev

Install: npm --prefix server install
Run API+static: npm --prefix server run dev (serves public with SPA fallback)
Build UI: npm --prefix server run build (generates public/dist)

