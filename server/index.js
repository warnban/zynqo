import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import * as db from "./db.js";
import { hashPassword, verifyPassword, signToken, requireAuth, requireAdmin, optionalAuth } from "./auth.js";
import {
  getModel, estimateCost, chatActualCost, videoCost, tunnelCostFor, listModels,
  TOPUP_PACKS, WELCOME_BONUS_RUB, MIN_TOPUP_RUB,
} from "./pricing.js";
import * as ai from "./aitunnel.js";
import * as vk from "./vk.js";
import * as mail from "./email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL || "http://localhost:5173";
const IS_PROD = process.env.NODE_ENV === "production";
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, "..", "dist");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

const corsOrigins = (process.env.CORS_ORIGINS || APP_URL)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(IS_PROD ? { origin: corsOrigins, credentials: true } : undefined));
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "zynqo",
    uptime: Math.floor(process.uptime()),
    demo: ai.isDemo(),
    smtp: mail.isSmtpConfigured(),
  });
});

// ─── Логирование всех /api запросов ───────────────────────────────────────────
app.use("/api", optionalAuth, (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    db.logRequest({
      userId: req.user?.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ip: clientIp(req),
      ua: req.headers["user-agent"],
      ms: Date.now() - start,
    });
  });
  next();
});

function clientIp(req) {
  return (req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "").trim();
}

const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ─── Авторизация ──────────────────────────────────────────────────────────────

/** Шаг 1 регистрации: отправить 6-значный код на e-mail. */
app.post("/api/auth/register/request", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!isEmail(email)) return res.status(400).json({ error: "Введите корректный e-mail" });
  if (!password || password.length < 6) return res.status(400).json({ error: "Пароль минимум 6 символов" });
  if (db.getUserByEmail(email)) return res.status(409).json({ error: "Такой e-mail уже зарегистрирован" });

  const since = Date.now() - 60 * 60 * 1000;
  if (db.countRecentVerifications(email, since) >= 5) {
    return res.status(429).json({ error: "Слишком много попыток. Попробуйте через час." });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const passwordHash = await hashPassword(password);
  db.createEmailVerification({
    email,
    passwordHash,
    name: name?.trim() || null,
    code,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });

  try {
    await mail.sendVerificationCode(email, code);
  } catch (e) {
    console.error("[SMTP]", e.message);
    return res.status(502).json({ error: "Не удалось отправить письмо. Проверьте адрес или попробуйте позже." });
  }

  res.json({ ok: true, email: email.toLowerCase(), smtpConfigured: mail.isSmtpConfigured() });
});

