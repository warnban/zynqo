// ─── Каталог моделей и цены ─────────────────────────────────────────────────
//
// Единый источник правды для фронтенда (и в будущем — для бэкенда).
// Все цены — РОЗНИЧНЫЕ, в рублях, которые списываются с баланса пользователя.
// Себестоимость (costRub) приведена для справки — это цена AI Tunnel.
// Наценка ≈ 2× закрывает эквайринг, неудачные генерации, инфраструктуру и прибыль.

export type ModelKind = "chat" | "image" | "video" | "transcribe";

export type CategoryId = "chat" | "image" | "video" | "audio";

/** Базовое описание модели в каталоге. */
export type CatalogModel = {
  id: string;
  /** Имя модели в API AI Tunnel (model=...). */
  apiName: string;
  name: string;
  provider: string;
  kind: ModelKind;
  category: CategoryId;
  badge?: string;
  /** Короткое, понятное новичку описание. */
  description: string;
  /** Подсказка «для чего это», человеческим языком. */
  tagline: string;
  pricing: Pricing;
};

// ─── Модели ценообразования ─────────────────────────────────────────────────

/** Чат: списываем по факту токенов. Цены — за 1000 токенов. */
export type ChatPricing = {
  type: "tokens";
  inputPer1k: number;
  outputPer1k: number;
  /** Примерная стоимость «среднего» сообщения для показа новичку. */
  approxPerMessage: number;
};

/** Фото: фиксированная цена за изображение. */
export type ImagePricing = {
  type: "image";
  perImage: number;
};

/** Видео: цена зависит от длительности (за секунду) и/или пресета качества. */
export type VideoPricing = {
  type: "video";
  /** Цена за секунду (если применимо). */
  perSecond?: number;
  /** Фиксированные пресеты «качество → цена за ролик заданной длины». */
  presets?: { id: string; label: string; seconds: number; price: number }[];
};

/** Транскрибация: цена за минуту аудио. */
export type TranscribePricing = {
  type: "transcribe";
  perMinute: number;
  /** Минимальное списание за запрос. */
  minCharge: number;
};

export type Pricing = ChatPricing | ImagePricing | VideoPricing | TranscribePricing;

// ─── Каталог ────────────────────────────────────────────────────────────────

export const MODELS: CatalogModel[] = [
  {
    id: "gemini-flash-lite",
    apiName: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    provider: "Google",
    kind: "chat",
    category: "chat",
    badge: "Выгодно",
    description: "Быстрый умный чат для повседневных задач",
    tagline: "Задавайте вопросы, пишите тексты, получайте идеи — почти даром.",
    pricing: { type: "tokens", inputPer1k: 0.1, outputPer1k: 0.6, approxPerMessage: 0.25 },
  },
  {
    id: "gpt-5-5",
    apiName: "gpt-5.5",
    name: "GPT 5.5",
    provider: "OpenAI",
    kind: "chat",
    category: "chat",
    badge: "Топ",
    description: "Самый мощный чат для сложных задач и кода",
    tagline: "Когда нужен максимум интеллекта: анализ, код, длинные тексты.",
    pricing: { type: "tokens", inputPer1k: 2, outputPer1k: 12, approxPerMessage: 4 },
  },
  {
    id: "gemini-flash-image",
    apiName: "gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    provider: "Google",
    kind: "image",
    category: "image",
    badge: "Выгодно",
    description: "Быстрая генерация и редактирование картинок",
    tagline: "Опишите картинку словами — получите результат за секунды.",
    pricing: { type: "image", perImage: 12 },
  },
  {
    id: "gemini-pro-image",
    apiName: "gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    provider: "Google",
    kind: "image",
    category: "image",
    badge: "Качество",
    description: "Фото высокого качества и точное редактирование",
    tagline: "Когда важны детали и максимальное качество изображения.",
    pricing: { type: "image", perImage: 39 },
  },
  {
    id: "veo-3-1-lite",
    apiName: "veo-3.1-lite",
    name: "Veo 3.1 Lite",
    provider: "Google",
    kind: "video",
    category: "video",
    badge: "Со звуком",
    description: "Короткое видео по тексту с нативным звуком",
    tagline: "Опишите сцену — получите ролик 4–8 секунд со звуком.",
    pricing: {
      type: "video",
      presets: [
        { id: "720p-8s", label: "720p · 8 сек", seconds: 8, price: 79 },
        { id: "1080p-8s", label: "1080p · 8 сек", seconds: 8, price: 199 },
      ],
    },
  },
  {
    id: "kling-v3-pro",
    apiName: "kling-v3.0-pro",
    name: "Kling V3.0 Pro",
    provider: "KWAIVGI",
    kind: "video",
    category: "video",
    badge: "До 15 сек",
    description: "Реалистичное видео до 15 секунд, текст и фото → видео",
    tagline: "Длинные реалистичные ролики и оживление ваших фото.",
    pricing: { type: "video", perSecond: 35 },
  },
  {
    id: "voxtral-transcribe",
    apiName: "voxtral-mini-transcribe",
    name: "Voxtral Mini Transcribe",
    provider: "Mistral AI",
    kind: "transcribe",
    category: "audio",
    badge: "8 языков",
    description: "Расшифровка аудио в текст",
    tagline: "Превратите голосовое, подкаст или совещание в текст.",
    pricing: { type: "transcribe", perMinute: 1.5, minCharge: 1 },
  },
];

