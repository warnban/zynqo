import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DB_PATH || path.join(dataDir, "zynqo.db");
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT,
    role          TEXT NOT NULL DEFAULT 'user',
    balance       REAL NOT NULL DEFAULT 0,
    phone         TEXT,
    fingerprint   TEXT,
    last_ip       TEXT,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ledger (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    amount        REAL NOT NULL,
    balance_after REAL NOT NULL,
    kind          TEXT NOT NULL,
    title         TEXT,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS generations (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    model_id    TEXT NOT NULL,
    model_name  TEXT,
    kind        TEXT NOT NULL,
    status      TEXT NOT NULL,
    cost        REAL NOT NULL DEFAULT 0,
    prompt      TEXT,
    result      TEXT,
    error       TEXT,
    duration_ms INTEGER,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS request_logs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    method     TEXT,
    path       TEXT,
    status     INTEGER,
    ip         TEXT,
    ua         TEXT,
    ms         INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_gen_user ON generations(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_logs_created ON request_logs(created_at);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_threads (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open',
    preview      TEXT,
    unread_user  INTEGER NOT NULL DEFAULT 0,
    unread_admin INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_messages (
    id         TEXT PRIMARY KEY,
    thread_id  TEXT NOT NULL,
    role       TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_support_thread_user ON support_threads(user_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_support_msg_thread ON support_messages(thread_id, created_at);

  CREATE TABLE IF NOT EXISTS email_verifications (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT,
    code          TEXT NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0,
    expires_at    INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_email_ver ON email_verifications(email, expires_at);
`);

// Миграции (идемпотентное добавление колонок для входа через VK).
function ensureColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
ensureColumn("users", "vk_id", "TEXT");
ensureColumn("users", "avatar", "TEXT");
ensureColumn("users", "provider", "TEXT DEFAULT 'local'");
ensureColumn("ledger", "cash_in", "REAL");
ensureColumn("generations", "tunnel_cost", "REAL");
// Старые пополнения: без cash_in считаем, что бонуса не было (оплата = зачисление).
db.exec(`UPDATE ledger SET cash_in = amount WHERE kind = 'topup' AND cash_in IS NULL`);

const DEFAULT_MARKUP = 2;

export function getMarkup() {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'markup'`).get();
  if (row) return Number(row.value) || DEFAULT_MARKUP;
  db.prepare(`INSERT INTO settings (key, value) VALUES ('markup', ?)`).run(String(DEFAULT_MARKUP));
  return DEFAULT_MARKUP;
}

export function setMarkup(value) {
  const v = Math.round(Number(value) * 10) / 10;
  if (!Number.isFinite(v) || v < 1 || v > 10) throw new Error("Наценка должна быть от 1 до 10");
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('markup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(v));
  return v;
}

export const now = () => Date.now();
export const uid = () => randomUUID();

// ─── Пользователи ─────────────────────────────────────────────────────────────

export function createUser({ email, passwordHash, name, role = "user", phone, ip, fingerprint }) {
  const id = uid();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, balance, phone, fingerprint, last_ip, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  ).run(id, email.toLowerCase(), passwordHash, name || null, role, phone || null, fingerprint || null, ip || null, now());
  return getUserById(id);
}

export function getUserByEmail(email) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(String(email).toLowerCase());
}

export function getUserById(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

export function getUserByVkId(vkId) {
  return db.prepare(`SELECT * FROM users WHERE vk_id = ?`).get(String(vkId));
}

/** Создать пользователя, вошедшего через VK ID. */
export function createVkUser({ vkId, email, name, avatar, ip }) {
  const id = uid();
  const safeEmail = (email && String(email).toLowerCase()) || `vk${vkId}@vk.local`;
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, balance, avatar, vk_id, provider, last_ip, created_at)
     VALUES (?, ?, '', ?, 'user', 0, ?, ?, 'vk', ?, ?)`,
  ).run(id, safeEmail, name || null, avatar || null, String(vkId), ip || null, now());
  return getUserById(id);
}

export function setUserIp(id, ip) {
  db.prepare(`UPDATE users SET last_ip = ? WHERE id = ?`).run(ip || null, id);
}

// ─── Подтверждение e-mail при регистрации ─────────────────────────────────────

export function clearEmailVerifications(email) {
  db.prepare(`DELETE FROM email_verifications WHERE email = ?`).run(String(email).toLowerCase());
}

export function createEmailVerification({ email, passwordHash, name, code, expiresAt }) {
  clearEmailVerifications(email);
  const id = uid();
  db.prepare(
    `INSERT INTO email_verifications (id, email, password_hash, name, code, attempts, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, String(email).toLowerCase(), passwordHash, name || null, code, expiresAt, now());
  return id;
}

export function getEmailVerification(email) {
  return db.prepare(
    `SELECT * FROM email_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
  ).get(String(email).toLowerCase());
}

export function incrementVerificationAttempts(id) {
  db.prepare(`UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?`).run(id);
}

export function countRecentVerifications(email, sinceMs) {
  return db.prepare(
    `SELECT COUNT(*) AS c FROM email_verifications WHERE email = ? AND created_at > ?`,
  ).get(String(email).toLowerCase(), sinceMs).c;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, balance: u.balance,
    avatar: u.avatar || null, provider: u.provider || "local", createdAt: u.created_at,
  };
}

// ─── Баланс (атомарно) ────────────────────────────────────────────────────────

const tx = (fn) => {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
};

/** Зачислить средства (пополнение, бонус, начисление админом, возврат). cashIn — реальные деньги (только topup). */
export function credit(userId, amount, kind, title, cashIn = null) {
  return tx(() => {
    const u = getUserById(userId);
    if (!u) throw new Error("user not found");
    const next = Math.round((u.balance + amount) * 100) / 100;
    db.prepare(`UPDATE users SET balance = ? WHERE id = ?`).run(next, userId);
    db.prepare(
      `INSERT INTO ledger (id, user_id, amount, balance_after, kind, title, cash_in, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uid(), userId, amount, next, kind, title || null, cashIn, now());
    return next;
  });
}

/** Списать средства. Возвращает {ok, balance}. */
export function debit(userId, amount, kind, title) {
  return tx(() => {
    const u = getUserById(userId);
    if (!u) throw new Error("user not found");
    if (u.balance < amount) return { ok: false, balance: u.balance };
    const next = Math.round((u.balance - amount) * 100) / 100;
    db.prepare(`UPDATE users SET balance = ? WHERE id = ?`).run(next, userId);
    db.prepare(
      `INSERT INTO ledger (id, user_id, amount, balance_after, kind, title, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(uid(), userId, -amount, next, kind, title || null, now());
    return { ok: true, balance: next };
  });
}

export function getLedger(userId, limit = 50) {
  return db.prepare(`SELECT * FROM ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit);
}

// ─── Генерации ────────────────────────────────────────────────────────────────

export function createGeneration({ userId, modelId, modelName, kind, prompt }) {
  const id = uid();
  db.prepare(
    `INSERT INTO generations (id, user_id, model_id, model_name, kind, status, prompt, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(id, userId, modelId, modelName, kind, prompt || null, now());
  return id;
}

export function finishGeneration(id, { status, cost = 0, tunnelCost = null, result, error, durationMs }) {
  db.prepare(
    `UPDATE generations SET status = ?, cost = ?, tunnel_cost = ?, result = ?, error = ?, duration_ms = ? WHERE id = ?`,
  ).run(status, cost, tunnelCost, result || null, error || null, durationMs || null, id);
}

export function getGenerations(userId, limit = 50) {
  return db.prepare(`SELECT * FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit);
}

// ─── Логи запросов ────────────────────────────────────────────────────────────

export function logRequest({ userId, method, path: p, status, ip, ua, ms }) {
  db.prepare(
    `INSERT INTO request_logs (id, user_id, method, path, status, ip, ua, ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(uid(), userId || null, method, p, status, ip || null, ua || null, ms || null, now());
}

// ─── Админ-выборки ────────────────────────────────────────────────────────────

export function adminListUsers(limit = 200) {
  return db
    .prepare(`SELECT id, email, name, role, balance, phone, last_ip, created_at FROM users ORDER BY created_at DESC LIMIT ?`)
    .all(limit);
}

export function adminListGenerations(limit = 200) {
  return db
    .prepare(
      `SELECT g.*, u.email AS user_email FROM generations g
       LEFT JOIN users u ON u.id = g.user_id
       ORDER BY g.created_at DESC LIMIT ?`,
    )
    .all(limit);
}

export function adminListLogs(limit = 300) {
  return db
    .prepare(
      `SELECT l.*, u.email AS user_email FROM request_logs l
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC LIMIT ?`,
    )
    .all(limit);
}

export function adminStats() {
  const users = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
  const gens = db.prepare(`SELECT COUNT(*) AS c FROM generations`).get().c;
  const revenue = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE kind = 'topup'`).get().s;
  const cashIn = db.prepare(`SELECT COALESCE(SUM(cash_in),0) AS s FROM ledger WHERE kind = 'topup' AND cash_in IS NOT NULL`).get().s;
  const spent = db.prepare(`SELECT COALESCE(-SUM(amount),0) AS s FROM ledger WHERE kind = 'spend'`).get().s;

  const doneGens = db.prepare(`SELECT cost, tunnel_cost, model_id FROM generations WHERE status = 'done'`).all();
  const markup = getMarkup();
  let apiCost = 0;
  for (const g of doneGens) {
    apiCost += g.tunnel_cost ?? Math.round(((g.cost || 0) / markup) * 100) / 100;
  }
  apiCost = Math.round(apiCost * 100) / 100;

  const adminGrants = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE kind = 'admin_credit' AND amount > 0`,
  ).get().s;
  const welcomeBonuses = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE kind = 'bonus' AND amount > 0`,
  ).get().s;
  const topupBonuses = db.prepare(
    `SELECT COALESCE(SUM(amount - cash_in),0) AS s FROM ledger WHERE kind = 'topup' AND cash_in IS NOT NULL AND amount > cash_in`,
  ).get().s;
  const freeCredits = Math.round((adminGrants + welcomeBonuses + topupBonuses) * 100) / 100;

  const grossMargin = Math.round((spent - apiCost) * 100) / 100;
  const profit = Math.round((cashIn - apiCost - freeCredits) * 100) / 100;
  const balances = db.prepare(`SELECT COALESCE(SUM(balance),0) AS s FROM users`).get().s;

  return {
    users, generations: gens, revenue, spent, totalBalances: balances,
    cashIn, apiCost, grossMargin, freeCredits, adminGrants, welcomeBonuses, topupBonuses, profit,
  };
}

// ─── Поддержка ────────────────────────────────────────────────────────────────

function supportPreview(body) {
  const s = String(body || "").trim().replace(/\s+/g, " ");
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

export function supportListUserThreads(userId) {
  return db.prepare(
    `SELECT id, status, preview, unread_user, created_at, updated_at
     FROM support_threads WHERE user_id = ? ORDER BY updated_at DESC`,
  ).all(userId);
}

export function supportListAdminThreads() {
  return db.prepare(
    `SELECT t.*, u.email AS user_email, u.name AS user_name
     FROM support_threads t LEFT JOIN users u ON u.id = t.user_id
     ORDER BY t.unread_admin DESC, t.updated_at DESC`,
  ).all();
}

export function supportGetThread(id) {
  return db.prepare(`SELECT * FROM support_threads WHERE id = ?`).get(id);
}

export function supportGetThreadForUser(id, userId) {
  const t = supportGetThread(id);
  return t && t.user_id === userId ? t : null;
}

export function supportGetMessages(threadId) {
  return db.prepare(
    `SELECT id, thread_id, role, body, created_at FROM support_messages WHERE thread_id = ? ORDER BY created_at ASC`,
  ).all(threadId);
}

export function supportUserUnread(userId) {
  return db.prepare(`SELECT COALESCE(SUM(unread_user),0) AS c FROM support_threads WHERE user_id = ?`).get(userId).c;
}

export function supportAdminUnread() {
  return db.prepare(`SELECT COALESCE(SUM(unread_admin),0) AS c FROM support_threads`).get().c;
}

export function supportCreateThread(userId, body) {
  const text = String(body || "").trim();
  if (!text) throw new Error("Напишите сообщение");
  const threadId = uid();
  const ts = now();
  db.prepare(
    `INSERT INTO support_threads (id, user_id, status, preview, unread_user, unread_admin, created_at, updated_at)
     VALUES (?, ?, 'open', ?, 0, 1, ?, ?)`,
  ).run(threadId, userId, supportPreview(text), ts, ts);
  db.prepare(
    `INSERT INTO support_messages (id, thread_id, role, body, created_at) VALUES (?, ?, 'user', ?, ?)`,
  ).run(uid(), threadId, text, ts);
  return { thread: supportGetThread(threadId), messages: supportGetMessages(threadId) };
}

export function supportAddUserMessage(threadId, userId, body) {
  const thread = supportGetThreadForUser(threadId, userId);
  if (!thread) throw new Error("Обращение не найдено");
  const text = String(body || "").trim();
  if (!text) throw new Error("Напишите сообщение");
  const ts = now();
  db.prepare(
    `UPDATE support_threads SET preview = ?, status = 'open', unread_admin = 1, updated_at = ? WHERE id = ?`,
  ).run(supportPreview(text), ts, threadId);
  db.prepare(
    `INSERT INTO support_messages (id, thread_id, role, body, created_at) VALUES (?, ?, 'user', ?, ?)`,
  ).run(uid(), threadId, text, ts);
  return supportGetMessages(threadId);
}

export function supportAddAdminMessage(threadId, body) {
  const thread = supportGetThread(threadId);
  if (!thread) throw new Error("Обращение не найдено");
  const text = String(body || "").trim();
  if (!text) throw new Error("Напишите ответ");
  const ts = now();
  db.prepare(
    `UPDATE support_threads SET status = 'open', unread_user = unread_user + 1, updated_at = ? WHERE id = ?`,
  ).run(ts, threadId);
  db.prepare(
    `INSERT INTO support_messages (id, thread_id, role, body, created_at) VALUES (?, ?, 'admin', ?, ?)`,
  ).run(uid(), threadId, text, ts);
  return supportGetMessages(threadId);
}

export function supportMarkUserRead(threadId, userId) {
  if (!supportGetThreadForUser(threadId, userId)) return;
  db.prepare(`UPDATE support_threads SET unread_user = 0 WHERE id = ?`).run(threadId);
}

export function supportMarkAdminRead(threadId) {
  db.prepare(`UPDATE support_threads SET unread_admin = 0 WHERE id = ?`).run(threadId);
}

export function supportSetStatus(threadId, status) {
  if (!["open", "closed"].includes(status)) throw new Error("Неверный статус");
  db.prepare(`UPDATE support_threads SET status = ?, updated_at = ? WHERE id = ?`).run(status, now(), threadId);
  return supportGetThread(threadId);
}

export default db;
