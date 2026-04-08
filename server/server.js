// ============================================================
//  AI Learning — Auth Server
//  node server.js  (or: npm run dev)
// ============================================================
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { router: authRouter } = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (curl, Postman, same-origin)
    // Allow null origin (file:// pages)
    // Allow any localhost / 127.0.0.1 port
    if (
      !origin ||
      origin === 'null' ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      origin === (process.env.FRONTEND_URL || '')
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// Basic request logger
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString().slice(11,19)} ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────
app.use('/api/auth', authRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Static frontend ────────────────────────────────────────
const STATIC_DIR = path.join(__dirname, '..');
app.use(express.static(STATIC_DIR));

// SPA fallback — serve index.html for any unmatched route
app.get('*', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Auth server running at http://localhost:${PORT}`);
  console.log(`   Frontend expected at: ${process.env.FRONTEND_URL || 'http://localhost:5500'}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});
