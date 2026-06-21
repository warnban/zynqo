import { useRef, useState } from "react";
import {
  Sparkles, RefreshCw, Send, MessageSquare, Image as ImageIcon,
  Film, FileText, Download, Wallet, AlertCircle, Paperclip, X as XIcon,
} from "lucide-react";
import {
  type CatalogModel, formatRub, videoPrice, transcribePrice,
  type VideoPricing, type TranscribePricing, type ImagePricing, type ChatPricing,
} from "../lib/catalog";
import { api, ApiError, type ChatMessage, type ChatPart } from "../lib/api";

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

function ImageView({ model, balance, onBalance, onNeedTopUp, confirm }: GenProps) {
  const pricing = model.pricing as ImagePricing;
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"1024x1024" | "1024x1792" | "1792x1024">("1024x1024");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onGenerate = async () => {
    if (!prompt.trim()) return;
    if (!(await confirm(pricing.perImage, `Фото · ${model.name}`))) return;
    setError(null); setResult(null); setBusy(true);
    try {
      const res = await api.image({ modelId: model.id, prompt, size });
      setResult(res.url); onBalance(res.balance);
    } catch (e) { setError(handleError(e, onNeedTopUp)); } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4">
        <Card title="Что нарисовать">
          <Textarea placeholder="Опишите картинку: «рыжий кот в космическом шлеме, акварель, мягкий свет»…" value={prompt} onChange={setPrompt} rows={5} hint="Чем подробнее описание, тем точнее результат." />
        </Card>
        <ResultBox kind="image" busy={busy} url={result} />
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

function VideoView({ model, balance, onBalance, onNeedTopUp, confirm }: GenProps) {
  const pricing = model.pricing as VideoPricing;
  const [prompt, setPrompt] = useState("");
  const [presetId, setPresetId] = useState(pricing.presets?.[0]?.id ?? "");
  const [seconds, setSeconds] = useState(5);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const price = videoPrice(pricing, { presetId, seconds });

  const onGenerate = async () => {
    if (!prompt.trim()) return;
    if (!(await confirm(price, `Видео · ${model.name}`))) return;
    setError(null); setResult(null); setBusy(true);
    try {
      const res = await api.video({ modelId: model.id, prompt, presetId: presetId || undefined, seconds });
      setResult({ url: res.url, note: res.note }); onBalance(res.balance);
    } catch (e) { setError(handleError(e, onNeedTopUp)); } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4">
        <Card title="Что показать в ролике">
          <Textarea placeholder="Опишите сцену: «дрон летит над осенним лесом на рассвете, туман, мягкий свет»…" value={prompt} onChange={setPrompt} rows={4} hint="Опишите действие, окружение и настроение." />
        </Card>
        <UploadZone label="Оживить фото (необязательно)" accept=".jpg,.jpeg,.png" hint="Загрузите картинку — модель сделает из неё видео." />
        <ResultBox kind="video" busy={busy} url={result?.url ?? null} note={result?.note} />
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

// ─── Блок результата ──────────────────────────────────────────────────────────

function ResultBox({
  kind, busy, url, text, note,
}: { kind: "image" | "video" | "text"; busy: boolean; url?: string | null; text?: string | null; note?: string }) {
  const icon = { image: <ImageIcon size={26} />, video: <Film size={26} />, text: <FileText size={26} /> }[kind];

  if (busy) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-muted/40 min-h-64 p-6">
        <RefreshCw size={26} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Создаём результат…</p>
      </div>
    );
  }

  if (kind === "image" && url) {
    return (
      <div className="rounded-3xl border border-border bg-card p-3 shadow-sm">
        <img src={url} alt="результат" className="w-full rounded-2xl" />
        <a href={url} download className="mt-3 flex items-center justify-center gap-1.5 text-sm text-primary hover:underline">
          <Download size={14} /> Скачать
        </a>
      </div>
    );
  }
  if (kind === "video" && (url || note)) {
    return (
      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm text-center">
        {url && url.startsWith("http") ? (
          <video src={url} controls className="w-full rounded-2xl" />
        ) : (
          <p className="text-sm text-muted-foreground py-8">{note || "Видео сгенерировано"}</p>
        )}
      </div>
    );
  }
  if (kind === "text" && text) {
    return (
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{text}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-muted/40 min-h-64 p-6 text-center">
      <div className="text-muted-foreground/40">{icon}</div>
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
