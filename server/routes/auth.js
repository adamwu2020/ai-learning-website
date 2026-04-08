// ============================================================
//  Auth Routes
// ============================================================
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { db }   = require('../db');
const { sendPasswordReset } = require('../mailer');

const router = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
const FRONTEND    = process.env.FRONTEND_URL || 'http://localhost:5500';

// ── Helpers ────────────────────────────────────────────────
function makeToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

const TRIAL_DAYS = 7;

function trialInfo(u) {
  if (!u || !u.created_at) return { trial_active: true, trial_days_left: TRIAL_DAYS };
  const created = new Date(u.created_at);
  if (isNaN(created.getTime())) return { trial_active: true, trial_days_left: TRIAL_DAYS };
  const daysElapsed = (Date.now() - created.getTime()) / 86400000;
  const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - daysElapsed));
  return { trial_active: daysLeft > 0, trial_days_left: daysLeft };
}

function safeUser(u) {
  if (!u) return null;
  const { password_hash, ...safe } = u;
  try { safe.subscription = u.subscription ? JSON.parse(u.subscription) : null; } catch { safe.subscription = null; }
  Object.assign(safe, trialInfo(u));
  return safe;
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user    = await db.findById(payload.sub);
    if (!user)          return res.status(401).json({ error: 'User not found' });
    if (user.disabled)  return res.status(403).json({ error: 'Account disabled. Please contact support.' });
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function validate(fields) {
  return (req, res, next) => {
    for (const [key, rule] of Object.entries(fields)) {
      const val = req.body[key];
      if (rule.required && !val) return res.status(400).json({ error: `${key} is required` });
      if (rule.minLen && val && val.length < rule.minLen)
        return res.status(400).json({ error: `${key} must be at least ${rule.minLen} characters` });
      if (rule.email && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
        return res.status(400).json({ error: 'Invalid email address' });
    }
    next();
  };
}

// ── POST /api/auth/register ────────────────────────────────
router.post('/register',
  validate({
    name:     { required: true, minLen: 2 },
    email:    { required: true, email: true },
    password: { required: true, minLen: 8 },
  }),
  async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (await db.findByEmail(email.trim())) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      const hash = await bcrypt.hash(password, 12);
      const user = await db.createUser(name.trim(), email.toLowerCase().trim(), hash);
      const token = makeToken(user.id);
      console.log(`✅ Registered: ${email}`);
      res.status(201).json({ token, user: safeUser(user) });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
);

// ── POST /api/auth/login ───────────────────────────────────
router.post('/login',
  validate({ email: { required: true, email: true }, password: { required: true } }),
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await db.findByEmail(email.trim());
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      await db.updateLastLogin(user.id);
      const token = makeToken(user.id);
      console.log(`✅ Login: ${email}`);
      res.json({ token, user: safeUser(await db.findById(user.id)) });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  }
);

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  const user = await db.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: safeUser(user) });
});

// ── POST /api/auth/forgot-password ────────────────────────
router.post('/forgot-password',
  validate({ email: { required: true, email: true } }),
  async (req, res) => {
    const SUCCESS = { message: 'If an account with that email exists, a reset link has been sent.' };
    try {
      const { email } = req.body;
      const user = await db.findByEmail(email.trim());
      if (!user) return res.json(SUCCESS);   // Don't leak email existence

      await db.deleteOldResets(user.id);     // Invalidate previous tokens

      const token     = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await db.insertReset(user.id, token, expiresAt);

      const resetLink = `${FRONTEND}/reset-password.html?token=${token}`;
      const result    = await sendPasswordReset({ to: user.email, name: user.name, resetLink });

      console.log(`📧 Reset link sent to ${user.email}`);
      res.json({ ...SUCCESS, _dev_previewUrl: result.previewUrl || null });
    } catch (err) {
      console.error('Forgot-password error:', err);
      res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
    }
  }
);

// ── POST /api/auth/verify-reset-token ─────────────────────
router.post('/verify-reset-token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ valid: false });
  const reset = await db.findReset(token);
  if (!reset) return res.json({ valid: false, error: 'This link is invalid or has expired.' });
  res.json({ valid: true, email: reset.email });
});

// ── POST /api/auth/reset-password ─────────────────────────
router.post('/reset-password',
  validate({ token: { required: true }, password: { required: true, minLen: 8 } }),
  async (req, res) => {
    try {
      const { token, password } = req.body;
      const reset = await db.findReset(token);
      if (!reset) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });

      const newHash = await bcrypt.hash(password, 12);
      await db.updatePassword(newHash, reset.user_id);
      await db.markResetUsed(token);

      console.log(`✅ Password reset for user ${reset.user_id}`);
      res.json({ message: 'Password updated successfully. You can now log in.' });
    } catch (err) {
      console.error('Reset-password error:', err);
      res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
  }
);

// ── GET /api/auth/credits ──────────────────────────────────
router.get('/credits', authMiddleware, async (req, res) => {
  const user = await db.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const transactions = await db.getTxHistory(req.userId);
  res.json({
    credits: user.credits,
    subscription: user.subscription ? JSON.parse(user.subscription) : null,
    transactions,
  });
});

// ── POST /api/auth/credits/add ─────────────────────────────
router.post('/credits/add', authMiddleware, async (req, res) => {
  const { amount, note } = req.body;
  const amt = parseInt(amount);
  if (!amt || amt <= 0 || amt > 10000) return res.status(400).json({ error: 'Invalid amount' });

  await db.updateCredits(amt, req.userId);
  await db.insertTx(req.userId, 'credit', amt, note || 'Credit purchase');

  const user = await db.findById(req.userId);
  res.json({ credits: user.credits });
});

// ── POST /api/auth/credits/deduct ─────────────────────────
router.post('/credits/deduct', authMiddleware, async (req, res) => {
  const { amount, note } = req.body;
  const amt  = parseInt(amount);
  const user = await db.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.credits < amt) return res.status(402).json({ error: 'Insufficient credits' });

  await db.updateCredits(-amt, req.userId);
  await db.insertTx(req.userId, 'debit', amt, note || 'Credit deduction');

  const updated = await db.findById(req.userId);
  res.json({ credits: updated.credits });
});

// ── POST /api/auth/subscription ───────────────────────────
router.post('/subscription', authMiddleware, async (req, res) => {
  const user = await db.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  const sub = { startedAt: new Date().toISOString(), expiresAt: expiry.toISOString() };

  await db.setSubscription(JSON.stringify(sub), user.id);
  await db.updateCredits(200, user.id);
  await db.insertTx(user.id, 'credit', 200, 'Pro Monthly subscription: 200 credits');

  const updated = await db.findById(user.id);
  res.json({ credits: updated.credits, subscription: sub });
});

// ── POST /api/auth/progress ───────────────────────────────
router.post('/progress', authMiddleware, async (req, res) => {
  const { course, module, lesson } = req.body;
  if (!course || !module || !lesson) return res.status(400).json({ error: 'course, module, and lesson are required' });
  await db.upsertProgress(req.userId, course, module, lesson);
  res.json({ ok: true });
});

// ── GET /api/auth/progress ────────────────────────────────
router.get('/progress', authMiddleware, async (req, res) => {
  const progress = await db.getUserProgress(req.userId);
  res.json({ progress });
});

module.exports = { router, authMiddleware };
