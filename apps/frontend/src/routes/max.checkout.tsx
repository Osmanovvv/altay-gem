import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check } from "lucide-react";

import { useCart } from "@/context/CartContext";
import { ApiError, createOrder, quoteDelivery } from "@/lib/api";
import type { ApiDeliveryQuote } from "@/lib/api";
import { formatPhoneDigits, phoneDigits } from "@/lib/phone-mask";
import { maxOrderHeaders } from "@/lib/max-app";
import {
  PICKUP_POINTS,
  isPickupMethod,
  normalizePhone,
  paymentOptionsFor,
  validateContacts,
  validateReceiving,
} from "@/lib/checkout-rules";

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/** Ключ последнего заказа — вкладка «Заказ» открывает его без ввода номера. */
export const LAST_ORDER_KEY = "altai-max-last-order";

/**
 * Оформление заказа в мини-аппе (ТЗ р.13: «по тем же правилам разделов 6.7 и
 * 11»). Правила проверки полей и доступности оплаты берутся из общего модуля
 * checkout-rules — того же, что у веб-чекаута, чтобы каналы не разъехались.
 *
 * Экран одностраничный: на узком экране мастер из трёх шагов заставляет
 * прыгать туда-обратно ради исправления телефона.
 */
export const Route = createFileRoute("/max/checkout")({
  component: MaxCheckout,
});

type Receiving = "" | "pickup_leningradskaya" | "pickup_titova" | "courier_nsk" | "russia";

