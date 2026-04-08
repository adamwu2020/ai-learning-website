// ============================================================
//  Database — node:sqlite (built-in, Node 22.5+)
// ============================================================
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL + foreign keys
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ── Schema ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT    NOT NULL,
    credits         INTEGER NOT NULL DEFAULT 0,
    subscription    TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login      TEXT
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT    NOT NULL UNIQUE,
    expires_at  TEXT    NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL,
    amount      INTEGER NOT NULL,
    note        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Prepared Statements ────────────────────────────────────
const stmts = {
  createUser:      db.prepare(`INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)`),
  findByEmail:     db.prepare(`SELECT * FROM users WHERE email = ? COLLATE NOCASE`),
  findById:        db.prepare(`SELECT * FROM users WHERE id = ?`),
  updateLastLogin: db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`),
  updatePassword:  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`),
  updateCredits:   db.prepare(`UPDATE users SET credits = credits + ? WHERE id = ?`),
  setSubscription: db.prepare(`UPDATE users SET subscription = ? WHERE id = ?`),

  insertReset:     db.prepare(`INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)`),
  findReset:       db.prepare(`
    SELECT pr.*, u.email, u.name FROM password_resets pr
    JOIN users u ON u.id = pr.user_id
    WHERE pr.token = ? AND pr.used = 0 AND pr.expires_at > datetime('now')
  `),
  markResetUsed:   db.prepare(`UPDATE password_resets SET used = 1 WHERE token = ?`),
  deleteOldResets: db.prepare(`DELETE FROM password_resets WHERE user_id = ? AND used = 0`),

  insertTx:    db.prepare(`INSERT INTO transactions (user_id, type, amount, note) VALUES (?, ?, ?, ?)`),
  getTxHistory: db.prepare(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`),
};

module.exports = { db, stmts };