// ─── Категории ──────────────────────────────────────────────────────────────

export type Category = {
  id: CategoryId;
  label: string;
  /** Что пользователь хочет сделать — простыми словами. */
  hint: string;
};

export const CATEGORIES: Category[] = [
  { id: "chat", label: "Чат и тексты", hint: "Общение, вопросы, тексты" },
  { id: "image", label: "Картинки", hint: "Создать изображение по описанию" },
  { id: "video", label: "Видео", hint: "Короткие ролики по тексту или фото" },
  { id: "audio", label: "Аудио → текст", hint: "Расшифровать голос в текст" },
];

export function modelsByCategory(categoryId: CategoryId): CatalogModel[] {
  return MODELS.filter((m) => m.category === categoryId);
}

export function modelsByCategoryFrom(models: CatalogModel[], categoryId: CategoryId): CatalogModel[] {
  return models.filter((m) => m.category === categoryId);
}

export function getModel(id: string): CatalogModel | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Подставить розничные цены с бэкенда (зависят от наценки в админке). */
export function applyApiPricing(
  models: CatalogModel[],
  apiModels: { id: string; pricing: Pricing }[],
): CatalogModel[] {
  return models.map((m) => {
    const api = apiModels.find((x) => x.id === m.id);
    if (!api) return m;
    const p = api.pricing;
    if (m.pricing.type === "video" && p.type === "video" && m.pricing.presets && p.presets) {
      const presetsObj = p.presets as Record<string, { price: number }>;
      return {
        ...m,
        pricing: {
          ...m.pricing,
          presets: m.pricing.presets.map((preset) => ({
            ...preset,
            price: presetsObj[preset.id]?.price ?? preset.price,
          })),
          perSecond: p.perSecond ?? m.pricing.perSecond,
        },
      };
    }
    return { ...m, pricing: p };
  });
}

// ─── Тарифы пополнения ──────────────────────────────────────────────────────

export type TopUpPack = {
  id: string;
  name: string;
  /** Сколько платит пользователь, ₽. */
  pay: number;
  /** Сколько зачисляется на баланс, ₽. */
  credited: number;
  /** Бонус в процентах. */
  bonusPercent: number;
  popular?: boolean;
};

export const TOPUP_PACKS: TopUpPack[] = [
  { id: "start", name: "Старт", pay: 199, credited: 199, bonusPercent: 0 },
  { id: "base", name: "Базовый", pay: 499, credited: 549, bonusPercent: 10 },
  { id: "standard", name: "Стандарт", pay: 999, credited: 1149, bonusPercent: 15, popular: true },
  { id: "value", name: "Выгодный", pay: 2490, credited: 2990, bonusPercent: 20 },
  { id: "maxi", name: "Макси", pay: 4990, credited: 6240, bonusPercent: 25 },
];

/** Приветственный бонус новичку (после подтверждения телефона), ₽. */
export const WELCOME_BONUS_RUB = 30;

/** Бесплатные сообщения в день на самой дешёвой модели (удержание). */
export const DAILY_FREE_CHAT_MESSAGES = 10;

/** Минимальная сумма пополнения, ₽. */
export const MIN_TOPUP_RUB = 199;

// ─── Хелперы цен ────────────────────────────────────────────────────────────

/** Человекочитаемая «цена за …» для карточки модели. */
export function priceLabel(model: CatalogModel): string {
  const p = model.pricing;
  switch (p.type) {
    case "tokens":
      return `~${formatRub(p.approxPerMessage)} / сообщение`;
    case "image":
      return `${formatRub(p.perImage)} / фото`;
    case "video":
      if (p.presets?.length) return `от ${formatRub(p.presets[0].price)} / ролик`;
      if (p.perSecond) return `${formatRub(p.perSecond)} / сек`;
      return "";
    case "transcribe":
      return `${formatRub(p.perMinute)} / минута`;
  }
}

/** Стоимость конкретной видеогенерации по длительности/пресету. */
export function videoPrice(p: VideoPricing, opts: { seconds?: number; presetId?: string }): number {
  if (p.presets?.length) {
    const preset = p.presets.find((x) => x.id === opts.presetId) ?? p.presets[0];
    return preset.price;
  }
  if (p.perSecond) return Math.round(p.perSecond * (opts.seconds ?? 5));
  return 0;
}

/** Стоимость транскрибации по длительности аудио в минутах. */
export function transcribePrice(p: TranscribePricing, minutes: number): number {
  return Math.max(p.minCharge, Math.round(p.perMinute * minutes));
}

/** Форматирование рублей: 1234.5 → «1 234,5 ₽», 12 → «12 ₽». */
export function formatRub(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const str = Number.isInteger(rounded)
    ? rounded.toLocaleString("ru-RU")
    : rounded.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return `${str} ₽`;
}
