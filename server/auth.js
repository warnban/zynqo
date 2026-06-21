import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getUserById } from "./db.js";

const SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const TTL = "30d";

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: TTL });
}

function readToken(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return null;
}

/** Требует авторизацию. Кладёт пользователя в req.user. */
export function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: "Требуется вход" });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Пользователь не найден" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Сессия истекла, войдите снова" });
  }
}

/** Требует роль admin. Использовать после requireAuth. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Доступ только для администратора" });
  next();
}

/** Мягкая авторизация: если токен есть — заполняет req.user, иначе пропускает. */
export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, SECRET);
      req.user = getUserById(payload.sub) || undefined;
    } catch {
      /* ignore */
    }
  }
  next();
}
