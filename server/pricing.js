// Серверный каталог моделей и расчёт стоимости (в рублях).
// Розница = себестоимость AI Tunnel × наценка (markup из settings, по умолчанию ×2).

/** Метаданные моделей (без цен). */
export const MODEL_DEFS = {
  "gemini-flash-lite": {
    apiName: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    kind: "chat",
  },
  "gpt-5-5": {
    apiName: "gpt-5.5",
    name: "GPT 5.5",
    kind: "chat",
  },
  "gemini-flash-image": {
    apiName: "gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    kind: "image",
  },
  "gemini-pro-image": {
    apiName: "gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    kind: "image",
  },
  "veo-3-1-lite": {
    apiName: "veo-3.1-lite",
    name: "Veo 3.1 Lite",
    kind: "video",
    videoExtras: {
      presets: {
        "720p-8s": { seconds: 8, size: "1280x720" },
        "1080p-8s": { seconds: 8, size: "1920x1080" },
      },
    },
  },
  "kling-v3-pro": {
    apiName: "kling-v3.0-pro",
    name: "Kling V3.0 Pro",
    kind: "video",
    videoExtras: { size: "1280x720" },
  },
  "voxtral-transcribe": {
    apiName: "voxtral-mini-transcribe",
    name: "Voxtral Mini Transcribe",
    kind: "transcribe",
  },
};

/** Себестоимость AI Tunnel (источник: aitunnel.ru/models). */
export const TUNNEL_COST = {
  "gemini-flash-lite": {
    pricing: { type: "tokens", inputPer1k: 0.048, outputPer1k: 0.288 },
  },
  "gpt-5-5": {
    pricing: { type: "tokens", inputPer1k: 0.96, outputPer1k: 5.76 },
  },
  "gemini-flash-image": {
    pricing: { type: "image", perImage: 6.53 },
  },
  "gemini-pro-image": {
    pricing: { type: "image", perImage: 20.4 },
  },
  "veo-3-1-lite": {
    pricing: {
      type: "video",
      presets: {
        "720p-8s": { price: 39 },
        "1080p-8s": { price: 104 },
      },
    },
  },
  "kling-v3-pro": {
    pricing: { type: "video", perSecond: 18.3 },
  },
  "voxtral-transcribe": {
    pricing: { type: "transcribe", perMinute: 0.58, minCharge: 0.58 },
  },
};

export const TOPUP_PACKS = {
  start: { name: "Старт", pay: 199, credited: 199 },
  base: { name: "Базовый", pay: 499, credited: 549 },
  standard: { name: "Стандарт", pay: 999, credited: 1149 },
  value: { name: "Выгодный", pay: 2490, credited: 2990 },
  maxi: { name: "Макси", pay: 4990, credited: 6240 },
};

export const WELCOME_BONUS_RUB = 30;
export const MIN_TOPUP_RUB = 199;
export const DEFAULT_MARKUP = 2;

export function round2(n) {
  return Math.round(n * 100) / 100;
}

function mark(n, markup) {
  return round2(n * markup);
}

/** Розничные цены из себестоимости × наценка. */
export function buildRetailPricing(modelId, markup = DEFAULT_MARKUP) {
  const tunnel = TUNNEL_COST[modelId]?.pricing;
  const extras = MODEL_DEFS[modelId]?.videoExtras;
  if (!tunnel) return null;
  const m = Number(markup) || DEFAULT_MARKUP;

  switch (tunnel.type) {
    case "tokens": {
      const pricing = {
        type: "tokens",
        inputPer1k: mark(tunnel.inputPer1k, m),
        outputPer1k: mark(tunnel.outputPer1k, m),
        approxPerMessage: 0,
      };
      pricing.approxPerMessage = Math.max(
        0.01,
        estimateCost({ pricing }, { inputTokens: 100, outputTokens: 150 }),
      );
      return pricing;
    }
    case "image":
      return { type: "image", perImage: mark(tunnel.perImage, m) };
    case "video":
      if (tunnel.presets) {
        const presets = {};
        for (const [id, p] of Object.entries(tunnel.presets)) {
          presets[id] = { ...(extras?.presets?.[id] || {}), price: mark(p.price, m) };
        }
        return { type: "video", presets };
      }
      return { type: "video", perSecond: Math.round(mark(tunnel.perSecond, m)), size: extras?.size };
    case "transcribe":
      return {
        type: "transcribe",
        perMinute: mark(tunnel.perMinute, m),
        minCharge: Math.max(1, mark(tunnel.minCharge, m)),
      };
    default:
      return null;
  }
}

export function getModel(id, markup = DEFAULT_MARKUP) {
  const def = MODEL_DEFS[id];
  if (!def) return null;
  const pricing = buildRetailPricing(id, markup);
  if (!pricing) return null;
  return { ...def, pricing };
}

export function listModels(markup = DEFAULT_MARKUP) {
  return Object.keys(MODEL_DEFS)
    .map((id) => {
      const m = getModel(id, markup);
      return m ? { id, ...m } : null;
    })
    .filter(Boolean);
}

/** Грубая оценка числа токенов по тексту (1 токен ≈ 4 символа). */
export function estimateTokens(text) {
  return Math.max(1, Math.ceil((text || "").length / 4));
}

/** Предварительная стоимость до генерации (для холда). */
export function estimateCost(model, opts = {}) {
  const p = model.pricing;
  switch (p.type) {
    case "tokens": {
      const inTok = opts.inputTokens ?? estimateTokens(opts.inputText || "");
      const outTok = opts.outputTokens ?? Math.max(200, inTok * 2);
      return round2((inTok / 1000) * p.inputPer1k + (outTok / 1000) * p.outputPer1k);
    }
    case "image":
      return p.perImage;
    case "video":
      return videoCost(p, opts);
    case "transcribe":
      return Math.max(p.minCharge, round2((opts.minutes || 1) * p.perMinute));
  }
  return 0;
}

export function videoCost(p, opts = {}) {
  if (p.presets) {
    const preset = p.presets[opts.presetId] || Object.values(p.presets)[0];
    return preset.price;
  }
  if (p.perSecond) return Math.round(p.perSecond * (opts.seconds || 5));
  return 0;
}

/** Точная стоимость чата по фактическим токенам из ответа AI Tunnel. */
export function chatActualCost(p, usage) {
  const inTok = usage?.prompt_tokens ?? 0;
  const outTok = usage?.completion_tokens ?? 0;
  return round2((inTok / 1000) * p.inputPer1k + (outTok / 1000) * p.outputPer1k);
}

/** Себестоимость одной генерации для админ‑отчёта. */
export function tunnelCostFor(modelId, opts = {}) {
  const tc = TUNNEL_COST[modelId];
  if (!tc) return round2((opts.retailCost || 0) / (opts.markup || DEFAULT_MARKUP));
  const p = tc.pricing;
  switch (p.type) {
    case "tokens":
      if (opts.usage) return chatActualCost(p, opts.usage);
      return round2((opts.retailCost || 0) / (opts.markup || DEFAULT_MARKUP));
    case "image":
      return p.perImage;
    case "video":
      return videoCost(p, opts);
    case "transcribe":
      return Math.max(p.minCharge, round2((opts.minutes || 1) * p.perMinute));
    default:
      return round2((opts.retailCost || 0) / (opts.markup || DEFAULT_MARKUP));
  }
}