/** Шаг 2 регистрации: подтвердить код и создать аккаунт. */
app.post("/api/auth/register/verify", async (req, res) => {
  const { email, code, fingerprint } = req.body || {};
  if (!isEmail(email)) return res.status(400).json({ error: "Введите корректный e-mail" });
  const cleanCode = String(code || "").replace(/\D/g, "");
  if (cleanCode.length !== 6) return res.status(400).json({ error: "Введите 6-значный код" });

  const row = db.getEmailVerification(email);
  if (!row) return res.status(400).json({ error: "Код не найден. Запросите новый." });
  if (row.expires_at < Date.now()) {
    db.clearEmailVerifications(email);
    return res.status(400).json({ error: "Код истёк. Запросите новый." });
  }
  if (row.attempts >= 5) {
    db.clearEmailVerifications(email);
    return res.status(429).json({ error: "Превышено число попыток. Запросите новый код." });
  }
  if (row.code !== cleanCode) {
    db.incrementVerificationAttempts(row.id);
    return res.status(400).json({ error: "Неверный код" });
  }
  if (db.getUserByEmail(email)) {
    db.clearEmailVerifications(email);
    return res.status(409).json({ error: "Такой e-mail уже зарегистрирован" });
  }

  const user = db.createUser({
    email,
    passwordHash: row.password_hash,
    name: row.name,
    ip: clientIp(req),
    fingerprint,
  });
  db.clearEmailVerifications(email);
  db.credit(user.id, WELCOME_BONUS_RUB, "bonus", "Приветственный бонус");
  const fresh = db.getUserById(user.id);
  res.json({ token: signToken(fresh), user: db.publicUser(fresh) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.getUserByEmail(email || "");
  if (!user || !(await verifyPassword(password || "", user.password_hash))) {
    return res.status(401).json({ error: "Неверный e-mail или пароль" });
  }
  db.setUserIp(user.id, clientIp(req));
  res.json({ token: signToken(user), user: db.publicUser(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: db.publicUser(req.user) });
});

// Конфигурация для фронтенда (какие способы входа доступны).
app.get("/api/config", (_req, res) => res.json({ vkEnabled: vk.isConfigured() }));

// Каталог с актуальными розничными ценами (зависят от наценки).
app.get("/api/catalog", (_req, res) => {
  const markup = db.getMarkup();
  res.json({
    markup,
    models: listModels(markup).map((m) => ({ id: m.id, pricing: m.pricing })),
  });
});

// ─── Вход через VK ID (OAuth 2.1 + PKCE) ──────────────────────────────────────

app.get("/api/auth/vk/start", (_req, res) => {
  if (!vk.isConfigured()) return res.status(400).json({ error: "Вход через VK не настроен (нет VK_CLIENT_ID)" });
  res.redirect(vk.buildAuthUrl());
});

app.get("/api/auth/vk/callback", async (req, res) => {
  const { code, state, device_id, error, error_description } = req.query;
  const fail = (msg) => res.redirect(`${APP_URL}/?vk_error=${encodeURIComponent(msg)}`);
  if (error || !code) return fail(error_description || error || "Авторизация отменена");
  try {
    const tok = await vk.exchangeCode({ code, deviceId: device_id, state });
    const profile = await vk.getUserInfo(tok.access_token);
    const vkId = String(profile.user_id || tok.user_id);

    let user = db.getUserByVkId(vkId);
    if (!user) {
      const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
      user = db.createVkUser({ vkId, email: profile.email, name, avatar: profile.avatar, ip: clientIp(req) });
      db.credit(user.id, WELCOME_BONUS_RUB, "bonus", "Приветственный бонус (VK)");
      user = db.getUserById(user.id);
    } else {
      db.setUserIp(user.id, clientIp(req));
    }
    res.redirect(`${APP_URL}/?token=${encodeURIComponent(signToken(user))}`);
  } catch (e) {
    fail(e.message);
  }
});

// ─── Баланс ───────────────────────────────────────────────────────────────────

app.get("/api/balance", requireAuth, (req, res) => {
  res.json({ balance: req.user.balance, ledger: db.getLedger(req.user.id) });
});

// Имитация успешной оплаты. На проде вызывается вебхуком платёжной системы.
app.post("/api/balance/topup", requireAuth, (req, res) => {
  const { packId, amount } = req.body || {};
  let pay, credited, title;
  if (packId && TOPUP_PACKS[packId]) {
    pay = TOPUP_PACKS[packId].pay;
    credited = TOPUP_PACKS[packId].credited;
    title = `Пополнение «${TOPUP_PACKS[packId].name}»`;
  } else if (amount && Number(amount) >= MIN_TOPUP_RUB) {
    pay = Math.round(Number(amount));
    credited = pay;
    title = "Пополнение";
  } else {
    return res.status(400).json({ error: `Минимум ${MIN_TOPUP_RUB} ₽` });
  }
  const balance = db.credit(req.user.id, credited, "topup", title, pay);
  res.json({ balance, credited });
});

// ─── Генерации ────────────────────────────────────────────────────────────────

// Чат: списываем по фактическим токенам.
// Контент сообщения может быть строкой или массивом частей (текст + вложения).
function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content.filter((p) => p?.type === "text").map((p) => p.text || "").join(" ").trim();
    const atts = content.filter((p) => p && p.type !== "text").length;
    return text + (atts ? ` [вложений: ${atts}]` : "");
  }
  return "";
}

app.post("/api/generate/chat", requireAuth, async (req, res) => {
  const { modelId, messages } = req.body || {};
  const markup = db.getMarkup();
  const model = getModel(modelId, markup);
  if (!model || model.kind !== "chat") return res.status(400).json({ error: "Неизвестная модель чата" });
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "Пустой запрос" });

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const lastUserText = contentToText(lastUser);
  const estimate = estimateCost(model, { inputText: lastUserText });
  if (req.user.balance < estimate) return res.status(402).json({ error: "Недостаточно средств", needed: estimate });

  const genId = db.createGeneration({ userId: req.user.id, modelId, modelName: model.name, kind: "chat", prompt: lastUserText });
  const t0 = Date.now();
  try {
    const { content, usage } = await ai.chat({ apiName: model.apiName, messages });
    const cost = Math.max(0.01, chatActualCost(model.pricing, usage));
    const tunnelCost = tunnelCostFor(modelId, { usage, retailCost: cost });
    const r = db.debit(req.user.id, cost, "spend", `Чат · ${model.name}`);
    db.finishGeneration(genId, { status: "done", cost, tunnelCost, result: content.slice(0, 4000), durationMs: Date.now() - t0 });
    res.json({ reply: content, cost, balance: r.balance });
  } catch (e) {
    db.finishGeneration(genId, { status: "error", error: String(e.message), durationMs: Date.now() - t0 });
    res.status(502).json({ error: "Модель недоступна: " + e.message });
  }
});

