import { useEffect, useRef, useState } from "react";
import {
  Sparkles, RefreshCw, Send, MessageSquare, Image as ImageIcon,
  Film, FileText, Download, Wallet, AlertCircle, Paperclip, X as XIcon,
  Maximize2, X,
} from "lucide-react";
import {
  type CatalogModel, formatRub, videoPrice, transcribePrice,
  type VideoPricing, type TranscribePricing, type ImagePricing, type ChatPricing,
} from "../lib/catalog";
import { api, ApiError, getToken, type ChatMessage, type ChatPart } from "../lib/api";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Не удалось прочитать файл"));
    r.readAsDataURL(file);
  });
}

type Attachment = { file: File; url: string; isImage: boolean };
import { Card, Textarea, Select, Slider, UploadZone } from "./primitives";

export type GenProps = {
  model: CatalogModel;
  balance: number;
  onBalance: (b: number) => void;
  onNeedTopUp: () => void;
  /** Вернуть false, если нужна авторизация (модалка уже открыта). */
  onNeedAuth: () => boolean;
  /** Подтверждение списания перед платной генерацией. */
  confirm: (amount: number, title: string) => Promise<boolean>;
};

function handleError(e: unknown, onNeedTopUp: () => void): string {
  if (e instanceof ApiError) {
    if (e.status === 402) { onNeedTopUp(); return "Недостаточно средств — пополните баланс"; }
    return e.message;
  }
  return "Ошибка соединения с сервером";
}

// ─── Кнопка генерации с ценой ─────────────────────────────────────────────────

