// ============================================================
//  Stripe Payment Links Integration
// ============================================================
const express = require('express');
const { db }  = require('../db');

const router = express.Router();

const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_MONTHLY_LINK   = process.env.STRIPE_MONTHLY_LINK;
const STRIPE_ANNUAL_LINK    = process.env.STRIPE_ANNUAL_LINK;

// Lazy-init stripe so the server still boots without a key configured
function getStripe() {
  if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  const Stripe = require('stripe');
  return Stripe(STRIPE_SECRET_KEY);
}

// ── GET /api/stripe/links ──────────────────────────────────
// Returns configured payment links (or null if not set up yet)
router.get('/links', (_req, res) => {
  res.json({
    monthly: STRIPE_MONTHLY_LINK  || null,
    annual:  STRIPE_ANNUAL_LINK   || null,
    configured: !!(STRIPE_MONTHLY_LINK && STRIPE_ANNUAL_LINK),
  });
});

// ── POST /api/stripe/webhook ───────────────────────────────
// Raw body is required — registered in server.js BEFORE express.json()
async function webhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  if (!STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId  = session.client_reference_id;
    if (!userId) {
      console.warn('Stripe webhook: no client_reference_id on session', session.id);
      return res.json({ received: true });
    }

    try {
      // Determine plan from metadata or payment amount
      // Payment links should have metadata set: { plan: 'monthly' } or { plan: 'annual' }
      const plan = session.metadata?.plan;
      const isAnnual = plan === 'annual' ||
        (session.amount_total && session.amount_total >= 99900); // $999 = 99900 cents

      const credits = isAnnual ? 2400 : 200;
      const days    = isAnnual ? 365  : 30;
      const label   = isAnnual ? 'Pro Annual' : 'Pro Monthly';
      const planKey = isAnnual ? 'annual' : 'monthly';

      const user = await db.findById(userId);
      if (!user) {
        console.error(`Stripe webhook: user ${userId} not found`);
        return res.json({ received: true });
      }

      // Build subscription object
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + days);
      const sub = {
        plan:      planKey,
        stripeSessionId: session.id,
        startedAt: new Date().toISOString(),
        expiresAt: expiry.toISOString(),
      };

      await db.setSubscription(JSON.stringify(sub), userId);
      await db.updateCredits(credits, userId);
      await db.insertTx(userId, 'credit', credits, `${label} subscription via Stripe`);

      console.log(`✅ Stripe payment confirmed: user=${userId} plan=${planKey} credits=${credits}`);
    } catch (err) {
      console.error('Stripe webhook processing error:', err);
      return res.status(500).json({ error: 'Failed to process payment' });
    }
  }

  res.json({ received: true });
}

module.exports = { router, webhookHandler };
