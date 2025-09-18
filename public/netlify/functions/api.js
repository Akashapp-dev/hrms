// netlify/functions/server.js
const serverless = require('serverless-http');
const express = require('express');
const app = express();

// your normal express setup
app.use(express.json());
app.get('/', (req, res) => res.json({ ok: true }));
// mount your routes or import your server code
// e.g. const routes = require('../../server/routes'); app.use('/api', routes);

module.exports.handler = serverless(app);