function GenerateButton({
  price, balance, busy, onClick, onNeedTopUp,
}: {
  price: number; balance: number; busy: boolean; onClick: () => void; onNeedTopUp: () => void;
}) {
  if (balance < price) {
    return (
      <button onClick={onNeedTopUp} className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-semibold text-sm bg-secondary text-foreground hover:bg-secondary/70 transition-all">
        <Wallet size={16} /> Не хватает {formatRub(price - balance)} — пополнить
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl font-semibold text-sm text-primary-foreground bg-primary hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-70"
      style={{ boxShadow: "0 8px 24px -10px var(--primary)" }}
    >
      {busy ? <><RefreshCw size={16} className="animate-spin" /> Генерация…</> : <><Sparkles size={16} /> Сгенерировать за {formatRub(price)}</>}
    </button>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2.5">
      <AlertCircle size={15} className="shrink-0" /> {text}
    </div>
  );
}

// ─── Чат ───────────────────────────────────────────────────────────────────────

function ChatView({ model, balance, onBalance, onNeedTopUp, onNeedAuth }: GenProps) {
  const pricing = model.pricing as ChatPricing;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    try {
      const items = await Promise.all(
        [...files].map(async (file) => ({
          file, url: await fileToDataUrl(file), isImage: file.type.startsWith("image/"),
        })),
      );
      setAttachments((a) => [...a, ...items]);
    } catch {
      setError("Не удалось прикрепить файл");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    if (!onNeedAuth()) return;
    if (balance < pricing.approxPerMessage) { onNeedTopUp(); return; }
    setError(null);

    let content: string | ChatPart[];
    if (attachments.length === 0) {
      content = text;
    } else {
      const parts: ChatPart[] = [];
      if (text) parts.push({ type: "text", text });
      for (const a of attachments) {
        parts.push(
          a.isImage
            ? { type: "image_url", image_url: { url: a.url } }
            : { type: "file", file: { filename: a.file.name, file_data: a.url } },
        );
      }
      content = parts;
    }

    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    setAttachments([]);
    setBusy(true);
    try {
      const res = await api.chat({ modelId: model.id, messages: history });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      onBalance(res.balance);
    } catch (e) {
      setError(handleError(e, onNeedTopUp));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex-1 bg-card border border-border rounded-3xl p-4 flex flex-col gap-3 min-h-80 overflow-y-auto shadow-sm">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/12 flex items-center justify-center">
              <MessageSquare size={20} className="text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">{model.name} готов к работе</p>
            <p className="text-sm text-muted-foreground max-w-xs">{model.tagline}</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
              }`}>
                <MessageContent content={m.content} />
              </div>
            </div>
          ))
        )}
        {busy && <div className="flex justify-start"><div className="bg-secondary rounded-2xl px-4 py-2.5"><RefreshCw size={15} className="animate-spin text-muted-foreground" /></div></div>}
      </div>
      {error && <ErrorNote text={error} />}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 bg-secondary rounded-xl pl-1.5 pr-2 py-1.5 text-xs text-foreground max-w-52">
              {a.isImage ? (
                <img src={a.url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
              ) : (
                <span className="w-8 h-8 rounded-lg bg-primary/12 text-primary flex items-center justify-center shrink-0"><FileText size={15} /></span>
              )}
              <span className="truncate">{a.file.name}</span>
              <button onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                <XIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.doc,.docx,.csv"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Прикрепить файл"
          className="h-11 w-11 shrink-0 rounded-2xl bg-card border border-border text-muted-foreground flex items-center justify-center hover:text-foreground hover:border-primary/50 transition-all active:scale-95 disabled:opacity-60"
        >
          <Paperclip size={17} />
        </button>
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Напишите сообщение…"
          className="flex-1 bg-input-background border border-border rounded-2xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all"
        />
        <button onClick={send} disabled={busy} className="h-11 w-11 shrink-0 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-60">
          <Send size={16} />
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Примерно {formatRub(pricing.approxPerMessage)} за сообщение · списывается по факту</p>
    </div>
  );
}

function MessageContent({ content }: { content: string | ChatPart[] }) {
  if (typeof content === "string") return <>{content}</>;
  const text = content.filter((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text").map((p) => p.text).join("\n");
  const images = content.filter((p): p is Extract<ChatPart, { type: "image_url" }> => p.type === "image_url");
  const files = content.filter((p): p is Extract<ChatPart, { type: "file" }> => p.type === "file");
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((p, i) => (
            <img key={i} src={p.image_url.url} alt="" className="w-28 h-28 rounded-xl object-cover" />
          ))}
        </div>
      )}
      {files.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs opacity-90"><FileText size={13} /> {p.file.filename}</div>
      ))}
      {text && <div>{text}</div>}
    </div>
  );
}

// ─── Фото ─────────────────────────────────────────────────────────────────────

function ImageView({ model, balance, onBalance, onNeedTopUp, onNeedAuth, confirm }: GenProps) {
  const pricing = model.pricing as ImagePricing;
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"1024x1024" | "1024x1792" | "1792x1024">("1024x1024");
  const [reference, setReference] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onReference = async (file: File | null) => {
    if (!file) { setReference(null); return; }
    if (!file.type.startsWith("image/")) {
      setError("Можно прикрепить только изображение (JPG, PNG, WebP)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Максимальный размер файла — 10 МБ");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setReference({ file, url });
      setError(null);
    } catch {
      setError("Не удалось прочитать изображение");
    }
  };

  const onGenerate = async () => {
    if (!prompt.trim()) return;
    if (!onNeedAuth()) return;
    const title = reference
      ? `Редактирование · ${model.name}`
      : `Фото · ${model.name}`;
    if (!(await confirm(pricing.perImage, title))) return;
    setError(null); setResult(null); setMediaId(null); setBusy(true);
    try {
      const res = await api.image({
        modelId: model.id,
        prompt: prompt.trim(),
        size,
        referenceImage: reference?.url,
      });
      setResult(res.url);
      setMediaId(res.mediaId ?? null);
      onBalance(res.balance);
    } catch (e) { setError(handleError(e, onNeedTopUp)); } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4">
        <Card title={reference ? "Что изменить на фото" : "Что нарисовать"}>
          <Textarea
            placeholder={reference
              ? "Опишите изменения: «замени фон на закат», «добавь солнечные очки», «перерисуй в акварель»…"
              : "Опишите картинку: «рыжий кот в космическом шлеме, акварель, мягкий свет»…"}
            value={prompt}
            onChange={setPrompt}
            rows={5}
            hint={reference ? "Референс загружен — модель отредактирует его по вашему описанию." : "Чем подробнее описание, тем точнее результат."}
          />
        </Card>
        <UploadZone
          label="Референс (необязательно)"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          hint="Загрузите фото — Gemini изменит его по описанию (редактирование, стиль, фон)."
          onFile={onReference}
          previewUrl={reference?.url}
        />
        <MediaResult kind="image" busy={busy} url={result} mediaId={mediaId} />
        {error && <ErrorNote text={error} />}
      </div>
      <div className="space-y-4">
        <Card title="Формат">
          <Select label="Размер" value={size} onChange={setSize} options={[
            { value: "1024x1024", label: "Квадрат (1:1)" },
            { value: "1024x1792", label: "Вертикальный (9:16)" },
            { value: "1792x1024", label: "Горизонтальный (16:9)" },
          ]} />
        </Card>
        <GenerateButton price={pricing.perImage} balance={balance} busy={busy} onClick={onGenerate} onNeedTopUp={onNeedTopUp} />
      </div>
    </div>
  );
}

// ─── Видео ────────────────────────────────────────────────────────────────────

function VideoView({ model, balance, onBalance, onNeedTopUp, onNeedAuth, confirm }: GenProps) {
  const pricing = model.pricing as VideoPricing;
  const [prompt, setPrompt] = useState("");
  const [presetId, setPresetId] = useState(pricing.presets?.[0]?.id ?? "");
  const [seconds, setSeconds] = useState(5);
  const [reference, setReference] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; note?: string } | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const price = videoPrice(pricing, { presetId, seconds });

  const onReference = async (file: File | null) => {
    if (!file) { setReference(null); return; }
    if (!file.type.startsWith("image/")) {
      setError("Можно прикрепить только изображение (JPG, PNG, WebP)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Максимальный размер файла — 10 МБ");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setReference({ file, url });
      setError(null);
    } catch {
      setError("Не удалось прочитать изображение");
    }
  };

  const onGenerate = async () => {
    if (!prompt.trim()) return;
    if (!onNeedAuth()) return;
    if (!(await confirm(price, `Видео · ${model.name}`))) return;
    setError(null); setResult(null); setMediaId(null); setBusy(true);
    try {
      const res = await api.video({
        modelId: model.id,
        prompt: prompt.trim(),
        presetId: presetId || undefined,
        seconds,
        referenceImage: reference?.url,
      });
      setResult({ url: res.url, note: res.note });
      setMediaId(res.mediaId ?? null);
      onBalance(res.balance);
    } catch (e) { setError(handleError(e, onNeedTopUp)); } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4">
        <Card title="Что показать в ролике">
          <Textarea placeholder="Опишите сцену: «дрон летит над осенним лесом на рассвете, туман, мягкий свет»…" value={prompt} onChange={setPrompt} rows={4} hint="Опишите действие, окружение и настроение." />
        </Card>
        <UploadZone
          label="Оживить фото (необязательно)"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          hint="Загрузите фото — модель сделает из него видео (image-to-video)."
          onFile={onReference}
          previewUrl={reference?.url}
        />
        <MediaResult kind="video" busy={busy} url={result?.url ?? null} mediaId={mediaId} note={result?.note} />
        {error && <ErrorNote text={error} />}
      </div>
      <div className="space-y-4">
        <Card title="Настройки">
          {pricing.presets?.length ? (
            <Select label="Качество и длительность" value={presetId} onChange={setPresetId}
              options={pricing.presets.map((p) => ({ value: p.id, label: `${p.label} — ${formatRub(p.price)}` }))} />
          ) : (
            <Slider label="Длительность" min={3} max={15} value={seconds} onChange={setSeconds} unit="сек"
              hint={pricing.perSecond ? `${formatRub(pricing.perSecond)} за секунду` : undefined} />
          )}
        </Card>
        <GenerateButton price={price} balance={balance} busy={busy} onClick={onGenerate} onNeedTopUp={onNeedTopUp} />
      </div>
    </div>
  );
}

// ─── Аудио → текст ──────────────────────────────────────────────────────────

function TranscribeView({ model, balance, onBalance, onNeedTopUp, confirm }: GenProps) {
  const pricing = model.pricing as TranscribePricing;
  const [minutes, setMinutes] = useState(5);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const price = transcribePrice(pricing, minutes);

  const onGenerate = async () => {
    if (!file) return;
    if (!(await confirm(price, `Транскрибация · ${model.name}`))) return;
    setError(null); setResult(null); setBusy(true);
    try {
      const form = new FormData();
      form.append("modelId", model.id);
      form.append("minutes", String(minutes));
      form.append("language", "ru");
      form.append("file", file);
      const res = await api.transcribe(form);
      setResult(res.text); onBalance(res.balance);
    } catch (e) { setError(handleError(e, onNeedTopUp)); } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4">
        <Card title="Загрузите аудио">
          <UploadZone label="Аудиофайл" accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,.aac"
            hint="Голосовое, подкаст, совещание — до 8 языков, включая русский."
            onFile={(f) => setFile(f)} />
        </Card>
        <ResultBox kind="text" busy={busy} text={result} />
        {error && <ErrorNote text={error} />}
      </div>
      <div className="space-y-4">
        <Card title="Длительность аудио">
          <Slider label="Примерно минут" min={1} max={120} value={minutes} onChange={setMinutes} unit="мин" />
          <p className="text-xs text-muted-foreground">{formatRub(pricing.perMinute)} за минуту · минимум {formatRub(pricing.minCharge)}</p>
        </Card>
        <GenerateButton price={price} balance={balance} busy={busy} onClick={onGenerate} onNeedTopUp={onNeedTopUp} />
      </div>
    </div>
  );
}

// ─── Блок результата (фото / видео) ───────────────────────────────────────────

function useMediaSrc(mediaId: string | null | undefined, fallbackUrl: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (mediaId) {
      let cancelled = false;
      setLoading(true);
      setError(false);
      setSrc(null);
      (async () => {
        try {
          const token = getToken();
          const res = await fetch(`/api/media/${mediaId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          if (!cancelled) setSrc(URL.createObjectURL(blob));
        } catch {
          if (!cancelled) setError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
        setSrc((prev) => { if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev); return null; });
      };
    }
    setSrc(fallbackUrl ?? null);
    setLoading(false);
    setError(false);
    return undefined;
  }, [mediaId, fallbackUrl]);

  return { src, loading, error };
}

