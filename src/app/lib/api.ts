// Клиент к бэкенду aneuro. Токен хранится в localStorage.

const TOKEN_KEY = "aneuro-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export type ApiUser = {
  id: string; email: string; name?: string; role: "user" | "admin"; balance: number; createdAt: number;
};
export type LedgerEntry = {
  id: string; amount: number; balance_after: number; kind: string; title: string; created_at: number;
};

async function request<T>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api${path}`, { method: opts.method || "GET", headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Ошибка ${res.status}`, res.status, data);
  return data as T;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const api = {
  config: () => request<{ vkEnabled: boolean }>("/config"),
  catalog: () => request<{ markup: number; models: { id: string; pricing: import("./catalog").Pricing }[] }>("/catalog"),
  registerRequest: (body: { email: string; password: string; name?: string }) =>
    request<{ ok: true; email: string; smtpConfigured: boolean }>("/auth/register/request", { method: "POST", body }),
  registerVerify: (body: { email: string; code: string }) =>
    request<{ token: string; user: ApiUser }>("/auth/register/verify", { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: ApiUser }>("/auth/login", { method: "POST", body }),
  me: () => request<{ user: ApiUser }>("/auth/me"),

  balance: () => request<{ balance: number; ledger: LedgerEntry[] }>("/balance"),
  topup: (body: { packId?: string; amount?: number }) =>
    request<{ balance: number; credited: number }>("/balance/topup", { method: "POST", body }),

  chat: (body: { modelId: string; messages: ChatMessage[] }) =>
    request<{ reply: string; cost: number; balance: number }>("/generate/chat", { method: "POST", body }),
  image: (body: { modelId: string; prompt: string; size?: string; referenceImage?: string }) =>
    request<{ url: string; cost: number; balance: number }>("/generate/image", { method: "POST", body }),
  video: (body: { modelId: string; prompt: string; presetId?: string; seconds?: number }) =>
    request<{ url: string; note?: string; cost: number; balance: number }>("/generate/video", { method: "POST", body }),
  transcribe: (form: FormData) =>
    request<{ text: string; cost: number; balance: number }>("/generate/transcribe", { method: "POST", form }),
  generations: () => request<{ generations: GenerationRow[] }>("/generations"),

  support: {
    unread: () => request<{ unread: number }>("/support/unread"),
    threads: () => request<{ threads: SupportThread[] }>("/support/threads"),
    createThread: (body: string) => request<{ thread: SupportThread; messages: SupportMessage[] }>("/support/threads", { method: "POST", body: { body } }),
    thread: (id: string) => request<{ thread: SupportThread; messages: SupportMessage[] }>(`/support/threads/${id}`),
    sendMessage: (id: string, body: string) => request<{ messages: SupportMessage[] }>(`/support/threads/${id}/messages`, { method: "POST", body: { body } }),
  },

  admin: {
    stats: () => request<AdminStats>("/admin/stats"),
    settings: () => request<{ markup: number }>("/admin/settings"),
    setSettings: (body: { markup: number }) =>
      request<{ markup: number; models: { id: string; pricing: import("./catalog").Pricing }[] }>("/admin/settings", { method: "POST", body }),
    users: () => request<{ users: AdminUser[] }>("/admin/users"),
    generations: () => request<{ generations: GenerationRow[] }>("/admin/generations"),
    logs: () => request<{ logs: LogRow[] }>("/admin/logs"),
    credit: (body: { userId: string; amount: number; note?: string }) =>
      request<{ balance: number }>("/admin/credit", { method: "POST", body }),
    supportUnread: () => request<{ unread: number }>("/admin/support/unread"),
    supportThreads: () => request<{ threads: AdminSupportThread[] }>("/admin/support/threads"),
    supportThread: (id: string) => request<{ thread: AdminSupportThread; user: { email: string; name?: string } | null; messages: SupportMessage[] }>(`/admin/support/threads/${id}`),
    supportReply: (id: string, body: string) => request<{ messages: SupportMessage[] }>(`/admin/support/threads/${id}/messages`, { method: "POST", body: { body } }),
    supportSetStatus: (id: string, status: "open" | "closed") => request<{ thread: AdminSupportThread }>(`/admin/support/threads/${id}`, { method: "PATCH", body: { status } }),
  },
};

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };
export type ChatMessage = { role: "user" | "assistant"; content: string | ChatPart[] };

export type SupportThread = {
  id: string; status: string; preview?: string; unread_user: number;
  created_at: number; updated_at: number;
};
export type AdminSupportThread = SupportThread & {
  user_id: string; user_email?: string; user_name?: string; unread_admin: number;
};
export type SupportMessage = {
  id: string; thread_id: string; role: "user" | "admin"; body: string; created_at: number;
};

export type GenerationRow = {
  id: string; user_id: string; user_email?: string; model_id: string; model_name: string;
  kind: string; status: string; cost: number; prompt?: string; result?: string; error?: string;
  duration_ms?: number; created_at: number;
};
export type AdminUser = {
  id: string; email: string; name?: string; role: string; balance: number; phone?: string; last_ip?: string; created_at: number;
};
export type LogRow = {
  id: string; user_id?: string; user_email?: string; method: string; path: string; status: number;
  ip?: string; ua?: string; ms?: number; created_at: number;
};
export type AdminStats = {
  users: number; generations: number; revenue: number; spent: number; totalBalances: number;
  cashIn: number; apiCost: number; grossMargin: number; freeCredits: number;
  adminGrants: number; welcomeBonuses: number; topupBonuses: number; profit: number;
  markup: number;
};