// Фото: фиксированная цена (холд → списание/возврат).
app.post("/api/generate/image", requireAuth, async (req, res) => {
  const { modelId, prompt, size } = req.body || {};
  const model = getModel(modelId, db.getMarkup());
  if (!model || model.kind !== "image") return res.status(400).json({ error: "Неизвестная модель изображения" });
  if (!prompt?.trim()) return res.status(400).json({ error: "Опишите изображение" });

  const cost = model.pricing.perImage;
  const tunnelCost = tunnelCostFor(modelId, { retailCost: cost });
  await runMediaJob(req, res, { model, modelId, kind: "image", prompt, cost, tunnelCost }, () =>
    ai.image({ apiName: model.apiName, prompt, size }),
  );
});

// Видео: цена по пресету/длительности.
app.post("/api/generate/video", requireAuth, async (req, res) => {
  const { modelId, prompt, presetId, seconds } = req.body || {};
  const model = getModel(modelId, db.getMarkup());
  if (!model || model.kind !== "video") return res.status(400).json({ error: "Неизвестная модель видео" });
  if (!prompt?.trim()) return res.status(400).json({ error: "Опишите сцену" });

  const cost = videoCost(model.pricing, { presetId, seconds });
  const preset = model.pricing.presets?.[presetId];
  const size = preset?.size || model.pricing.size;
  const dur = preset?.seconds || seconds || 5;
  const tunnelCost = tunnelCostFor(modelId, { presetId, seconds: dur, retailCost: cost });
  await runMediaJob(req, res, { model, modelId, kind: "video", prompt, cost, tunnelCost }, () =>
    ai.video({ apiName: model.apiName, prompt, size, duration: dur }),
  );
});

