import { useEffect } from "react";
import { X } from "lucide-react";
import { PrivacyPolicyContent } from "@/components/PrivacyPolicyContent";

/**
 * Шторка с политикой обработки ПД для /max/checkout: показывает текст поверх
 * формы, чтобы покупатель не уходил на /privacy и не терял введённые поля.
 */
export function PrivacyPolicySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 bg-black/45" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="max-privacy-sheet-title"
        className="relative z-10 flex max-h-[86vh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl"
        style={{
          backgroundColor: "var(--color-bg-cream)",
          boxShadow: "0 16px 40px rgba(31,26,14,0.22)",
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid rgba(31,26,14,0.08)" }}
        >
          <h2
            id="max-privacy-sheet-title"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 600,
              color: "var(--color-bg-dark)",
              lineHeight: 1.2,
            }}
          >
            Политика конфиденциальности
          </h2>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: "rgba(31,26,14,0.06)",
              color: "var(--color-text)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 py-4">
          <PrivacyPolicyContent compact />
        </div>

        <div
          className="px-5 py-3"
          style={{
            borderTop: "1px solid rgba(31,26,14,0.08)",
            paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center rounded-full"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg-dark)",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 15,
              minHeight: 44,
            }}
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
