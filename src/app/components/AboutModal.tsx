import { useState } from "react";
import { X, Mail, FileText, Shield, Info } from "lucide-react";
import { LEGAL_CONTENT, LEGAL_SECTIONS, SUPPORT_EMAIL, type LegalSection } from "../lib/legal";

const ICON: Record<LegalSection, React.ReactNode> = {
  about: <Info size={16} />,
  privacy: <Shield size={16} />,
  terms: <FileText size={16} />,
  contacts: <Mail size={16} />,
};

export function AboutModal({ onClose, initial = "about" }: { onClose: () => void; initial?: LegalSection }) {
  const [section, setSection] = useState<LegalSection>(initial);

  return (
    <div className="aneuro-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="aneuro-pop w-full max-w-3xl max-h-[90vh] bg-card border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-border shrink-0">
          <div>
            <p className="text-lg font-bold text-foreground">О сервисе zynqo</p>
            <p className="text-xs text-muted-foreground mt-0.5">Документы и контакты</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          <nav className="sm:w-52 shrink-0 border-b sm:border-b-0 sm:border-r border-border p-2 sm:p-3 flex sm:flex-col gap-1 overflow-x-auto">
            {LEGAL_SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  section === s.id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {ICON[s.id]} {s.title}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <h2 className="text-base font-bold text-foreground mb-4">{LEGAL_SECTIONS.find((s) => s.id === section)?.title}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{LEGAL_CONTENT[section]}</div>
            {section === "contacts" && (
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="inline-flex items-center gap-2 mt-5 px-4 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-all"
              >
                <Mail size={15} /> Написать на {SUPPORT_EMAIL}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
