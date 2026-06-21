// Клиент AI Tunnel (OpenAI-совместимый API). Без ключа работает в ДЕМО-режиме.

const KEY = () => process.env.AITUNNEL_API_KEY || "";
const BASE = () => process.env.AITUNNEL_BASE_URL || "https://api.aitunnel.ru/v1";

export const isDemo = () => !KEY();

const authHeaders = () => ({ Authorization: `Bearer ${KEY()}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postJson(path, body) {
  const res = await fetch(`${BASE()}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Tunnel ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ─── Чат ───────────────────────────────────────────────────────────────────

export async function chat({ apiName, messages }) {
  if (isDemo()) {
    await sleep(500);
    const raw = messages[messages.length - 1]?.content;
    let last = "", atts = 0;
    if (typeof raw === "string") last = raw;
    else if (Array.isArray(raw)) {
      last = raw.filter((p) => p?.type === "text").map((p) => p.text || "").join(" ");
      atts = raw.filter((p) => p && p.type !== "text").length;
    }
    const attNote = atts ? ` Вложений получено: ${atts}.` : "";
    return {
      content: `🟣 Демо-режим (${apiName}). Ваш вопрос: «${last}».${attNote} Добавьте AITUNNEL_API_KEY в server/.env для реальных ответов.`,
      usage: { prompt_tokens: Math.ceil((last.length + atts * 400) / 4), completion_tokens: 40 },
    };
  }
  const data = await postJson("/chat/completions", { model: apiName, messages });
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
  };
}

// ─── Фото ────────────────────────────────────────────────────────────────────

export async function image({ apiName, prompt, size }) {
  if (isDemo()) {
    await sleep(900);
    return { url: demoImage(prompt) };
  }
  const data = await postJson("/images/generations", { model: apiName, prompt, n: 1, size: size || "1024x1024" });
  const item = data.data?.[0] || {};
  return { url: item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null) };
}

// ─── Видео (асинхронно: создать → опрашивать → ссылка) ───────────────────────

export async function video({ apiName, prompt, size, duration }) {
  if (isDemo()) {
    await sleep(1500);
    return { url: "demo://video", note: "Демо-режим: добавьте ключ AI Tunnel для реальной генерации видео." };
  }
  const job = await postJson("/videos", { model: apiName, prompt, size: size || "1280x720", duration: duration || 5 });
  let state = job;
  const pollUrl = job.polling_url;
  const deadline = Date.now() + 5 * 60 * 1000; // максимум 5 минут
  while (state.status !== "completed" && state.status !== "failed") {
    if (Date.now() > deadline) throw new Error("Превышено время ожидания видео");
    await sleep(5000);
    const res = await fetch(pollUrl, { headers: authHeaders() });
    state = await res.json();
  }
  if (state.status === "failed") throw new Error(state.error || "Генерация видео не удалась");
  return { url: state.unsigned_urls?.[0] || null };
}

// ─── Аудио → текст ────────────────────────────────────────────────────────────

export async function transcribe({ apiName, buffer, filename, mimetype, language }) {
  if (isDemo()) {
    await sleep(800);
    return { text: "🟣 Демо-режим: здесь появится расшифровка аудио. Добавьте AITUNNEL_API_KEY в server/.env." };
  }
  const form = new FormData();
  form.append("model", apiName);
  form.append("file", new Blob([buffer], { type: mimetype || "audio/mpeg" }), filename || "audio.mp3");
  if (language) form.append("language", language);
  const res = await fetch(`${BASE()}/audio/transcriptions`, { method: "POST", headers: authHeaders(), body: form });
  if (!res.ok) throw new Error(`AI Tunnel ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return { text: data.text ?? "" };
}

// Простая SVG-заглушка для демо-фото (data URL).
function demoImage(prompt) {
  const label = (prompt || "demo").slice(0, 40).replace(/[<>&]/g, "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
    <stop offset='0' stop-color='#7c3aed'/><stop offset='1' stop-color='#06b6d4'/></linearGradient></defs>
    <rect width='512' height='512' fill='url(#g)'/>
    <text x='50%' y='48%' fill='white' font-family='sans-serif' font-size='22' text-anchor='middle'>Демо-изображение</text>
    <text x='50%' y='56%' fill='white' font-family='sans-serif' font-size='14' text-anchor='middle' opacity='0.85'>${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
