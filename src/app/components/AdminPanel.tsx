import { useEffect, useState } from "react";
import {
  Users, Activity, ScrollText, LayoutDashboard, Plus, X, RefreshCw,
  TrendingUp, TrendingDown, Wallet, Loader2, PiggyBank, Gift, Server, Settings2, Headphones,
} from "lucide-react";
import {
  api, ApiError, type AdminStats, type AdminUser, type GenerationRow, type LogRow,
} from "../lib/api";
import { formatRub, priceLabel, type CatalogModel } from "../lib/catalog";
import { useCatalog } from "../lib/catalog-context";
import { AdminSupportTab } from "./AdminSupportTab";

type Tab = "overview" | "settings" | "support" | "users" | "generations" | "logs";

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("overview");
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    api.admin.supportUnread().then((r) => setSupportUnread(r.unread)).catch(() => {});
    const t = setInterval(() => {
      api.admin.supportUnread().then((r) => setSupportUnread(r.unread)).catch(() => {});
    }, 20000);
    return () => clearInterval(t);
  }, [tab]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview", label: "Обзор", icon: <LayoutDashboard size={15} /> },
    { id: "settings", label: "Наценка", icon: <Settings2 size={15} /> },
    { id: "support", label: "Поддержка", icon: <Headphones size={15} />, badge: supportUnread },
    { id: "users", label: "Пользователи", icon: <Users size={15} /> },
    { id: "generations", label: "Генерации", icon: <Activity size={15} /> },
    { id: "logs", label: "Логи", icon: <ScrollText size={15} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon} {t.label}
            {t.badge ? <span className="min-w-[1.1rem] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">{t.badge > 9 ? "9+" : t.badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview />}
      {tab === "settings" && <SettingsTab />}
      {tab === "support" && <AdminSupportTab />}
      {tab === "users" && <UsersTab />}
      {tab === "generations" && <GenerationsTab />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

// ─── Обзор ─────────────────────────────────────────────────────────────────────

function Overview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => { api.admin.stats().then(setStats).catch(() => {}); }, []);
  if (!stats) return <Loading />;

  const profitPositive = stats.profit >= 0;

  const mainCards = [
    {
      label: "Прибыль",
      value: formatRub(stats.profit),
      hint: "Поступления − себестоимость API − бесплатные начисления",
      icon: <PiggyBank size={18} />,
      accent: profitPositive ? "text-emerald-500" : "text-destructive",
      highlight: true,
    },
    { label: "Поступления (наличные)", value: formatRub(stats.cashIn), icon: <TrendingUp size={18} />, accent: "text-emerald-500" },
    { label: "Себестоимость API", value: formatRub(stats.apiCost), icon: <Server size={18} />, accent: "text-amber-500" },
    { label: "Маржа на генерациях", value: formatRub(stats.grossMargin), hint: "Списано с клиентов − себестоимость", icon: <TrendingUp size={18} /> },
    { label: "Бесплатные начисления", value: formatRub(stats.freeCredits), hint: "Админ + бонусы + % к пополнению", icon: <Gift size={18} />, accent: "text-destructive" },
    { label: "Пользователей", value: String(stats.users), icon: <Users size={18} /> },
    { label: "Наценка", value: `×${stats.markup}`, hint: "Множитель к себестоимости AI Tunnel", icon: <Settings2 size={18} /> },
    { label: "Генераций", value: String(stats.generations), icon: <Activity size={18} /> },
    { label: "Списано клиентами", value: formatRub(stats.spent), icon: <TrendingDown size={18} /> },
    { label: "Сумма балансов", value: formatRub(stats.totalBalances), hint: "Обязательства перед пользователями", icon: <Wallet size={18} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {mainCards.map((c) => (
          <div
            key={c.label}
            className={`bg-card border rounded-2xl p-5 shadow-sm ${
              c.highlight ? (profitPositive ? "border-emerald-500/40" : "border-destructive/40") : "border-border"
            }`}
          >
            <div className={`w-10 h-10 rounded-xl bg-primary/12 flex items-center justify-center mb-3 ${c.accent || "text-primary"}`}>
              {c.icon}
            </div>
            <p className={`text-2xl font-bold tabular-nums ${c.highlight ? (profitPositive ? "text-emerald-500" : "text-destructive") : "text-foreground"}`}>
              {c.value}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">{c.label}</p>
            {c.hint && <p className="text-xs text-muted-foreground/80 mt-1.5 leading-relaxed">{c.hint}</p>}
          </div>
        ))}
      </div>

      {stats.freeCredits > 0 && (
        <div className="bg-muted/40 border border-border rounded-2xl p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Из чего складываются бесплатные начисления</p>
          <p>Начисления админом: <span className="font-semibold text-foreground">{formatRub(stats.adminGrants)}</span></p>
          <p>Приветственные бонусы: <span className="font-semibold text-foreground">{formatRub(stats.welcomeBonuses)}</span></p>
          <p>Бонус к пополнению (% сверх оплаты): <span className="font-semibold text-foreground">{formatRub(stats.topupBonuses)}</span></p>
        </div>
      )}
    </div>
  );
}

// ─── Наценка ───────────────────────────────────────────────────────────────────

function SettingsTab() {
  const { models, markup: currentMarkup, reload } = useCatalog();
  const [draft, setDraft] = useState(String(currentMarkup));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(String(currentMarkup)); }, [currentMarkup]);

  const draftNum = Number(draft);
  const valid = Number.isFinite(draftNum) && draftNum >= 1 && draftNum <= 10;

  const previewModels = models.slice(0, 5);

  const estimatePrice = (m: CatalogModel) => {
    if (!valid || currentMarkup <= 0) return priceLabel(m);
    const scale = draftNum / currentMarkup;
    const p = m.pricing;
    if (p.type === "tokens") return `~${formatRub(Math.max(0.01, p.approxPerMessage * scale))} / сообщение`;
    if (p.type === "image") return `${formatRub(p.perImage * scale)} / фото`;
    if (p.type === "video") {
      if (p.presets?.length) return `от ${formatRub(p.presets[0].price * scale)} / ролик`;
      if (p.perSecond) return `${formatRub(Math.round(p.perSecond * scale))} / сек`;
    }
    if (p.type === "transcribe") return `${formatRub(p.perMinute * scale)} / минута`;
    return priceLabel(m);
  };

  const save = async () => {
    if (!valid) { setError("Наценка от 1 до 10"); return; }
    setBusy(true); setError(null); setSaved(false);
    try {
      await api.admin.setSettings({ markup: draftNum });
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const presets = [2, 2.5, 3];

  return (
    <div className="space-y-5 max-w-xl">
      <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-base font-bold text-foreground">Наценка к себестоимости</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Розничная цена = стоимость AI Tunnel × множитель. Сейчас: <span className="font-semibold text-foreground">×{currentMarkup}</span>.
            Изменения применяются сразу ко всем новым генерациям и ценам в интерфейсе.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setDraft(String(p))}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                draftNum === p ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-foreground border-border hover:border-primary/50"
              }`}
            >
              ×{p}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Свой множитель</label>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-lg font-bold text-muted-foreground">×</span>
            <input
              type="number"
              min={1}
              max={10}
              step={0.1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 bg-input-background border border-border rounded-xl px-4 py-3 text-lg font-bold tabular-nums focus:outline-none focus:border-primary/60"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">От ×1 до ×10, шаг 0.1 (например 2.5 или 3)</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-emerald-500 font-medium">Наценка сохранена — цены обновлены</p>}

        <button
          onClick={save}
          disabled={busy || !valid || draftNum === currentMarkup}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Сохранить ×{valid ? draftNum : "?"}
        </button>
      </div>

      {valid && draftNum !== currentMarkup && (
        <div className="bg-muted/40 border border-border rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Предпросмотр цен (×{draftNum})</p>
          <ul className="space-y-2 text-sm">
            {previewModels.map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground truncate">{m.name}</span>
                <span className="font-semibold text-foreground shrink-0">{estimatePrice(m)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Пользователи ──────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [creditFor, setCreditFor] = useState<AdminUser | null>(null);
  const load = () => api.admin.users().then((d) => setUsers(d.users)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!users) return <Loading />;

  return (
    <Panel>
      <Table head={["E-mail", "Имя", "Роль", "Баланс", "IP", "Регистрация", ""]}>
        {users.map((u) => (
          <tr key={u.id} className="border-t border-border hover:bg-muted/40 transition-colors">
            <Td>{u.email}</Td>
            <Td>{u.name || "—"}</Td>
            <Td>{u.role === "admin" ? <Badge>admin</Badge> : "user"}</Td>
            <Td><span className="font-semibold tabular-nums">{formatRub(u.balance)}</span></Td>
            <Td className="text-muted-foreground">{u.last_ip || "—"}</Td>
            <Td className="text-muted-foreground">{fmtTime(u.created_at)}</Td>
            <Td>
              <button onClick={() => setCreditFor(u)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Plus size={13} /> Начислить
              </button>
            </Td>
          </tr>
        ))}
      </Table>
      {creditFor && (
        <CreditModal user={creditFor} onClose={() => setCreditFor(null)} onDone={() => { setCreditFor(null); load(); }} />
      )}
    </Panel>
  );
}

function CreditModal({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const sum = Number(amount);
    if (!sum) { setError("Укажите сумму"); return; }
    setBusy(true); setError(null);
    try {
      await api.admin.credit({ userId: user.id, amount: sum, note: note || undefined });
      onDone();
    } catch (e: any) { setError(e?.message || "Ошибка"); } finally { setBusy(false); }
  };

  return (
    <div className="aneuro-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="aneuro-pop w-full max-w-sm bg-card border border-border rounded-3xl p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-1">
          <p className="text-base font-bold text-foreground">Начислить баланс</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{user.email} · сейчас {formatRub(user.balance)}</p>
        <div className="space-y-3">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Сумма, ₽ (можно отрицательную)"
            className="w-full bg-input-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/60" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий (необязательно)"
            className="w-full bg-input-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/60" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button onClick={submit} disabled={busy} className="w-full py-3 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
            {busy && <Loader2 size={15} className="animate-spin" />} Начислить
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Генерации ──────────────────────────────────────────────────────────────

function GenerationsTab() {
  const [rows, setRows] = useState<GenerationRow[] | null>(null);
  useEffect(() => { api.admin.generations().then((d) => setRows(d.generations)).catch(() => {}); }, []);
  if (!rows) return <Loading />;
  return (
    <Panel>
      <Table head={["Время", "Пользователь", "Модель", "Тип", "Статус", "Стоимость", "Запрос"]}>
        {rows.map((g) => (
          <tr key={g.id} className="border-t border-border hover:bg-muted/40 transition-colors">
            <Td className="text-muted-foreground whitespace-nowrap">{fmtTime(g.created_at)}</Td>
            <Td>{g.user_email || "—"}</Td>
            <Td>{g.model_name}</Td>
            <Td>{g.kind}</Td>
            <Td><StatusBadge status={g.status} /></Td>
            <Td className="tabular-nums">{formatRub(g.cost)}</Td>
            <Td className="text-muted-foreground max-w-xs truncate">{g.error || g.prompt || "—"}</Td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

// ─── Логи ──────────────────────────────────────────────────────────────────────

function LogsTab() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  useEffect(() => { api.admin.logs().then((d) => setRows(d.logs)).catch(() => {}); }, []);
  if (!rows) return <Loading />;
  return (
    <Panel>
      <Table head={["Время", "Метод", "Путь", "Код", "мс", "Пользователь", "IP"]}>
        {rows.map((l) => (
          <tr key={l.id} className="border-t border-border hover:bg-muted/40 transition-colors">
            <Td className="text-muted-foreground whitespace-nowrap">{fmtTime(l.created_at)}</Td>
            <Td><span className="font-mono text-xs">{l.method}</span></Td>
            <Td className="font-mono text-xs max-w-xs truncate">{l.path}</Td>
            <Td><span className={l.status >= 400 ? "text-destructive font-semibold" : "text-emerald-500"}>{l.status}</span></Td>
            <Td className="text-muted-foreground tabular-nums">{l.ms ?? "—"}</Td>
            <Td className="text-muted-foreground">{l.user_email || "—"}</Td>
            <Td className="text-muted-foreground">{l.ip || "—"}</Td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

// ─── Общие части ───────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">{children}</div>;
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            {head.map((h, i) => (
              <th key={i} className="text-left font-semibold text-muted-foreground px-4 py-3 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-foreground ${className}`}>{children}</td>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-primary/15 text-primary">{children}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    done: "bg-emerald-500/15 text-emerald-500",
    error: "bg-destructive/15 text-destructive",
    pending: "bg-amber-500/15 text-amber-500",
  };
  return <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${map[status] || "bg-muted text-muted-foreground"}`}>{status}</span>;
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <RefreshCw size={20} className="animate-spin" />
    </div>
  );
}