function MediaResult({
  kind, busy, url, mediaId, note,
}: {
  kind: "image" | "video"; busy: boolean; url?: string | null; mediaId?: string | null; note?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { src, loading, error } = useMediaSrc(mediaId, url);
  const ext = kind === "video" ? "mp4" : "png";
  const label = kind === "video" ? "видео" : "изображение";

  const download = async () => {
    if (mediaId) {
      const token = getToken();
      const res = await fetch(`/api/media/${mediaId}?download=1`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `zynqo-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (src) {
      const a = document.createElement("a");
      a.href = src;
      a.download = `zynqo-${Date.now()}.${ext}`;
      a.click();
    }
  };

  if (busy) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-muted/40 min-h-72 p-8">
        <RefreshCw size={28} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">
          {kind === "video" ? "Генерируем видео… Это может занять несколько минут." : "Создаём изображение…"}
        </p>
      </div>
    );
  }

  if (!src && !loading && !note) {
    const icon = kind === "video" ? <Film size={28} /> : <ImageIcon size={28} />;
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-muted/40 min-h-72 p-8 text-center">
        <div className="text-muted-foreground/40">{icon}</div>
        <p className="text-sm text-muted-foreground">Результат появится здесь</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-card min-h-72 p-8">
        <RefreshCw size={24} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Загружаем {label}…</p>
      </div>
    );
  }

  if (error || (!src && note)) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center min-h-48 flex flex-col items-center justify-center gap-2">
        <AlertCircle size={22} className="text-destructive" />
        <p className="text-sm text-muted-foreground">{note || "Не удалось загрузить результат. Попробуйте сгенерировать снова."}</p>
      </div>
    );
  }

  if (!src) return null;

  const mediaEl = kind === "video" ? (
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      className="w-full max-h-[min(70vh,520px)] object-contain rounded-2xl bg-black"
    />
  ) : (
    <img src={src} alt="Результат" className="w-full max-h-[min(70vh,520px)] object-contain rounded-2xl bg-muted/30" />
  );

  return (
    <>
      <div className="rounded-3xl border border-border bg-card p-3 sm:p-4 shadow-sm space-y-3">
        <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-black/90 min-h-[200px]">
          {mediaEl}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-foreground hover:bg-secondary/70 transition-all"
          >
            <Maximize2 size={15} /> На весь экран
          </button>
          <button
            type="button"
            onClick={download}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-all"
          >
            <Download size={15} /> Скачать {kind === "video" ? "MP4" : "PNG"}
          </button>
        </div>
      </div>

      {expanded && (
        <div
          className="aneuro-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90"
          onClick={() => setExpanded(false)}
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute top-4 right-4 h-10 w-10 rounded-xl bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>
          <div className="w-full max-w-5xl max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {kind === "video" ? (
              <video src={src} controls autoPlay playsInline className="w-full max-h-[90vh] object-contain rounded-xl" />
            ) : (
              <img src={src} alt="Результат" className="w-full max-h-[90vh] object-contain rounded-xl" />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ResultBox({
  kind, busy, text,
}: { kind: "text"; busy: boolean; text?: string | null }) {
  if (busy) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-muted/40 min-h-64 p-6">
        <RefreshCw size={26} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Создаём результат…</p>
      </div>
    );
  }
  if (text) {
    return (
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{text}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-muted/40 min-h-64 p-6 text-center">
      <div className="text-muted-foreground/40"><FileText size={26} /></div>
      <p className="text-sm text-muted-foreground">Результат появится здесь</p>
    </div>
  );
}

// ─── Роутер ────────────────────────────────────────────────────────────────────

export function GenerationView(props: GenProps) {
  switch (props.model.kind) {
    case "chat": return <ChatView {...props} />;
    case "image": return <ImageView {...props} />;
    case "video": return <VideoView {...props} />;
    case "transcribe": return <TranscribeView {...props} />;
  }
}
