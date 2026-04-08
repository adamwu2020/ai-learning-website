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
  findByEmail:     (email)                    => pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]).then(r => r.rows[0] ?? null),
  createUser:      (name, email, hash)        => pool.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *', [name, email, hash]).then(r => r.rows[0]),
  findById:        (id)                       => pool.query('SELECT * FROM users WHERE id = $1', [id]).then(r => r.rows[0] ?? null),
  updateLastLogin: (id)                       => pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [id]),
  updatePassword:  (hash, id)                 => pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]),
  updateCredits:   (amt, id)                  => pool.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [amt, id]),
  setSubscription: (sub, id)                  => pool.query('UPDATE users SET subscription = $1 WHERE id = $2', [sub, id]),

  insertReset:     (userId, token, expiresAt) => pool.query('INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)', [userId, token, expiresAt]),
  findReset:       (token)                    => pool.query(`
    SELECT pr.*, u.email, u.name FROM password_resets pr
    JOIN users u ON u.id = pr.user_id
    WHERE pr.token = $1 AND pr.used = FALSE AND pr.expires_at > NOW()
  `, [token]).then(r => r.rows[0] ?? null),
  markResetUsed:   (token)                    => pool.query('UPDATE password_resets SET used = TRUE WHERE token = $1', [token]),
  deleteOldResets: (userId)                   => pool.query('DELETE FROM password_resets WHERE user_id = $1 AND used = FALSE', [userId]),

  insertTx:        (userId, type, amt, note)  => pool.query('INSERT INTO transactions (user_id, type, amount, note) VALUES ($1, $2, $3, $4)', [userId, type, amt, note]),
  getTxHistory:    (userId)                   => pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]).then(r => r.rows),
};

module.exports = { db };
