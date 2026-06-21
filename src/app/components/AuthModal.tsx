import { useEffect, useRef, useState } from "react";
import { Sparkles, Mail, Lock, User, Loader2, X, ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { WELCOME_BONUS_RUB, formatRub } from "../lib/catalog";

function VkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.16 18.06c-6.34 0-9.96-4.35-10.11-11.58h3.18c.1 5.31 2.44 7.56 4.3 8.02V6.48h2.99v4.58c1.83-.2 3.76-2.29 4.41-4.58h2.99c-.5 2.82-2.59 4.91-4.07 5.77 1.48.7 3.86 2.52 4.77 5.81h-3.29c-.71-2.21-2.48-3.92-4.81-4.16v4.16h-.36z"/>
    </svg>
  );
}

type Mode = "login" | "register" | "verify";

export function AuthModal({
  onClose,
  onSuccess,
  initialMode = "login",
  hint,
  errorMessage,
}: {
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: "login" | "register";
  hint?: string;
  errorMessage?: string | null;
}) {
  const { login, registerRequest, registerVerify } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vkEnabled, setVkEnabled] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.config().then((c) => setVkEnabled(c.vkEnabled)).catch(() => {}); }, []);
  useEffect(() => { if (errorMessage) setError(errorMessage); }, [errorMessage]);
  useEffect(() => { if (mode === "verify") codeRef.current?.focus(); }, [mode]);

  const finish = () => { onSuccess?.(); onClose(); };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      finish();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await registerRequest(email, password, name);
      setMode("verify");
      setCode("");
      setInfo(
        res.smtpConfigured
          ? `Код отправлен на ${res.email}. Проверьте почту (и папку «Спам»).`
          : `Код отправлен на ${res.email}. (SMTP не настроен — смотрите консоль сервера.)`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await registerVerify(email, code);
      finish();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      await registerRequest(email, password, name);
      setInfo("Новый код отправлен.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить код");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aneuro-overlay fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="aneuro-pop w-full max-w-md bg-card border border-border rounded-3xl p-6 sm:p-7 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <X size={18} />
        </button>

        <div className="flex flex-col items-center mb-6 pr-8">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mb-3">
            <Sparkles size={22} className="text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">zynqo</h2>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            {mode === "verify" ? "Подтверждение e-mail" : hint || "Войдите или зарегистрируйтесь, чтобы продолжить"}
          </p>
        </div>

        {mode !== "verify" && (
          <div className="flex p-1 rounded-2xl bg-muted mb-5">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setInfo(null); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>
        )}

        {mode === "login" && (
          <form onSubmit={submitLogin} className="space-y-4">
            <Field icon={<Mail size={16} />} placeholder="E-mail" type="email" value={email} onChange={setEmail} />
            <Field icon={<Lock size={16} />} placeholder="Пароль" type="password" value={password} onChange={setPassword} />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <button type="submit" disabled={busy} className="w-full py-3.5 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-70 flex items-center justify-center gap-2">
              {busy && <Loader2 size={16} className="animate-spin" />} Войти
            </button>
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={submitRegister} className="space-y-4">
            <Field icon={<User size={16} />} placeholder="Как вас зовут" value={name} onChange={setName} />
            <Field icon={<Mail size={16} />} placeholder="E-mail" type="email" value={email} onChange={setEmail} />
            <Field icon={<Lock size={16} />} placeholder="Пароль (мин. 6 символов)" type="password" value={password} onChange={setPassword} />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <button type="submit" disabled={busy} className="w-full py-3.5 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-70 flex items-center justify-center gap-2">
              {busy && <Loader2 size={16} className="animate-spin" />} Получить код на почту
            </button>
            <p className="text-center text-xs text-muted-foreground">
              При регистрации дарим <span className="text-primary font-semibold">{formatRub(WELCOME_BONUS_RUB)}</span> на баланс
            </p>
          </form>
        )}

        {mode === "verify" && (
          <form onSubmit={submitVerify} className="space-y-4">
            <button type="button" onClick={() => { setMode("register"); setError(null); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={14} /> Изменить данные
            </button>
            {info && <p className="text-sm text-muted-foreground text-center">{info}</p>}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Код из письма</label>
              <input
                ref={codeRef}
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full bg-input-background border border-border rounded-2xl px-4 py-3.5 text-center text-2xl font-bold tracking-[0.35em] text-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
              />
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <button type="submit" disabled={busy || code.length !== 6} className="w-full py-3.5 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-70 flex items-center justify-center gap-2">
              {busy && <Loader2 size={16} className="animate-spin" />} Подтвердить и создать аккаунт
            </button>
            <button type="button" onClick={resendCode} disabled={busy} className="w-full py-2 text-sm font-medium text-primary hover:underline disabled:opacity-50">
              Отправить код повторно
            </button>
          </form>
        )}

        {mode !== "verify" && vkEnabled && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">или</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <a href="/api/auth/vk/start" className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-[#0077FF] hover:bg-[#0a6fe6] flex items-center justify-center gap-2">
              <VkIcon /> Войти через VK
            </a>
          </>
        )}

        <p className="text-center text-[11px] text-muted-foreground/70 mt-5">
          Продолжая, вы соглашаетесь с пользовательским соглашением и политикой конфиденциальности
        </p>
      </div>
    </div>
  );
}

function Field({
  icon, placeholder, value, onChange, type = "text",
}: {
  icon: React.ReactNode; placeholder: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-input-background border border-border rounded-2xl pl-11 pr-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all"
      />
    </div>
  );
}