// Аудио → текст: цена за минуты (передаются клиентом, на проде — измеряются из файла).
app.post("/api/generate/transcribe", requireAuth, upload.single("file"), async (req, res) => {
  const { modelId, minutes, language } = req.body || {};
  const model = getModel(modelId, db.getMarkup());
  if (!model || model.kind !== "transcribe") return res.status(400).json({ error: "Неизвестная модель" });
  if (!req.file) return res.status(400).json({ error: "Загрузите аудиофайл" });

  const cost = estimateCost(model, { minutes: Number(minutes) || 1 });
  const tunnelCost = tunnelCostFor(modelId, { minutes: Number(minutes) || 1, retailCost: cost });
  await runMediaJob(req, res, { model, modelId, kind: "transcribe", prompt: req.file.originalname, cost, tunnelCost }, async () => {
    const { text } = await ai.transcribe({
      apiName: model.apiName, buffer: req.file.buffer,
      filename: req.file.originalname, mimetype: req.file.mimetype, language,
    });
    return { url: null, text };
  });
});

// Общий поток для платных медиа-операций: холд → вызов → списание/возврат.
async function runMediaJob(req, res, { model, modelId, kind, prompt, cost, tunnelCost }, call) {
  if (req.user.balance < cost) return res.status(402).json({ error: "Недостаточно средств", needed: cost });

  const hold = db.debit(req.user.id, cost, "spend", `${kindTitle(kind)} · ${model.name}`);
  if (!hold.ok) return res.status(402).json({ error: "Недостаточно средств", needed: cost });

  const genId = db.createGeneration({ userId: req.user.id, modelId, modelName: model.name, kind, prompt });
  const t0 = Date.now();
  try {
    const result = await call();
    db.finishGeneration(genId, {
      status: "done", cost, tunnelCost,
      result: result.text ? result.text.slice(0, 4000) : result.url,
      durationMs: Date.now() - t0,
    });
    res.json({ ...result, cost, balance: hold.balance });
  } catch (e) {
    const balance = db.credit(req.user.id, cost, "refund", `Возврат · ${model.name}`);
    db.finishGeneration(genId, { status: "error", error: String(e.message), durationMs: Date.now() - t0 });
    res.status(502).json({ error: "Модель недоступна: " + e.message, balance });
  }
}

const kindTitle = (k) => ({ image: "Фото", video: "Видео", transcribe: "Транскрибация", chat: "Чат" }[k] || k);

app.get("/api/generations", requireAuth, (req, res) => {
  res.json({ generations: db.getGenerations(req.user.id) });
});

// ─── Поддержка (клиент) ───────────────────────────────────────────────────────

app.get("/api/support/unread", requireAuth, (req, res) => {
  if (req.user.role === "admin") return res.json({ unread: 0 });
  res.json({ unread: db.supportUserUnread(req.user.id) });
});

app.get("/api/support/threads", requireAuth, (req, res) => {
  if (req.user.role === "admin") return res.status(403).json({ error: "Только для клиентов" });
  res.json({ threads: db.supportListUserThreads(req.user.id) });
});

