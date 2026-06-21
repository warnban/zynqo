import crypto from "node:crypto";

// VK ID — OAuth 2.1 + PKCE. Документация: https://id.vk.com/about/business/go/docs/ru/vkid
const VK_BASE = "https://id.vk.ru";

const CLIENT_ID = () => process.env.VK_CLIENT_ID || "";
const REDIRECT_URI = () => process.env.VK_REDIRECT_URI || "http://localhost:8787/api/auth/vk/callback";
const SERVICE_TOKEN = () => process.env.VK_SERVICE_TOKEN || ""; // для конфиденциальных приложений
const SCOPE = () => process.env.VK_SCOPE || "email phone";

export const isConfigured = () => !!CLIENT_ID();

// Хранилище незавершённых авторизаций: state -> { verifier, ts }.
// Для одного инстанса достаточно памяти; на кластере — Redis.
const pending = new Map();
const TTL = 10 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.ts > TTL) pending.delete(k);
}

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Сформировать URL авторизации VK ID и запомнить PKCE-verifier по state. */
export function buildAuthUrl() {
  cleanup();
  const verifier = b64url(crypto.randomBytes(48)); // 64 символа из разрешённого алфавита
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(32));
  pending.set(state, { verifier, ts: Date.now() });

  const url = new URL(`${VK_BASE}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID());
  url.searchParams.set("redirect_uri", REDIRECT_URI());
  url.searchParams.set("scope", SCOPE());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Обменять код подтверждения на токены. */
export async function exchangeCode({ code, deviceId, state }) {
  const entry = pending.get(state);
  if (!entry) throw new Error("Истёкшая или неизвестная сессия авторизации (state)");
  pending.delete(state);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: entry.verifier,
    client_id: CLIENT_ID(),
    device_id: deviceId,
    redirect_uri: REDIRECT_URI(),
    state,
  });
  if (SERVICE_TOKEN()) body.set("service_token", SERVICE_TOKEN());

  const res = await fetch(`${VK_BASE}/oauth2/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`VK token error: ${data.error_description || data.error || res.status}`);
  }
  return data; // { access_token, user_id, ... }
}

/** Получить профиль пользователя по access_token. */
export async function getUserInfo(accessToken) {
  const body = new URLSearchParams({ client_id: CLIENT_ID(), access_token: accessToken });
  const res = await fetch(`${VK_BASE}/oauth2/user_info`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.user) throw new Error("Не удалось получить профиль VK");
  return data.user; // { user_id, first_name, last_name, phone, avatar, email }
}
