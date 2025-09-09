import { createApp } from '../server/app-factory.js';

// Reuse the Express app inside a Vercel Function
const app = createApp();

export default function handler(req, res) {
  return app(req, res);
}