app.post("/api/support/threads", requireAuth, (req, res) => {
  if (req.user.role === "admin") return res.status(403).json({ error: "Только для клиентов" });
  try {
    const data = db.supportCreateThread(req.user.id, req.body?.body);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/support/threads/:id", requireAuth, (req, res) => {
  if (req.user.role === "admin") return res.status(403).json({ error: "Только для клиентов" });
  const thread = db.supportGetThreadForUser(req.params.id, req.user.id);
  if (!thread) return res.status(404).json({ error: "Обращение не найдено" });
  db.supportMarkUserRead(thread.id, req.user.id);
  res.json({ thread, messages: db.supportGetMessages(thread.id) });
});

app.post("/api/support/threads/:id/messages", requireAuth, (req, res) => {
  if (req.user.role === "admin") return res.status(403).json({ error: "Только для клиентов" });
  try {
    const messages = db.supportAddUserMessage(req.params.id, req.user.id, req.body?.body);
    res.json({ messages });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Админ ────────────────────────────────────────────────────────────────────

app.get("/api/admin/stats", requireAuth, requireAdmin, (_req, res) => {
  res.json({ ...db.adminStats(), markup: db.getMarkup() });
});

app.get("/api/admin/settings", requireAuth, requireAdmin, (_req, res) => {
  res.json({ markup: db.getMarkup() });
});

app.post("/api/admin/settings", requireAuth, requireAdmin, (req, res) => {
  const { markup } = req.body || {};
  try {
    const saved = db.setMarkup(markup);
    res.json({ markup: saved, models: listModels(saved).map((m) => ({ id: m.id, pricing: m.pricing })) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/admin/users", requireAuth, requireAdmin, (_req, res) => res.json({ users: db.adminListUsers() }));
app.get("/api/admin/generations", requireAuth, requireAdmin, (_req, res) => res.json({ generations: db.adminListGenerations() }));
app.get("/api/admin/logs", requireAuth, requireAdmin, (_req, res) => res.json({ logs: db.adminListLogs() }));

app.post("/api/admin/credit", requireAuth, requireAdmin, (req, res) => {
  const { userId, amount, note } = req.body || {};
  const target = db.getUserById(userId);
  if (!target) return res.status(404).json({ error: "Пользователь не найден" });
  const sum = Number(amount);
  if (!sum) return res.status(400).json({ error: "Укажите сумму" });
  const balance = db.credit(userId, sum, "admin_credit", note || `Начисление администратором`);
  res.json({ balance });
});

app.get("/api/admin/support/unread", requireAuth, requireAdmin, (_req, res) => {
  res.json({ unread: db.supportAdminUnread() });
});

app.get("/api/admin/support/threads", requireAuth, requireAdmin, (_req, res) => {
  res.json({ threads: db.supportListAdminThreads() });
});

app.get("/api/admin/support/threads/:id", requireAuth, requireAdmin, (req, res) => {
  const thread = db.supportGetThread(req.params.id);
  if (!thread) return res.status(404).json({ error: "Обращение не найдено" });
  db.supportMarkAdminRead(thread.id);
  const user = db.getUserById(thread.user_id);
  res.json({
    thread,
    user: user ? { email: user.email, name: user.name } : null,
    messages: db.supportGetMessages(thread.id),
  });
});

app.post("/api/admin/support/threads/:id/messages", requireAuth, requireAdmin, (req, res) => {
  try {
    const messages = db.supportAddAdminMessage(req.params.id, req.body?.body);
    res.json({ messages });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.patch("/api/admin/support/threads/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const thread = db.supportSetStatus(req.params.id, req.body?.status);
    res.json({ thread });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Статика фронтенда (production) ───────────────────────────────────────────

function setupStatic() {
  if (process.env.SERVE_STATIC === "false") return;
  if (!fs.existsSync(STATIC_DIR)) {
    if (IS_PROD) console.warn(`⚠ STATIC_DIR не найден: ${STATIC_DIR}`);
    return;
  }
  app.use(express.static(STATIC_DIR, { index: false, maxAge: IS_PROD ? "7d" : 0 }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(STATIC_DIR, "index.html"), (err) => (err ? next(err) : undefined));
  });
  console.log(`✓ Статика: ${STATIC_DIR}`);
}

// ─── Старт ────────────────────────────────────────────────────────────────────

async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (db.getUserByEmail(email)) return;
  const admin = db.createUser({ email, passwordHash: await hashPassword(password), name: "Администратор", role: "admin" });
  db.credit(admin.id, 1000, "admin_credit", "Стартовый баланс администратора");
  console.log(`✓ Создан администратор: ${email}`);
}

setupStatic();

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

ensureAdmin().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`✓ zynqo API на http://${HOST}:${PORT}`);
    console.log(`  Режим: ${IS_PROD ? "production" : "development"}`);
    console.log(`  APP_URL: ${APP_URL}`);
    console.log(`  SMTP: ${mail.isSmtpConfigured() ? "настроен" : "не настроен (коды в консоли)"}`);
    console.log(`  Генерации: ${ai.isDemo() ? "ДЕМО (нет AITUNNEL_API_KEY)" : "РЕАЛЬНЫЙ"}`);
  });
});
