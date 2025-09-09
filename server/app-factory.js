import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter, currentUser, requireAuth, ensureAdmin } from './src/auth.js';
import { templatesRouter } from './src/templates.js';
import { documentsRouter } from './src/documents.js';
import { init as initDb } from './src/db.js';

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // CORS for split hosting (kept permissive if CORS_ORIGIN unset)
  const allowOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin) return callback(null, true); // allow same-origin / curl
        if (allowOrigins.length === 0 || allowOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  // Public auth routes
  app.use('/api/auth', authRouter);

  // Current user helper
  app.get('/api/me', currentUser);

  // Protected routers
  app.use('/api/templates', requireAuth, templatesRouter);
  app.use('/api/documents', requireAuth, documentsRouter);

  return app;
}
  // Ensure DB is ready and admin seeded before handling traffic
  const ready = (async () => {
    try {
      await initDb();
      await ensureAdmin();
    } catch (e) {
      console.error('Initialization error:', e);
    }
  })();
  app.use(async (req, res, next) => {
    try { await ready; next(); } catch (e) { next(e); }
  });
