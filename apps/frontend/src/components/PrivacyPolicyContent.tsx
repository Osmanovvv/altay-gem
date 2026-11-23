import { useSettings } from "@/context/SettingsContext";
import { parsePolicyText } from "@/lib/policy-text";

export function PrivacyPolicyContent({ compact = false }: { compact?: boolean }) {
  const settings = useSettings();
  const text = settings?.privacyPolicy?.trim();
  const phone = settings?.contacts?.phone?.trim();
  const email = settings?.contacts?.email?.trim();

  if (text) {
    return (
      <div>
        {parsePolicyText(text).map((block, i) =>
          block.kind === "heading" ? (
            <h2
              key={i}
              style={{
                fontFamily: "var(--font-display)",
                fontSize: compact ? 17 : 20,
                fontWeight: 600,
                lineHeight: 1.3,
                color: "var(--color-text)",
                // Дисплейный шрифт по умолчанию даёт минускульные цифры:
                // «1» в «1. ОБЩИЕ ПОЛОЖЕНИЯ» проваливается ниже капса.
                fontVariantNumeric: "lining-nums",
                // Первый заголовок не отбиваем.
                marginTop: i === 0 ? 0 : compact ? 22 : 36,
                marginBottom: compact ? 8 : 12,
              }}
            >
              {block.text}
            </h2>
          ) : (
            <p
              key={i}
              style={{
                fontFamily: "var(--font-body)",
                fontSize: compact ? 14 : 16,
                lineHeight: compact ? 1.55 : 1.7,
                color: "var(--color-text)",
                // Внутри абзаца переносы значимы: адреса и перечисления.
                whiteSpace: "pre-line",
                marginTop: i === 0 ? 0 : compact ? 10 : 12,
              }}
            >
              {block.text}
            </p>
          ),
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl"
      style={{
        background: "rgba(31,26,14,0.04)",
        padding: compact ? "18px 16px" : "28px 24px",
        fontFamily: "var(--font-body)",
        fontSize: compact ? 14 : 16,
        lineHeight: compact ? 1.55 : 1.7,
        color: "var(--color-text)",
      }}
    >
      <p>Текст политики обработки персональных данных готовится к публикации.</p>
      {(phone || email) && (
        <p className="mt-3" style={{ color: "var(--color-text-muted)" }}>
          По вопросам обработки ваших персональных данных свяжитесь с нами:{" "}
          {phone && (
            <a
              href={`tel:${phone.replace(/[^+\d]/g, "")}`}
              style={{ color: "var(--color-accent-dark)" }}
            >
              {phone}
            </a>
          )}
          {phone && email ? " · " : ""}
          {email && (
            <a href={`mailto:${email}`} style={{ color: "var(--color-accent-dark)" }}>
              {email}
            </a>
          )}
        </p>
      )}
    </div>
  );
}
