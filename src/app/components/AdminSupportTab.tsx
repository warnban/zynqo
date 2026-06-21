import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, CheckCircle, RotateCcw } from "lucide-react";
import { api, ApiError, type AdminSupportThread, type SupportMessage } from "../lib/api";

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function AdminSupportTab() {
  const [threads, setThreads] = useState<AdminSupportThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [userInfo, setUserInfo] = useState<{ email: string; name?: string } | null>(null);
  const [threadStatus, setThreadStatus] = useState<string>("open");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const { threads: list } = await api.admin.supportThreads();
    setThreads(list);
  }, []);

  const openThread = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.admin.supportThread(id);
      setActiveId(id);
      setMessages(data.messages);
      setUserInfo(data.user);
      setThreadStatus(data.thread.status);
      await loadThreads();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }, [loadThreads]);

  useEffect(() => { loadThreads(); const t = setInterval(loadThreads, 15000); return () => clearInterval(t); }, [loadThreads]);

  useEffect(() => {
    if (!activeId) return;
    const poll = setInterval(async () => {
      try {
        const data = await api.admin.supportThread(activeId);
        setMessages(data.messages);
        setThreadStatus(data.thread.status);
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || !activeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { messages: msgs } = await api.admin.supportReply(activeId, text);
      setMessages(msgs);
      setInput("");
      await loadThreads();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка отправки");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    if (!activeId) return;
    const next = threadStatus === "open" ? "closed" : "open";
    try {
      await api.admin.supportSetStatus(activeId, next);
      setThreadStatus(next);
      await loadThreads();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[28rem]">
      {/* Список обращений */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col max-h-[32rem] lg:max-h-none">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-sm font-bold text-foreground">Обращения</p>
          <p className="text-xs text-muted-foreground">{threads.length} всего</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Обращений пока нет</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/40 transition-colors ${
                  activeId === t.id ? "bg-primary/8" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-foreground truncate">{t.user_name || t.user_email}</span>
                  {t.unread_admin > 0 && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground truncate">{t.user_email}</p>
                <p className="text-sm text-foreground line-clamp-1 mt-1">{t.preview}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">{fmtTime(t.updated_at)}</span>
                  <span className={`text-[10px] font-bold ${t.status === "open" ? "text-primary" : "text-muted-foreground"}`}>
                    {t.status === "open" ? "Открыто" : "Закрыто"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Чат */}
      <div className="bg-card border border-border rounded-2xl flex flex-col min-h-[24rem] lg:min-h-[28rem]">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
            Выберите обращение слева
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{userInfo?.name || userInfo?.email}</p>
                <p className="text-xs text-muted-foreground truncate">{userInfo?.email}</p>
              </div>
              <button
                onClick={toggleStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border hover:bg-muted transition-colors shrink-0"
              >
                {threadStatus === "open" ? <><CheckCircle size={14} /> Закрыть</> : <><RotateCcw size={14} /> Открыть</>}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {busy && messages.length === 0 && (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "admin" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                  }`}>
                    {m.role === "user" && <p className="text-[10px] font-bold opacity-70 mb-0.5">Клиент</p>}
                    {m.body}
                    <p className={`text-[10px] mt-1 opacity-60 ${m.role === "admin" ? "text-right" : ""}`}>
                      {fmtTime(m.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="p-3 border-t border-border shrink-0">
              {error && <p className="text-xs text-destructive mb-2">{error}</p>}
              {threadStatus === "closed" && (
                <p className="text-xs text-muted-foreground mb-2">Обращение закрыто. Откройте, чтобы ответить.</p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ответ клиенту…"
                  disabled={threadStatus === "closed"}
                  className="flex-1 bg-input-background border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/60 disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={busy || !input.trim() || threadStatus === "closed"}
                  className="h-9 w-9 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
