import { useRef, useState } from "react";
import { Info, Upload, X } from "lucide-react";

// ─── Переиспользуемые поля формы (тематизированы под светлую/тёмную тему) ─────

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {children}
      </span>
      {hint && (
        <span title={hint} className="text-muted-foreground/60 cursor-help hover:text-foreground transition-colors">
          <Info size={12} />
        </span>
      )}
    </div>
  );
}

export function Textarea({
  label, placeholder, value, onChange, rows = 4, hint,
}: {
  label?: string; placeholder: string; value: string;
  onChange: (v: string) => void; rows?: number; hint?: string;
}) {
  return (
    <div>
      {label && <FieldLabel hint={hint}>{label}</FieldLabel>}
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-input-background border border-border rounded-2xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground/50 resize-none focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all leading-relaxed"
      />
    </div>
  );
}

export function Select<T extends string>({
  label, options, value, onChange, hint,
}: {
  label: string; options: { value: T; label: string }[];
  value: T; onChange: (v: T) => void; hint?: string;
}) {
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full bg-input-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function Slider({
  label, min, max, step = 1, value, onChange, hint, unit,
}: {
  label: string; min: number; max: number; step?: number;
  value: number; onChange: (v: number) => void; hint?: string; unit?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <FieldLabel hint={hint}>{label}</FieldLabel>
        <span className="text-xs font-semibold text-primary tabular-nums">
          {value}{unit ? ` ${unit}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary"
        style={{ background: `linear-gradient(to right, var(--primary) ${pct}%, var(--secondary) ${pct}%)` }}
      />
    </div>
  );
}

export function Card({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="bg-card border border-border rounded-3xl p-5 space-y-4 shadow-sm">
      {title && (
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.16em]">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

export function UploadZone({
  label, accept, hint, onFile, previewUrl,
}: {
  label: string; accept: string; hint?: string; onFile?: (file: File | null) => void; previewUrl?: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const set = (f: File | null) => {
    setFile(f?.name ?? null);
    onFile?.(f);
    if (!f && ref.current) ref.current.value = "";
  };
  const showPreview = previewUrl && file;
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) set(f); }}
        className={`relative border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all ${
          dragging ? "border-primary bg-primary/8" : "border-border hover:border-primary/40 hover:bg-primary/5"
        }`}
      >
        <input
          ref={ref} type="file" accept={accept} className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) set(e.target.files[0]); }}
        />
        {showPreview ? (
          <>
            <img src={previewUrl} alt="" className="max-h-40 rounded-xl object-contain" />
            <span className="text-sm font-medium text-foreground">{file}</span>
            <button
              onClick={(e) => { e.stopPropagation(); set(null); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X size={12} /> Убрать
            </button>
          </>
        ) : file ? (
          <>
            <span className="text-sm font-medium text-foreground">{file}</span>
            <button
              onClick={(e) => { e.stopPropagation(); set(null); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X size={12} /> Убрать
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center">
              <Upload size={16} className="text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Перетащите файл или <span className="text-primary font-medium">выберите</span>
              </p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">{accept.replace(/,/g, " · ")}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
