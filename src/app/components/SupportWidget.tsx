import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, X, ChevronLeft, Send, Plus, Loader2, MessageCircle } from "lucide-react";
import { api, ApiError, type SupportMessage, type SupportThread } from "../lib/api";

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Screen = "list" | "chat" | "new";

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>("list");
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadUnread = useCallback(async () => {
    try {
      const { unread: n } = await api.support.unread();
      setUnread(n);
    } catch { /* ignore */ }
  }, []);

  const loadThreads = useCallback(async () => {
    const { threads: list } = await api.support.threads();
    setThreads(list);
  }, []);

  const openThread = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.support.thread(id);
      setActiveId(id);
      setMessages(data.messages);
      setScreen("chat");
      await loadUnread();
      await loadThreads();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }, [loadThreads, loadUnread]);

  useEffect(() => { loadUnread(); const t = setInterval(loadUnread, 20000); return () => clearInterval(t); }, [loadUnread]);

  useEffect(() => {
    if (!open) return;
    loadThreads().catch(() => {});
  }, [open, loadThreads]);

  useEffect(() => {
    if (screen === "chat") bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, screen]);

  useEffect(() => {
    if (!open || screen !== "chat" || !activeId) return;
    const poll = setInterval(async () => {
      try {
        const data = await api.support.thread(activeId);
        setMessages(data.messages);
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [open, screen, activeId]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (screen === "new") {
        const data = await api.support.createThread(text);
        setActiveId(data.thread.id);
        setMessages(data.messages);
        setScreen("chat");
        setInput("");
        await loadThreads();
        await loadUnread();
      } else if (activeId) {
        const { messages: msgs } = await api.support.sendMessage(activeId, text);
        setMessages(msgs);
        setInput("");
        await loadThreads();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось отправить");
    } finally {
      setBusy(false);
    }
  };

  const close = () => { setOpen(false); setScreen("list"); setActiveId(null); setError(null); };

  return (
    <>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) setScreen("list"); }}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold text-primary-foreground bg-primary shadow-lg hover:opacity-90 transition-all active:scale-95"
        style={{ boxShadow: "0 8px 28px -8px var(--primary)" }}
      >
        <Headphones size={18} />
        <span className="hidden sm:inline">Поддержка</span>
        {unread > 0 && (
          <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent" onClick={close} />
          <div
            className="fixed z-50 flex flex-col bg-card border border-border shadow-2xl overflow-hidden
              inset-x-3 bottom-20 top-auto h-[min(70vh,32rem)] rounded-2xl
              sm:inset-x-auto sm:right-5 sm:bottom-24 sm:w-[min(100vw-2rem,22rem)] sm:h-[min(80vh,28rem)]"
          >
            {/* Шапка */}
            <div className="flex items-center gap-2 px-3 py-3 border-b border-border bg-muted/30 shrink-0">
              {screen !== "list" && (
                <button
                  onClick={() => { setScreen("list"); setActiveId(null); setError(null); }}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {screen === "list" && "Поддержка"}
                  {screen === "new" && "Новое обращение"}
                  {screen === "chat" && "Диалог с поддержкой"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {screen === "list" ? "История обращений" : "Обычно отвечаем в течение дня"}
                </p>
              </div>
              <button onClick={close} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Контент */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {screen === "list" && (
                <div className="p-2 space-y-1">
                  <button
                    onClick={() => { setScreen("new"); setInput(""); setError(null); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/15 transition-colors"
                  >
                    <Plus size={16} /> Написать в поддержку
                  </button>
                  {threads.length === 0 ? (
                    <div className="text-center py-10 px-4">
                      <MessageCircle size={32} className="mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">Обращений пока нет</p>
                    </div>
                  ) : (
                    threads.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => openThread(t.id)}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs text-muted-foreground">{fmtTime(t.updated_at)}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            t.status === "open" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"
                          }`}>
                            {t.status === "open" ? "Открыто" : "Закрыто"}
                          </span>
                        </div>
                        <p className="text-sm text-foreground line-clamp-2">{t.preview || "—"}</p>
                        {t.unread_user > 0 && (
                          <span className="inline-block mt-1 text-[10px] font-bold text-primary">Новый ответ</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {(screen === "chat" || screen === "new") && (
                <div className="p-3 flex flex-col gap-2 min-h-full">
                  {screen === "new" && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Опишите вопрос — мы ответим как можно скорее
                    </p>
                  )}
                  {screen === "chat" && messages.map((m) => (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                      }`}>
                        {m.role === "admin" && <p className="text-[10px] font-bold opacity-70 mb-0.5">Поддержка</p>}
                        {m.body}
                        <p className={`text-[10px] mt-1 opacity-60 ${m.role === "user" ? "text-right" : ""}`}>
                          {fmtTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {busy && screen === "chat" && messages.length === 0 && (
                    <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Ввод */}
            {(screen === "chat" || screen === "new") && (
              <div className="p-3 border-t border-border shrink-0">
                {error && <p className="text-xs text-destructive mb-2">{error}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Ваше сообщение…"
                    className="flex-1 bg-input-background border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/60 max-h-24"
                  />
                  <button
                    onClick={send}
                    disabled={busy || !input.trim()}
                    className="h-9 w-9 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