function MaxCheckout() {
  const { items, getCartTotal, getPromoDiscount, hasPerishable, promoCode, clearCart, ready } =
    useCart();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState<Receiving>("");
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState("online");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<ApiDeliveryQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const idempotencyKey = useMemo(
    () => `max-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  const total = getCartTotal();
  const promoDiscount = getPromoDiscount();
  const payOptions = paymentOptionsFor(delivery);

  // Пустая корзина — оформлять нечего (кроме момента сразу после заказа).
  useEffect(() => {
    if (ready && items.length === 0 && !done) void navigate({ to: "/max/cart" });
  }, [ready, items.length, done, navigate]);

  // Оплата на месте возможна только при самовывозе — иначе сбрасываем на онлайн.
  useEffect(() => {
    if (!payOptions.cashOnPickup && payment !== "online") setPayment("online");
  }, [payOptions.cashOnPickup, payment]);

  // Серверный расчёт доставки: сумма и наличие считаются на бэкенде.
  useEffect(() => {
    if (!delivery || items.length === 0) {
      setQuote(null);
      return;
    }
    setQuote(null);
    setQuoteError(null);
    let cancelled = false;
    quoteDelivery({
      deliveryMethod: delivery,
      items: items.map((i) => ({ id: i.product.id, quantity: i.quantity })),
      promoCode: promoCode ?? undefined,
    })
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setQuote(null);
        if (err instanceof ApiError && err.body.code === "PERISHABLE_RUSSIA_BLOCKED") {
          setDelivery("");
          setQuoteError(String(err.message));
          return;
        }
        setQuoteError(
          err instanceof ApiError
            ? String(err.message)
            : "Не удалось рассчитать доставку. Проверьте связь",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [delivery, items, promoCode]);

  const stockProblems = quote?.stockProblems ?? [];

  async function submit() {
    const contactErrors = validateContacts({ name, phone, email, payment });
    const receivingErrors = validateReceiving({ delivery, address });
    const all = { ...contactErrors, ...receivingErrors } as Record<string, string>;
    setErrors(all);
    setFormError(null);
    if (Object.keys(all).length > 0) return;

    if (stockProblems.length > 0) {
      setFormError("Недостаточно товара для выбранного способа получения");
      return;
    }
    if (quoteError) {
      setFormError(quoteError);
      return;
    }
    if (!quote) {
      setFormError("Считаем доставку — одну секунду");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createOrder(
        {
          name: name.trim(),
          phone: normalizePhone(phone),
          email: email.trim() || undefined,
          deliveryMethod: delivery,
          deliveryAddress: address.trim() || undefined,
          paymentMethod: payment,
          items: items.map((i) => ({
            id: i.product.id,
            quantity: i.quantity,
            priceRub: i.product.price,
          })),
          promoCode: promoCode ?? undefined,
        },
        idempotencyKey,
        // Источник канала: бэкенд запишет заказ как пришедший из MAX.
        maxOrderHeaders(),
      );

      setDone(true);
      try {
        localStorage.setItem(
          LAST_ORDER_KEY,
          JSON.stringify({ id: res.id, token: res.accessToken, number: res.orderNumber }),
        );
      } catch {
        /* приватный режим — просто не запомним последний заказ */
      }
      clearCart();

      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
        return;
      }
      void navigate({
        to: "/max/order/$id",
        params: { id: String(res.id) },
        search: { token: res.accessToken },
      });
    } catch (err: unknown) {
      setFormError(
        err instanceof ApiError ? String(err.message) : "Не удалось оформить заказ — попробуйте ещё раз",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const deliveryRub = quote?.deliveryRub ?? 0;
  const grandTotal = quote ? quote.totalRub : total;

  return (
    <div className="px-4 pb-40 pt-4">
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        Оформление
      </h1>

      <Section title="Контакты">
        <Field label="Имя" error={errors.name}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Как к вам обращаться"
            style={inputStyle(!!errors.name)}
          />
        </Field>
        <Field label="Телефон" error={errors.phone}>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhoneDigits(phoneDigits(e.target.value)))}
            placeholder="+7 (___) ___-__-__"
            style={inputStyle(!!errors.phone)}
          />
        </Field>
        <Field
          label={payment === "online" ? "E-mail (для чека)" : "E-mail"}
          error={errors.email}
        >
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle(!!errors.email)}
          />
        </Field>
      </Section>

      <Section title="Получение">
        {errors.delivery && <ErrorText>{errors.delivery}</ErrorText>}
        <div className="flex flex-col gap-2">
          <Option
            selected={delivery === "pickup_leningradskaya"}
            onSelect={() => setDelivery("pickup_leningradskaya")}
            title="Самовывоз — Левый берег"
            note={PICKUP_POINTS.pickup_leningradskaya.full}
          />
          <Option
            selected={delivery === "pickup_titova"}
            onSelect={() => setDelivery("pickup_titova")}
            title="Самовывоз — Правый берег"
            note={PICKUP_POINTS.pickup_titova.full}
          />
          <Option
            selected={delivery === "courier_nsk"}
            onSelect={() => setDelivery("courier_nsk")}
            title="Доставка по Новосибирску"
            note="Курьером: до 14:00 — в день заказа"
          />
          <Option
            selected={delivery === "russia"}
            onSelect={() => setDelivery("russia")}
            title="Доставка по России"
            note={hasPerishable() ? "Недоступно: есть скоропортящиеся товары" : "СДЭК / Почта России"}
            disabled={hasPerishable()}
          />
        </div>

        {delivery && !isPickupMethod(delivery) && (
          <div className="mt-2">
            <Field label="Адрес" error={errors.address}>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Город, улица, дом, квартира"
                style={inputStyle(!!errors.address)}
              />
            </Field>
          </div>
        )}

        {quoteError && <ErrorText>{quoteError}</ErrorText>}
        {stockProblems.length > 0 && (
          <div
            className="mt-2 flex items-start gap-2 rounded-xl"
            style={{
              backgroundColor: "rgba(232,180,79,0.18)",
              color: "var(--color-accent-dark)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              padding: "10px 12px",
            }}
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Не хватает товара для этого способа получения — измените количество или выберите другой
          </div>
        )}
      </Section>

      <Section title="Оплата">
        <div className="flex flex-col gap-2">
          <Option
            selected={payment === "online"}
            onSelect={() => setPayment("online")}
            title="Онлайн — карта или СБП"
            note="Чек придёт на e-mail"
          />
          <Option
            selected={payment === "cash_on_pickup"}
            onSelect={() => payOptions.cashOnPickup && setPayment("cash_on_pickup")}
            title="Наличными при получении"
            note={payOptions.cashOnPickup ? "В магазине" : "Только при самовывозе"}
            disabled={!payOptions.cashOnPickup}
          />
          <Option
            selected={payment === "card_on_pickup"}
            onSelect={() => payOptions.cardOnPickup && setPayment("card_on_pickup")}
            title="Картой при получении"
            note={payOptions.cardOnPickup ? "В магазине" : "Только при самовывозе"}
            disabled={!payOptions.cardOnPickup}
          />
        </div>
      </Section>

      <div
        className="mt-4 rounded-2xl"
        style={{ backgroundColor: "#fffdf7", border: "1px solid rgba(31,26,14,0.06)", padding: 14 }}
      >
        <Row label="Товары" value={formatPrice(total + promoDiscount)} />
        {promoDiscount > 0 && (
          <Row label={`Промокод ${promoCode ?? ""}`} value={`− ${formatPrice(promoDiscount)}`} accent />
        )}
        <Row
          label="Доставка"
          value={!delivery ? "—" : quote ? (deliveryRub === 0 ? "бесплатно" : formatPrice(deliveryRub)) : "считаем…"}
        />
        <div
          className="mt-2 flex items-baseline justify-between"
          style={{ borderTop: "1px solid rgba(31,26,14,0.08)", paddingTop: 10 }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Итого
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontVariantNumeric: "tabular-nums",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--color-accent)",
            }}
          >
            {formatPrice(grandTotal)}
          </span>
        </div>
      </div>

      {formError && <ErrorText>{formError}</ErrorText>}

      <div
        className="fixed inset-x-0 z-40 px-4 py-3"
        style={{
          bottom: "calc(62px + env(safe-area-inset-bottom))",
          backgroundColor: "rgba(255,253,247,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderTop: "1px solid rgba(31,26,14,0.08)",
        }}
      >
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full disabled:opacity-60"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg-dark)",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            fontSize: 15,
            minHeight: 50,
          }}
        >
          {submitting
            ? "Оформляем…"
            : payment === "online"
              ? `Оплатить ${formatPrice(grandTotal)}`
              : `Оформить заказ · ${formatPrice(grandTotal)}`}
        </button>
      </div>
    </div>
  );
}

function inputStyle(invalid: boolean): React.CSSProperties {
  return {
    width: "100%",
    borderRadius: 12,
    border: `1px solid ${invalid ? "var(--color-error)" : "rgba(31,26,14,0.15)"}`,
    backgroundColor: "#fff",
    fontFamily: "var(--font-body)",
    fontSize: 15,
    minHeight: 46,
    padding: "0 14px",
    outline: "none",
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-muted)",
        }}
      >
        {title}
      </h2>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      {children}
      {error && (
        <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-error)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

function Option({
  selected,
  onSelect,
  title,
  note,
  disabled = false,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  note?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="flex items-center gap-3 text-left"
      style={{
        backgroundColor: "#fffdf7",
        border: `1px solid ${selected ? "var(--color-accent)" : "rgba(31,26,14,0.1)"}`,
        borderRadius: 14,
        padding: "12px 14px",
        opacity: disabled ? 0.5 : 1,
        minHeight: 56,
      }}
    >
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full"
        style={{
          width: 20,
          height: 20,
          border: `2px solid ${selected ? "var(--color-accent)" : "rgba(31,26,14,0.25)"}`,
          backgroundColor: selected ? "var(--color-accent)" : "transparent",
          color: "var(--color-bg-dark)",
        }}
      >
        {selected && <Check size={12} strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          {title}
        </span>
        {note && (
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            {note}
          </span>
        )}
      </span>
    </button>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span
        style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 14,
          fontWeight: 600,
          color: accent ? "var(--color-error)" : "var(--color-text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-2"
      style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--color-error)" }}
    >
      {children}
    </p>
  );
}
