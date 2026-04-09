// ============================================================
//  Referral Routes
// ============================================================
const express = require('express');
const crypto  = require('crypto');
const { db }  = require('../db');
const { authMiddleware } = require('./auth');

const router = express.Router();

const REFERRAL_AMOUNT_CENTS = 2000; // $20
const CENTS_PER_CREDIT      = 50;   // 1 credit = $0.50

function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function ensureReferralTable() {
  try { await db.createReferralTable(); } catch { /* already exists */ }
}

// ── GET /api/referral/code ─────────────────────────────────
// Returns or creates the user's referral code + stats
router.get('/code', authMiddleware, async (req, res) => {
  try {
    await ensureReferralTable();
    const user = await db.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let code = user.referral_code;
    if (!code) {
      for (let i = 0; i < 10; i++) {
        const candidate = generateCode();
        if (!(await db.findByReferralCode(candidate))) {
          await db.setReferralCode(req.userId, candidate);
          code = candidate;
          break;
        }
      }
    }

    const stats = await db.getReferralStats(req.userId);
    const host  = process.env.FRONTEND_URL || `https://${req.headers.host}`;
    const referralUrl = `${host}/?ref=${code}`;

    res.json({
      code,
      referralUrl,
      referralBalanceCents: user.referral_balance_cents || 0,
      stats: {
        count:      parseInt(stats.count),
        totalCents: parseInt(stats.total_cents),
      },
    });
  } catch (err) {
    console.error('Referral code error:', err);
    res.status(500).json({ error: 'Failed to get referral code' });
  }
});

// ── POST /api/referral/redeem ──────────────────────────────
// Converts referral balance → regular credits (1 credit = $0.50)
router.post('/redeem', authMiddleware, async (req, res) => {
  try {
    await ensureReferralTable();
    const user = await db.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const balanceCents = user.referral_balance_cents || 0;
    if (balanceCents <= 0) return res.status(400).json({ error: 'No referral balance to redeem' });

    const credits = Math.floor(balanceCents / CENTS_PER_CREDIT);
    if (credits <= 0) return res.status(400).json({ error: 'Balance too small (minimum $0.50)' });

    await db.deductReferralBalance(req.userId, balanceCents);
    await db.updateCredits(credits, req.userId);
    await db.insertTx(req.userId, 'credit', credits,
      `Referral reward redeemed: $${(balanceCents / 100).toFixed(2)} → ${credits} credits`);

    const updated = await db.findById(req.userId);
    res.json({
      redeemedCents: balanceCents,
      creditsAdded:  credits,
      newCredits:    updated.credits,
      newBalanceCents: updated.referral_balance_cents,
    });
  } catch (err) {
    console.error('Referral redeem error:', err);
    res.status(500).json({ error: 'Failed to redeem balance' });
  }
});

module.exports = { router, REFERRAL_AMOUNT_CENTS };
