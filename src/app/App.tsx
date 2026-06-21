import { useEffect, useMemo, useState } from "react";
import {
  Sparkles, MessageSquare, Image as ImageIcon, Video, Mic,
  Sun, Moon, Wallet, Plus, X, Check, ChevronRight, ShieldCheck,
  LogOut, Shield, Loader2, Home, Menu, Info, LogIn,
} from "lucide-react";
import {
  CATEGORIES, MODELS, type Category, type CategoryId, type CatalogModel,
  modelsByCategory, modelsByCategoryFrom, priceLabel, formatRub,
  TOPUP_PACKS, type TopUpPack, MIN_TOPUP_RUB,
} from "./lib/catalog";
import { useTheme } from "./lib/useTheme";
import { useAuth } from "./lib/auth";
import { api, ApiError } from "./lib/api";
import { GenerationView } from "./components/GenerationViews";
import { AdminPanel } from "./components/AdminPanel";
import { HomeView } from "./components/HomeView";
import { CatalogProvider, useCatalog } from "./lib/catalog-context";
import { SupportWidget } from "./components/SupportWidget";
import { AuthModal } from "./components/AuthModal";
import { AboutModal } from "./components/AboutModal";

const CAT_ICON: Record<CategoryId, React.ReactNode> = {
  chat: <MessageSquare size={16} />,
  image: <ImageIcon size={16} />,
  video: <Video size={16} />,
  audio: <Mic size={16} />,
};

type View = "home" | "studio" | "admin";
type Pending = { amount: number; title: string; resolve: (ok: boolean) => void };

export default function App() {
  const { loading, vkError } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    if (vkError) {
      setAuthMode("login");
      setAuthOpen(true);
    }
  }, [vkError]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <CatalogProvider>
      <Workspace
        onNeedAuth={(mode = "login") => { setAuthMode(mode); setAuthOpen(true); }}
        onAbout={() => setAboutOpen(true)}
      />
      {authOpen && (
        <AuthModal
          initialMode={authMode}
          hint={vkError ? "Вход через VK не удался" : undefined}
          errorMessage={vkError}
          onClose={() => setAuthOpen(false)}
        />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </CatalogProvider>
  );
}

