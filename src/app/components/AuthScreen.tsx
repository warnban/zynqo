import { useEffect, useState } from "react";
import { Sparkles, Mail, Lock, User, Loader2, Sun, Moon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/useTheme";
import { api, ApiError } from "../lib/api";
import { WELCOME_BONUS_RUB, formatRub } from "../lib/catalog";

function VkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.16 18.06c-6.34 0-9.96-4.35-10.11-11.58h3.18c.1 5.31 2.44 7.56 4.3 8.02V6.48h2.99v4.58c1.83-.2 3.76-2.29 4.41-4.58h2.99c-.5 2.82-2.59 4.91-4.07 5.77 1.48.7 3.86 2.52 4.77 5.81h-3.29c-.71-2.21-2.48-3.92-4.81-4.16v4.16h-.36z"/>
    </svg>
  );
}

export function AuthScreen() {
  const { login, register, vkError } = useAuth();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(vkError);
  const [busy, setBusy] = useState(false);
  const [vkEnabled, setVkEnabled] = useState(false);

  useEffect(() => { api.config().then((c) => setVkEnabled(c.vkEnabled)).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative">
      <button
        onClick={toggle}
        className="absolute top-5 right-5 h-10 w-10 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        title="Сменить тему"
      >
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>

      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg" style={{ boxShadow: "0 12px 32px -12px var(--primary)" }}>
            <Sparkles size={26} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">aneuro</h1>
          <p className="text-sm text-muted-foreground mt-1">Нейросети по-русски. Оплата в рублях.</p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-7 shadow-xl">
          <div className="flex p-1 rounded-2xl bg-muted mb-6">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <Field icon={<User size={16} />} placeholder="Как вас зовут" value={name} onChange={setName} />
            )}
            <Field icon={<Mail size={16} />} placeholder="E-mail" type="email" value={email} onChange={setEmail} />
            <Field icon={<Lock size={16} />} placeholder="Пароль" type="password" value={password} onChange={setPassword} />

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-all active:scale-[0.99] disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {mode === "login" ? "Войти" : "Создать аккаунт"}
            </button>
          </form>

          {vkEnabled && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">или</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <a
                href="/api/auth/vk/start"
                className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-[#0077FF] hover:bg-[#0a6fe6] transition-all active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <VkIcon /> Войти через VK
              </a>
            </>
          )}

          {mode === "register" && (
            <p className="text-center text-xs text-muted-foreground mt-4">
              При регистрации дарим <span className="text-primary font-semibold">{formatRub(WELCOME_BONUS_RUB)}</span> на баланс
            </p>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground/70 mt-6">
          Продолжая, вы соглашаетесь с условиями использования
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
