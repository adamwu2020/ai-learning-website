// ============================================================
//  AI Learning — Auth Server
//  node server.js  (or: npm run dev)
// ============================================================

// Force IPv4 DNS — Render free tier cannot reach Supabase over IPv6
require('dns').setDefaultResultOrder('ipv4first');

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const { db }   = require('./db');
const { router: authRouter }  = require('./routes/auth');
const { router: adminRouter } = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3001;

// Explicitly allowed origins (optional extras via env vars)
const ALLOWED_ORIGINS = new Set(
  [process.env.FRONTEND_URL, process.env.RENDER_EXTERNAL_URL].filter(Boolean)
);

// ── Middleware ─────────────────────────────────────────────
// cors() accepts a function(req, callback) so we can access req.headers.host
// to automatically allow same-origin requests regardless of domain/custom domain
app.use(cors(function(req, callback) {
  const origin = req.headers.origin;
  const host   = req.headers.host;
  const allowed =
    !origin ||                                                         // curl / Postman
    origin === 'null' ||                                              // file:// pages
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||  // any localhost port
    ALLOWED_ORIGINS.has(origin) ||                                    // explicit list
    (host && (origin === `https://${host}` || origin === `http://${host}`)); // same-origin (any domain)
  callback(null, { origin: allowed, credentials: true });
}));

app.use(express.json());

// Basic request logger
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString().slice(11,19)} ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────
app.use('/api/auth',  authRouter);
app.use('/api/admin', adminRouter);

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

// ── Seed admin account ─────────────────────────────────────
async function seedAdmin() {
  try {
    const existing = await db.findAdminUser();
    if (!existing) {
      const hash = await bcrypt.hash('LearnaiAdmin1234!', 12);
      await db.createAdminUser('Admin', 'info@learnai.wetrainagent.com', hash);
      console.log('✅ Admin account created: info@learnai.wetrainagent.com');
    }
  } catch (err) {
    console.error('Admin seed error (run schema SQL in Supabase if tables are missing):', err.message);
  }
}

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Auth server running at http://localhost:${PORT}`);
  console.log(`   Frontend expected at: ${process.env.FRONTEND_URL || 'http://localhost:5500'}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  await seedAdmin();
});
