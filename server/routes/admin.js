// ============================================================
//  Admin Routes — /api/admin/*
// ============================================================
const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { db }  = require('../db');
const { sendPasswordReset } = require('../mailer');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
const FRONTEND   = process.env.FRONTEND_URL || 'http://localhost:5500';

function makeToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

async function adminMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user    = await db.findById(payload.sub);
    if (!user || !user.is_admin || user.disabled) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.adminId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── POST /api/admin/login ─────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await db.findByEmail(email.trim());
    if (!user || !user.is_admin || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.disabled) return res.status(403).json({ error: 'Account disabled' });
    await db.updateLastLogin(user.id);
    const token = makeToken(user.id);
    console.log(`🔑 Admin login: ${user.email}`);
    res.json({ token, admin: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────
router.get('/stats', adminMiddleware, async (_req, res) => {
  try {
    const stats = await db.getAdminStats();
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────
router.get('/users', adminMiddleware, async (_req, res) => {
  try {
    const users = await db.findAllUsers();
    res.json({ users });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ── GET /api/admin/users/:id ──────────────────────────────
router.get('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await db.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const [progress, transactions] = await Promise.all([
      db.getUserProgress(req.params.id),
      db.getTxHistory(req.params.id),
    ]);
    const { password_hash, ...safe } = user;
    res.json({ user: safe, progress, transactions });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ── POST /api/admin/users/:id/disable ────────────────────
router.post('/users/:id/disable', adminMiddleware, async (req, res) => {
  try {
    const user = await db.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_admin) return res.status(400).json({ error: 'Cannot disable an admin account' });
    await db.setUserDisabled(req.params.id, true);
    res.json({ message: 'User disabled' });
  } catch (err) {
    console.error('Disable user error:', err);
    res.status(500).json({ error: 'Failed to disable user' });
  }
});

// ── POST /api/admin/users/:id/enable ─────────────────────
router.post('/users/:id/enable', adminMiddleware, async (req, res) => {
  try {
    await db.setUserDisabled(req.params.id, false);
    res.json({ message: 'User enabled' });
  } catch (err) {
    console.error('Enable user error:', err);
    res.status(500).json({ error: 'Failed to enable user' });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────
router.delete('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await db.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_admin) return res.status(400).json({ error: 'Cannot delete an admin account' });
    await db.deleteUser(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ── POST /api/admin/users/:id/reset-password ─────────────
router.post('/users/:id/reset-password', adminMiddleware, async (req, res) => {
  try {
    const user = await db.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await db.deleteOldResets(user.id);
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.insertReset(user.id, token, expiresAt);
    const resetLink = `${FRONTEND}/reset-password.html?token=${token}`;
    const result    = await sendPasswordReset({ to: user.email, name: user.name, resetLink });
    console.log(`📧 Admin triggered reset for ${user.email}`);
    res.json({ message: `Reset email sent to ${user.email}`, _dev_previewUrl: result.previewUrl || null });
  } catch (err) {
    console.error('Admin reset error:', err);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// ── GET /api/admin/coupons ────────────────────────────────
router.get('/coupons', adminMiddleware, async (_req, res) => {
  try {
    await db.createCouponsTable();
    const coupons = await db.getCoupons();
    res.json({ coupons });
  } catch (err) {
    console.error('List coupons error:', err);
    res.status(500).json({ error: 'Failed to list coupons' });
  }
});

// ── POST /api/admin/coupons ───────────────────────────────
router.post('/coupons', adminMiddleware, async (req, res) => {
  try {
    const { code, days, expires_at } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'Code is required' });
    if (!days || days < 1 || days > 10000) return res.status(400).json({ error: 'Days must be between 1 and 10000' });
    await db.createCouponsTable();
    const existing = await db.getCouponByCode(code.trim());
    if (existing) return res.status(409).json({ error: 'A coupon with that code already exists' });
    const coupon = await db.createCoupon(code.trim(), days, expires_at || null);
    res.status(201).json({ coupon });
  } catch (err) {
    console.error('Create coupon error:', err);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// ── PUT /api/admin/coupons/:id ────────────────────────────
router.put('/coupons/:id', adminMiddleware, async (req, res) => {
  try {
    const { code, days, expires_at } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'Code is required' });
    if (!days || days < 1 || days > 10000) return res.status(400).json({ error: 'Days must be between 1 and 10000' });
    // Check for duplicate code (excluding this coupon)
    const existing = await db.getCouponByCode(code.trim());
    if (existing && String(existing.id) !== String(req.params.id)) {
      return res.status(409).json({ error: 'A coupon with that code already exists' });
    }
    const coupon = await db.updateCoupon(req.params.id, code.trim(), days, expires_at || null);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    res.json({ coupon });
  } catch (err) {
    console.error('Update coupon error:', err);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

// ── DELETE /api/admin/coupons/:id ─────────────────────────
router.delete('/coupons/:id', adminMiddleware, async (req, res) => {
  try {
    await db.deleteCoupon(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    console.error('Delete coupon error:', err);
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

module.exports = { router };
