// ============================================================
//  Database — PostgreSQL via pg (Supabase)
// ============================================================
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => console.error('PG pool error:', err));

const db = {
  // ── Users ────────────────────────────────────────────────
  findByEmail:     (email)             => pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]).then(r => r.rows[0] ?? null),
  createUser:      (name, email, hash) => pool.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *', [name, email, hash]).then(r => r.rows[0]),
  findById:        (id)                => pool.query('SELECT * FROM users WHERE id = $1', [id]).then(r => r.rows[0] ?? null),
  updateLastLogin: (id)                => pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [id]),
  updatePassword:  (hash, id)          => pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]),
  updateCredits:   (amt, id)           => pool.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [amt, id]),
  setSubscription: (sub, id)           => pool.query('UPDATE users SET subscription = $1 WHERE id = $2', [sub, id]),

  // ── Password resets ──────────────────────────────────────
  insertReset:     (userId, token, expiresAt) => pool.query('INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)', [userId, token, expiresAt]),
  findReset:       (token)                    => pool.query(`
    SELECT pr.*, u.email, u.name FROM password_resets pr
    JOIN users u ON u.id = pr.user_id
    WHERE pr.token = $1 AND pr.used = FALSE AND pr.expires_at > NOW()
  `, [token]).then(r => r.rows[0] ?? null),
  markResetUsed:   (token)   => pool.query('UPDATE password_resets SET used = TRUE WHERE token = $1', [token]),
  deleteOldResets: (userId)  => pool.query('DELETE FROM password_resets WHERE user_id = $1 AND used = FALSE', [userId]),

  // ── Transactions ─────────────────────────────────────────
  insertTx:     (userId, type, amt, note) => pool.query('INSERT INTO transactions (user_id, type, amount, note) VALUES ($1, $2, $3, $4)', [userId, type, amt, note]),
  getTxHistory: (userId)                  => pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]).then(r => r.rows),

  // ── Progress ─────────────────────────────────────────────
  upsertProgress:  (userId, course, module, lesson) => pool.query(`
    INSERT INTO user_progress (user_id, course, module, lesson)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, course, module, lesson) DO NOTHING
  `, [userId, course, module, lesson]),
  getUserProgress: (userId) => pool.query('SELECT * FROM user_progress WHERE user_id = $1 ORDER BY completed_at DESC', [userId]).then(r => r.rows),

  // ── Coupons ──────────────────────────────────────────────
  createCouponsTable: () => pool.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id         SERIAL PRIMARY KEY,
      code       TEXT UNIQUE NOT NULL,
      days       INTEGER NOT NULL CHECK (days >= 1 AND days <= 10000),
      expires_at TIMESTAMPTZ,
      used_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `),
  getCoupons:          ()                         => pool.query('SELECT * FROM coupons ORDER BY created_at DESC').then(r => r.rows),
  getCouponByCode:     (code)                     => pool.query('SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)', [code]).then(r => r.rows[0] ?? null),
  createCoupon:        (code, days, expiresAt)    => pool.query('INSERT INTO coupons (code, days, expires_at) VALUES (UPPER($1), $2, $3) RETURNING *', [code, days, expiresAt || null]).then(r => r.rows[0]),
  updateCoupon:        (id, days, expiresAt)      => pool.query('UPDATE coupons SET days = $1, expires_at = $2 WHERE id = $3 RETURNING *', [days, expiresAt || null, id]).then(r => r.rows[0]),
  deleteCoupon:        (id)                       => pool.query('DELETE FROM coupons WHERE id = $1', [id]),
  incrementCouponUsed: (code)                     => pool.query('UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = UPPER($1)', [code]),

  // ── Referrals ────────────────────────────────────────────
  createReferralTable: () => pool.query(`
    CREATE TABLE IF NOT EXISTS referrals (
      id           SERIAL PRIMARY KEY,
      referrer_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      amount_cents INTEGER NOT NULL DEFAULT 2000,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16) UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_balance_cents INTEGER NOT NULL DEFAULT 0;
  `),
  findByReferralCode:  (code)   => pool.query('SELECT * FROM users WHERE UPPER(referral_code) = UPPER($1)', [code]).then(r => r.rows[0] ?? null),
  setReferralCode:     (id, code) => pool.query('UPDATE users SET referral_code = $1 WHERE id = $2', [code, id]),
  addReferralBalance:  (id, cents) => pool.query('UPDATE users SET referral_balance_cents = referral_balance_cents + $1 WHERE id = $2', [cents, id]),
  deductReferralBalance: (id, cents) => pool.query('UPDATE users SET referral_balance_cents = referral_balance_cents - $1 WHERE id = $2 RETURNING referral_balance_cents', [cents, id]).then(r => r.rows[0]),
  insertReferral:      (referrerId, referredId, amountCents) => pool.query('INSERT INTO referrals (referrer_id, referred_id, amount_cents) VALUES ($1, $2, $3) ON CONFLICT (referred_id) DO NOTHING', [referrerId, referredId, amountCents]),
  getReferralStats:    (userId) => pool.query('SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS total_cents FROM referrals WHERE referrer_id = $1', [userId]).then(r => r.rows[0]),

  // ── Admin ────────────────────────────────────────────────
  findAdminUser:   ()                    => pool.query('SELECT id FROM users WHERE is_admin = TRUE LIMIT 1').then(r => r.rows[0] ?? null),
  createAdminUser: (name, email, hash)   => pool.query(`
    INSERT INTO users (name, email, password_hash, is_admin)
    VALUES ($1, $2, $3, TRUE)
    ON CONFLICT (email) DO UPDATE SET is_admin = TRUE, password_hash = EXCLUDED.password_hash
  `, [name, email, hash]),
  findAllUsers:    ()      => pool.query(`
    SELECT u.id, u.name, u.email, u.credits, u.subscription, u.created_at, u.last_login, u.is_admin, u.disabled,
      COALESCE(p.lessons_completed, 0) AS lessons_completed,
      COALESCE(p.courses_count, 0) AS courses_count
    FROM users u
    LEFT JOIN (
      SELECT user_id,
        COUNT(*) AS lessons_completed,
        COUNT(DISTINCT course) AS courses_count
      FROM user_progress
      GROUP BY user_id
    ) p ON p.user_id = u.id
    ORDER BY u.created_at DESC
  `).then(r => r.rows),
  setUserDisabled: (id, v) => pool.query('UPDATE users SET disabled = $1 WHERE id = $2', [v, id]),
  deleteUser:      (id)    => pool.query('DELETE FROM users WHERE id = $1', [id]),
  getAdminStats:   ()      => pool.query(`
    SELECT
      COUNT(*)                                                     AS total_users,
      COUNT(CASE WHEN subscription IS NOT NULL THEN 1 END)         AS subscribed_users,
      COUNT(CASE WHEN disabled = TRUE THEN 1 END)                  AS disabled_users,
      COALESCE(SUM(credits), 0)                                    AS total_credits,
      (SELECT COUNT(*) FROM user_progress)                         AS total_lessons_completed,
      (SELECT COUNT(DISTINCT user_id) FROM user_progress)          AS active_learners
    FROM users WHERE is_admin = FALSE
  `).then(r => r.rows[0]),
};

module.exports = { db };