function Workspace({ onNeedAuth, onAbout }: { onNeedAuth: (mode?: "login" | "register") => void; onAbout: () => void }) {
  const { theme, toggle } = useTheme();
  const { user, logout, setBalance } = useAuth();
  const { models } = useCatalog();
  const [view, setView] = useState<View>("home");
  const [activeId, setActiveId] = useState(MODELS[0].id);
  const openModel = (id: string) => { setActiveId(id); setView("studio"); };
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const go = (fn: () => void) => { fn(); setNavOpen(false); };

  const ensureAuth = (): boolean => {
    if (user) return true;
    onNeedAuth("login");
    return false;
  };

  const openTopUp = () => {
    if (!ensureAuth()) return;
    setTopUpOpen(true);
  };

  const active = useMemo(() => models.find((m) => m.id === activeId) ?? models[0]!, [activeId, models]);
  const balance = user?.balance ?? 0;

  const confirm = (amount: number, title: string) => {
    if (!ensureAuth()) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => setPending({ amount, title, resolve }));
  };

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 3000); };

  const handlePick = async (pack: TopUpPack) => {
    try {
      const res = pack.id === "custom"
        ? await api.topup({ amount: pack.pay })
        : await api.topup({ packId: pack.id });
      setBalance(res.balance);
      setTopUpOpen(false);
      showFlash(`Баланс пополнен на ${formatRub(res.credited)}`);
    } catch (e) {
      showFlash(e instanceof ApiError ? e.message : "Ошибка пополнения");
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>
      {/* Затемнение под мобильный drawer */}
      {navOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* Сайдбар */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transform transition-transform duration-200 lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button onClick={() => go(() => setView("home"))} className="p-4 flex items-center gap-3 border-b border-sidebar-border text-left hover:bg-sidebar-accent/50 transition-colors">
          <div className="w-9 h-9 rounded-2xl bg-primary flex items-center justify-center shrink-0">
            <Sparkles size={17} className="text-primary-foreground" />
          </div>
          <div>
            <p className="text-base font-bold text-foreground leading-none">zynqo</p>
            <p className="text-[11px] text-muted-foreground mt-1">Нейросети по-русски</p>
          </div>
        </button>

        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          <button
            onClick={() => go(() => setView("home"))}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              view === "home" ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            }`}
          >
            <Home size={16} /> Главная
          </button>
          {CATEGORIES.map((cat) => (
            <CategoryGroup key={cat.id} cat={cat} models={models} activeId={view === "studio" ? activeId : ""} onSelect={(id) => go(() => { setActiveId(id); setView("studio"); })} />
          ))}
        </nav>

        {user?.role === "admin" && (
          <div className="px-3 pb-2">
            <button
              onClick={() => go(() => setView("admin"))}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                view === "admin" ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              }`}
            >
              <Shield size={16} /> Админ-панель
            </button>
          </div>
        )}

        <div className="p-3 border-t border-sidebar-border">
          <button onClick={() => go(openTopUp)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-all flex items-center justify-center gap-1.5">
            <Plus size={15} /> {user ? "Пополнить баланс" : "Войти и пополнить"}
          </button>
        </div>
      </aside>

      {/* Основная область */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-1.5 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-4 border-b border-border">
          <button onClick={() => setNavOpen(true)} className="lg:hidden h-9 w-9 shrink-0 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all" title="Меню">
            <Menu size={18} />
          </button>

          <div className="min-w-0 flex-1">
            {view === "admin" ? (
              <>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Shield size={15} className="text-primary shrink-0" />
                  <h1 className="text-sm sm:text-base font-bold text-foreground truncate">Админ-панель</h1>
                </div>
                <p className="hidden sm:block text-xs text-muted-foreground truncate">Пользователи, балансы, генерации и логи</p>
              </>
            ) : view === "home" ? (
              <>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Home size={15} className="text-primary shrink-0" />
                  <h1 className="text-sm sm:text-base font-bold text-foreground truncate">Главная</h1>
                </div>
                <p className="hidden sm:block text-xs text-muted-foreground truncate">Выберите нейросеть для работы</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 min-w-0">
                  <h1 className="text-sm sm:text-base font-bold text-foreground truncate">{active.name}</h1>
                  {active.badge && <span className="hidden sm:inline px-2 py-0.5 rounded-lg text-[10px] font-bold bg-primary/12 text-primary shrink-0">{active.badge}</span>}
                </div>
                <p className="hidden sm:block text-xs text-muted-foreground truncate">{active.tagline}</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              onClick={onAbout}
              className="hidden sm:flex h-9 items-center gap-1.5 px-3 rounded-xl bg-card border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
            >
              <Info size={15} /> О сервисе
            </button>

            {view === "studio" && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-secondary text-xs sm:text-sm max-w-[140px] lg:max-w-none">
                <span className="text-muted-foreground shrink-0">Цена:</span>
                <span className="font-semibold text-foreground truncate">{priceLabel(active)}</span>
              </div>
            )}

            <button
              onClick={openTopUp}
              title={user ? `Баланс: ${formatRub(balance)}` : "Войти"}
              className="h-9 flex items-center gap-1 px-2 sm:px-3 rounded-xl bg-card border border-border text-sm font-semibold text-foreground hover:border-primary/50 transition-all shrink-0"
            >
              <Wallet size={15} className="text-primary shrink-0" />
              {user ? (
                <span className="hidden sm:inline tabular-nums text-sm whitespace-nowrap">{formatRub(balance)}</span>
              ) : (
                <span className="hidden sm:inline text-sm whitespace-nowrap">Войти</span>
              )}
            </button>

            <button onClick={onAbout} className="sm:hidden h-9 w-9 shrink-0 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all" title="О сервисе">
              <Info size={16} />
            </button>

            <button onClick={toggle} className="hidden sm:flex h-9 w-9 shrink-0 rounded-xl bg-card border border-border items-center justify-center text-muted-foreground hover:text-foreground transition-all" title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {user ? (
            <div className="relative shrink-0">
              <button onClick={() => setMenuOpen((o) => !o)} className="h-9 w-9 sm:w-auto sm:px-2.5 rounded-xl bg-card border border-border flex items-center justify-center sm:justify-start gap-2 text-sm font-semibold text-foreground hover:border-primary/50 transition-all">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  {(user.name || user.email)[0].toUpperCase()}
                </span>
                <span className="hidden md:inline max-w-32 truncate">{user.name || user.email}</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-popover border border-border rounded-2xl shadow-xl p-2 z-50">
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold text-foreground truncate">{user.name || "Пользователь"}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      <p className="text-xs text-muted-foreground mt-1 sm:hidden">Баланс: {formatRub(balance)}</p>
                    </div>
                    <div className="h-px bg-border my-1" />
                    <button onClick={() => { setMenuOpen(false); onAbout(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors">
                      <Info size={15} /> О сервисе
                    </button>
                    <button onClick={() => { setMenuOpen(false); toggle(); }} className="sm:hidden w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors">
                      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                      {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
                    </button>
                    <button onClick={() => { setMenuOpen(false); openTopUp(); }} className="sm:hidden w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors">
                      <Wallet size={15} /> Пополнить баланс
                    </button>
                    <div className="h-px bg-border my-1 sm:hidden" />
                    <button onClick={() => { setMenuOpen(false); logout(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
                      <LogOut size={15} /> Выйти
                    </button>
                  </div>
                </>
              )}
            </div>
            ) : (
              <button
                onClick={() => onNeedAuth("login")}
                className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 hover:opacity-90 transition-all shrink-0"
              >
                <LogIn size={15} /> <span className="hidden xs:inline sm:inline">Войти</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {view === "admin" ? (
            user?.role === "admin" ? <AdminPanel /> : (
              <div className="max-w-md mx-auto text-center py-16">
                <p className="text-muted-foreground mb-4">Доступ только для администраторов</p>
                <button onClick={() => onNeedAuth("login")} className="px-5 py-3 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary">Войти</button>
              </div>
            )
          ) : view === "home" ? (
            <HomeView models={models} balance={balance} isLoggedIn={!!user} onOpen={openModel} onTopUp={openTopUp} onAbout={onAbout} />
          ) : (
            <GenerationView
              key={active.id}
              model={active}
              balance={balance}
              onBalance={setBalance}
              onNeedTopUp={openTopUp}
              onNeedAuth={() => ensureAuth()}
              confirm={confirm}
            />
          )}
        </main>
      </div>

      {flash && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-foreground text-background text-sm font-medium shadow-2xl">
          <Check size={15} /> {flash}
        </div>
      )}

      {topUpOpen && <TopUpModal onClose={() => setTopUpOpen(false)} onPick={handlePick} />}
      {pending && (
        <ConfirmSpend
          pending={pending} balance={balance}
          onClose={() => { pending.resolve(false); setPending(null); }}
          onConfirm={() => { pending.resolve(true); setPending(null); }}
          onTopUp={() => { pending.resolve(false); setPending(null); openTopUp(); }}
        />
      )}

      {user && user.role !== "admin" && view !== "admin" && <SupportWidget />}
    </div>
  );
}

// ─── Сайдбар ────────────────────────────────────────────────────────────────────

function CategoryGroup({ cat, models, activeId, onSelect }: { cat: Category; models: CatalogModel[]; activeId: string; onSelect: (id: string) => void }) {
  const items = modelsByCategoryFrom(models, cat.id);
  if (!items.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 px-2 mb-2 text-muted-foreground">
        {CAT_ICON[cat.id]}<span className="text-xs font-bold uppercase tracking-wider">{cat.label}</span>
      </div>
      <div className="space-y-1">
        {items.map((m) => (
          <ModelButton key={m.id} model={m} active={m.id === activeId} onClick={() => onSelect(m.id)} />
        ))}
      </div>
    </div>
  );
}

function ModelButton({ model, active, onClick }: { model: CatalogModel; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all ${
      active ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
    }`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold truncate">{model.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{priceLabel(model)}</p>
      </div>
      {active && <ChevronRight size={14} className="text-primary shrink-0" />}
    </button>
  );
}

// ─── Подтверждение списания ───────────────────────────────────────────────────

function ConfirmSpend({ pending, balance, onClose, onConfirm, onTopUp }: {
  pending: Pending; balance: number; onClose: () => void; onConfirm: () => void; onTopUp: () => void;
}) {
  const enough = balance >= pending.amount;
  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 shadow-2xl">
        <p className="text-base font-bold text-foreground mb-1">{pending.title}</p>
        <p className="text-sm text-muted-foreground mb-5">Подтвердите генерацию</p>
        <div className="rounded-2xl bg-muted/60 p-4 space-y-2.5 mb-5">
          <Row label="Стоимость" value={formatRub(pending.amount)} strong />
          <Row label="Ваш баланс" value={formatRub(balance)} />
          <div className="h-px bg-border" />
          <Row label="Останется" value={enough ? formatRub(balance - pending.amount) : "—"} danger={!enough} />
        </div>
        {enough ? (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-secondary text-foreground hover:bg-secondary/70 transition-all">Отмена</button>
            <button onClick={onConfirm} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-all">Подтвердить</button>
          </div>
        ) : (
          <>
            <p className="text-sm text-destructive mb-3 text-center">Не хватает {formatRub(pending.amount - balance)}</p>
            <button onClick={onTopUp} className="w-full py-3 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-all flex items-center justify-center gap-2">
              <Wallet size={16} /> Пополнить баланс
            </button>
          </>
        )}
      </div>
    </Overlay>
  );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm tabular-nums ${danger ? "text-destructive font-semibold" : strong ? "text-foreground font-bold" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

// ─── Пополнение ───────────────────────────────────────────────────────────────

function TopUpModal({ onClose, onPick }: { onClose: () => void; onPick: (pack: TopUpPack) => void }) {
  const [custom, setCustom] = useState("");
  const customN = Number(custom);
  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <p className="text-lg font-bold text-foreground">Пополнить баланс</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Чем больше пакет — тем больше бонус. Без подписки.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TOPUP_PACKS.map((p) => (
            <button key={p.id} onClick={() => onPick(p)} className={`relative text-left rounded-2xl border p-4 transition-all hover:border-primary/60 hover:bg-primary/5 ${p.popular ? "border-primary/60 bg-primary/5" : "border-border"}`}>
              {p.popular && <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-primary-foreground bg-primary">Популярный</span>}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{p.name}</p>
                {p.bonusPercent > 0 && <span className="text-xs font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-md">+{p.bonusPercent}%</span>}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Вы платите</p>
              <p className="text-2xl font-bold text-foreground leading-tight">{formatRub(p.pay)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                На баланс: <span className="font-semibold text-foreground">{formatRub(p.credited)}</span>
              </p>
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-2xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Своя сумма</p>
          <div className="flex gap-2">
            <input type="number" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={`от ${MIN_TOPUP_RUB}`}
              className="flex-1 bg-input-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            <button disabled={!customN || customN < MIN_TOPUP_RUB}
              onClick={() => onPick({ id: "custom", name: "Пополнение", pay: customN, credited: customN, bonusPercent: 0 })}
              className="px-5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary disabled:opacity-40 hover:opacity-90 transition-all">Пополнить</button>
          </div>
          {custom !== "" && customN < MIN_TOPUP_RUB && <p className="text-xs text-destructive mt-1.5">Минимум {formatRub(MIN_TOPUP_RUB)}</p>}
        </div>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-4">
          <ShieldCheck size={13} /> Оплата картой МИР/Visa, СБП и криптой
        </p>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="aneuro-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="aneuro-pop w-full flex justify-center" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
