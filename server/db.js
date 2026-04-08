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

  // ── Admin ────────────────────────────────────────────────
  findAdminUser:   ()                    => pool.query('SELECT id FROM users WHERE is_admin = TRUE LIMIT 1').then(r => r.rows[0] ?? null),
  createAdminUser: (name, email, hash)   => pool.query(`
    INSERT INTO users (name, email, password_hash, is_admin)
    VALUES ($1, $2, $3, TRUE)
    ON CONFLICT (email) DO UPDATE SET is_admin = TRUE, password_hash = EXCLUDED.password_hash
  `, [name, email, hash]),
  findAllUsers:    ()      => pool.query(`
    SELECT id, name, email, credits, subscription, created_at, last_login, is_admin, disabled
    FROM users ORDER BY created_at DESC
  `).then(r => r.rows),
  setUserDisabled: (id, v) => pool.query('UPDATE users SET disabled = $1 WHERE id = $2', [v, id]),
  deleteUser:      (id)    => pool.query('DELETE FROM users WHERE id = $1', [id]),
  getAdminStats:   ()      => pool.query(`
    SELECT
      COUNT(*)                                                     AS total_users,
      COUNT(CASE WHEN subscription IS NOT NULL THEN 1 END)         AS subscribed_users,
      COUNT(CASE WHEN disabled = TRUE THEN 1 END)                  AS disabled_users,
      COALESCE(SUM(credits), 0)                                    AS total_credits
    FROM users WHERE is_admin = FALSE
  `).then(r => r.rows[0]),
};

module.exports = { db };
