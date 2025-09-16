Local-Only Setup (Demo on localhost)

This repository is configured for local demos only. All cloud deployment configs have been removed.

What runs locally
- Node API + UI: Express serves the frontend (`public`) and API routes under `/api`.
- Storage: Uses a local JSON file at `data/db.json` when no `DATABASE_URL` is set.
- PDF: Generated via Puppeteer/Chromium directly from the Node server.

Prerequisites
- Node.js 18+ (Node 20 recommended)

Quick start
1) Install dependencies:
   - `npm --prefix server ci`  (or `npm --prefix server install`)
2) Start the app (serves API + frontend):
   - `npm --prefix server run dev`
   - Open http://localhost:3000

Default admin for demo
- Username: `admin`
- Password: `admin123`
(Auto-seeded on first run.)

Optional: build optimized assets
- `npm --prefix server run build`  (outputs to `public/dist/`)

Optional: use Postgres
- Set `DATABASE_URL` in your environment before starting. The app auto-creates tables and uses Postgres instead of the JSON file.

Notes
- If Puppeteer fails to download Chromium on first install, ensure internet access and retry `npm --prefix server ci`.
- The UI calls same-origin `/api`, so no CORS setup is needed for local runs.
