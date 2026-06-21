import {
  MessageSquare, Image as ImageIcon, Video, Mic, ArrowRight, Sparkles, Wallet,
} from "lucide-react";
import {
  CATEGORIES, modelsByCategoryFrom, priceLabel, formatRub,
  type CategoryId, type CatalogModel,
} from "../lib/catalog";

const CAT_ICON: Record<CategoryId, React.ReactNode> = {
  chat: <MessageSquare size={18} />,
  image: <ImageIcon size={18} />,
  video: <Video size={18} />,
  audio: <Mic size={18} />,
};

// Видео — в приоритете: показываем первым, затем остальные категории.
const HOME_ORDER: CategoryId[] = ["video", "chat", "image", "audio"];

export function HomeView({
  models, balance, isLoggedIn, onOpen, onTopUp, onAbout,
}: {
  models: CatalogModel[]; balance: number; isLoggedIn: boolean;
  onOpen: (modelId: string) => void; onTopUp: () => void; onAbout: () => void;
}) {
  const orderedCategories = HOME_ORDER
    .map((id) => CATEGORIES.find((c) => c.id === id))
    .filter((c): c is (typeof CATEGORIES)[number] => Boolean(c));
  const firstVideo = modelsByCategoryFrom(models, "video")[0];

  return (
    <div className="max-w-5xl mx-auto space-y-8 sm:space-y-10 pb-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-10 shadow-sm">
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-30 pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/12 text-primary text-xs font-semibold mb-4">
            <Sparkles size={13} /> Видео-генерация · оплата в рублях
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-foreground tracking-tight leading-tight max-w-xl">
            Создавайте видео нейросетями
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-3 max-w-lg leading-relaxed">
            Ролики по тексту или из фото, а ещё чат, картинки и расшифровка аудио. Платите только
            за результат — цену видно заранее.
          </p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 mt-6">
            {firstVideo && (
              <button
                onClick={() => onOpen(firstVideo.id)}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-all"
              >
                Создать видео <ArrowRight size={16} />
              </button>
            )}
            <button
              onClick={onTopUp}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold text-foreground bg-secondary hover:bg-secondary/70 transition-all"
            >
              <Wallet size={16} /> {isLoggedIn ? `Баланс: ${formatRub(balance)}` : "Войти и пополнить"}
            </button>
            <button
              onClick={onAbout}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold text-muted-foreground border border-border hover:text-foreground hover:border-primary/40 transition-all"
            >
              О сервисе
            </button>
          </div>
        </div>
      </div>

      {/* Категории и модели (видео первым) */}
      {orderedCategories.map((cat) => (
        <section key={cat.id}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-xl bg-primary/12 text-primary flex items-center justify-center">
              {CAT_ICON[cat.id]}
            </span>
            <div>
              <h2 className="text-lg font-bold text-foreground leading-none">{cat.label}</h2>
              <p className="text-xs text-muted-foreground mt-1">{cat.hint}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {modelsByCategoryFrom(models, cat.id).map((m) => (
              <ModelCard key={m.id} model={m} onOpen={() => onOpen(m.id)} />
            ))}
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-muted-foreground pt-2">
        {isLoggedIn
          ? "Цена каждой генерации показывается до запуска."
          : "Просматривайте модели без регистрации. Для генерации — войдите или зарегистрируйтесь."}
      </p>
    </div>
  );
}

function ModelCard({ model, onOpen }: { model: CatalogModel; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group text-left rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground truncate">{model.name}</p>
          <p className="text-xs text-muted-foreground">{model.provider}</p>
        </div>
        {model.badge && (
          <span className="shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-primary/12 text-primary">{model.badge}</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{model.tagline}</p>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{priceLabel(model)}</span>
        <span className="flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
          Открыть <ArrowRight size={15} />
        </span>
      </div>
    </button>
  );
}
