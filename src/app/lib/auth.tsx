import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken, type ApiUser, type LedgerEntry } from "./api";

type AuthState = {
  user: ApiUser | null;
  loading: boolean;
  ledger: LedgerEntry[];
  /** Ошибка возврата от VK (если вход через VK не удался). */
  vkError: string | null;
  login: (email: string, password: string) => Promise<void>;
  registerRequest: (email: string, password: string, name?: string) => Promise<{ ok: true; email: string; smtpConfigured: boolean }>;
  registerVerify: (email: string, code: string) => Promise<void>;
  logout: () => void;
  /** Обновить баланс в UI после генерации/пополнения. */
  setBalance: (b: number) => void;
  /** Перечитать баланс и историю операций с сервера. */
  reloadBalance: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

/** Считать ?token= / ?vk_error= из URL (возврат после входа через VK) и очистить адрес. */
function consumeUrlParams(): { vkError: string | null } {
  if (typeof window === "undefined") return { vkError: null };
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const vkError = params.get("vk_error");
  if (token) setToken(token);
  if (token || vkError) {
    window.history.replaceState({}, "", window.location.pathname);
  }
  return { vkError };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [vkError, setVkError] = useState<string | null>(null);

  useEffect(() => {
    const { vkError } = consumeUrlParams();
    if (vkError) setVkError(vkError);
    (async () => {
      if (!getToken()) { setLoading(false); return; }
      try {
        const { user } = await api.me();
        setUser(user);
        const b = await api.balance();
        setUser((u) => (u ? { ...u, balance: b.balance } : u));
        setLedger(b.ledger);
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const afterAuth = async (token: string, u: ApiUser) => {
    setToken(token);
    setUser(u);
    try {
      const b = await api.balance();
      setUser({ ...u, balance: b.balance });
      setLedger(b.ledger);
    } catch { /* ignore */ }
  };

  const login = async (email: string, password: string) => {
    const { token, user } = await api.login({ email, password });
    await afterAuth(token, user);
  };
  const registerRequest = async (email: string, password: string, name?: string) => {
    return api.registerRequest({ email, password, name });
  };
  const registerVerify = async (email: string, code: string) => {
    const { token, user } = await api.registerVerify({ email, code });
    await afterAuth(token, user);
  };
  const logout = () => { setToken(null); setUser(null); setLedger([]); };

  const setBalance = (b: number) => setUser((u) => (u ? { ...u, balance: b } : u));
  const reloadBalance = async () => {
    const b = await api.balance();
    setUser((u) => (u ? { ...u, balance: b.balance } : u));
    setLedger(b.ledger);
  };

  return (
    <Ctx.Provider value={{ user, loading, ledger, vkError, login, registerRequest, registerVerify, logout, setBalance, reloadBalance }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth должен быть внутри AuthProvider");
  return ctx;
}
