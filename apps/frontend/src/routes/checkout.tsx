import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  CreditCard,
  MapPin,
  Store,
  Truck,
  Wallet,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useCart } from "@/context/CartContext";
import {
  ApiError,
  createOrder,
  quoteDelivery,
  type ApiDeliveryQuote,
} from "@/lib/api";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Оформление заказа - Жемчужина Алтая" },
      {
        name: "description",
        content: "Оформите заказ: контакты, доставка и оплата.",
      },
    ],
  }),
  component: CheckoutPage,
});

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

type Step = 0 | 1 | 2;
const STEPS = ["Контакты", "Доставка", "Подтверждение"] as const;

type DeliveryMethod =
  | "pickup_leningradskaya"
  | "pickup_titova"
  | "courier_nsk"
  | "russia";

type PaymentMethod = "online" | "cash_on_pickup" | "card_on_pickup";

interface FormState {
  name: string;
  phone: string;
  email: string;
  delivery: DeliveryMethod | "";
  address: string;
  payment: PaymentMethod;
}

interface FormErrors {
  name?: string;
  phone?: string;
  email?: string;
  delivery?: string;
  address?: string;
}

// Адреса синхронизированы с футером и секцией «Как нас найти»
const PICKUP_ADDRESSES: Record<"pickup_leningradskaya" | "pickup_titova", string> = {
  pickup_leningradskaya: "г. Новосибирск, ул. Ленинградская 75/2",
  pickup_titova: "г. Новосибирск, ул. Титова 32",
};

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^8/, "7").slice(0, 11);
  if (!digits) return "";
  const d = digits.startsWith("7") ? digits.slice(1) : digits;
  let out = "+7";
  if (d.length > 0) out += ` (${d.slice(0, 3)}`;
  if (d.length >= 3) out += `)`;
  if (d.length >= 3) out += ` ${d.slice(3, 6)}`;
  if (d.length >= 6) out += `-${d.slice(6, 8)}`;
  if (d.length >= 8) out += `-${d.slice(8, 10)}`;
  return out;
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^8/, "7");
  return digits.length === 11 ? `+${digits}` : "";
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, getCartTotal, getCartCount, hasPerishable, clearCart, promoCode, ready } =
    useCart();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Стоимость доставки считает сервер и показывает в сводке ДО оплаты (ТЗ 6.7)
  const [quote, setQuote] = useState<ApiDeliveryQuote | null>(null);
  // Идемпотентность повторных кликов «Подтвердить» (двойной сабмит = тот же заказ)
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Math.random()).slice(2),
  );

  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    email: "",
    delivery: "",
    address: "",
    payment: "online",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const perishable = hasPerishable();
  const total = getCartTotal();
  const count = getCartCount();
  const isPickup = form.delivery === "pickup_leningradskaya" || form.delivery === "pickup_titova";

  // Наличные/карта "при получении" физически возможны только на самовывозе —
  // для курьера/СДЭК остаётся только онлайн-оплата. Если сменили способ
  // доставки на недоступный для выбранной оплаты — сбрасываем на онлайн.
  useEffect(() => {
    if (!isPickup) {
      setForm((f) => (f.payment === "online" ? f : { ...f, payment: "online" }));
    }
  }, [isPickup]);

  useEffect(() => {
    // ждём восстановления корзины из localStorage, иначе ложный редирект
    if (ready && items.length === 0 && !done) {
      void navigate({ to: "/cart" });
    }
  }, [ready, items.length, done, navigate]);

  // Серверный предрасчёт доставки при выборе способа/изменении корзины
  useEffect(() => {
    if (!form.delivery || items.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    quoteDelivery({
      deliveryMethod: form.delivery,
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
          toast.error(String(err.message));
          setForm((f) => ({ ...f, delivery: "" }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [form.delivery, items, promoCode]);

  const deliveryLabel = useMemo(() => {
    switch (form.delivery) {
      case "pickup_leningradskaya":
      case "pickup_titova":
        return `Самовывоз: ${PICKUP_ADDRESSES[form.delivery]}`;
      case "courier_nsk":
        return "Доставка по Новосибирску";
      case "russia":
        return "Доставка по России";
      default:
        return "";
    }
  }, [form.delivery]);

  const paymentLabel: Record<PaymentMethod, string> = {
    online: "Картой онлайн",
    cash_on_pickup: "Наличными при получении",
    card_on_pickup: "Картой при получении",
  };

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validateStep(s: Step): boolean {
    const next: FormErrors = {};
    if (s === 0) {
      if (!form.name.trim()) next.name = "Укажите имя";
      else if (form.name.trim().length > 100) next.name = "Слишком длинное имя";
      if (!normalizePhone(form.phone)) next.phone = "Введите телефон в формате +7XXXXXXXXXX";
      if (form.email.trim()) {
        const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
        if (!ok) next.email = "Некорректный email";
      }
    }
    if (s === 1) {
      if (!form.delivery) next.delivery = "Выберите способ доставки";
      const needsAddress = form.delivery === "courier_nsk" || form.delivery === "russia";
      if (needsAddress && !form.address.trim()) next.address = "Укажите адрес доставки";
      if (form.address.trim().length > 250) next.address = "Слишком длинный адрес";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep((s) => (s < 2 ? ((s + 1) as Step) : s));
  }
  function goBack() {
    setStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  }

  async function submitOrder(e: FormEvent) {
    e.preventDefault();
    if (!validateStep(0) || !validateStep(1)) return;
    setSubmitting(true);
    try {
      const res = await createOrder(
        {
          name: form.name.trim(),
          phone: normalizePhone(form.phone),
          email: form.email.trim() || undefined,
          deliveryMethod: form.delivery,
          deliveryAddress: form.address.trim() || undefined,
          paymentMethod: form.payment,
          items: items.map((i) => ({
            id: i.product.id,
            quantity: i.quantity,
            priceRub: i.product.price, // сервер отклонит, если цена изменилась
          })),
          promoCode: promoCode ?? undefined,
        },
        idempotencyKey,
      );
      setDone(true);
      clearCart();
      // Онлайн-оплата (Этап 3, шаг 1): бэкенд создал платёж и вернул ссылку на
      // страницу оплаты ЮKassa — уводим туда браузер. Оттуда ЮKassa вернёт
      // покупателя на /order/{id} (return_url). Если оплаты нет (самовывоз с
      // оплатой на месте, или эквайер ещё не настроен) — сразу на статус заказа.
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
        return;
      }
      toast.success(`Заказ ${res.orderNumber} оформлен!`);
      void navigate({
        to: "/order/$id",
        params: { id: String(res.id) },
        search: { token: res.accessToken },
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const details = (err.body.details ?? []) as Array<{
          id?: string;
          reason?: string;
          availableQty?: number;
          actualPriceRub?: number;
        }>;
        // Покупателю — название товара, а не внутренний id/uuid из ответа API.
        const nameOf = (id?: string) =>
          items.find((i) => i.product.id === id)?.product.name ??
          id ??
          "товар";
        const lines = details.map((d) => {
          if (d.reason === "out_of_stock")
            return `«${nameOf(d.id)}»: доступно только ${d.availableQty ?? 0}`;
          if (d.reason === "price_changed")
            return `«${nameOf(d.id)}»: цена изменилась (теперь ${d.actualPriceRub} ₽)`;
          if (d.reason === "unknown_item")
            return `«${nameOf(d.id)}»: товар недоступен`;
          return d.reason ?? "";
        });
        toast.error(String(err.message), {
          description: lines.filter(Boolean).join("; ") || undefined,
        });
      } else {
        toast.error("Не удалось оформить заказ — попробуйте ещё раз");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready || (items.length === 0 && !done)) {
    return null;
  }

  return (
    <div style={{ backgroundColor: "var(--color-bg-cream)", minHeight: "100vh" }}>
      <Header />

      <main className="pt-20 pb-16 md:pt-24">
        <div className="mx-auto max-w-5xl px-4 md:px-8">
          <div className="mb-6">
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-accent-dark)",
              }}
            >
              Оформление
            </span>
            <h1
              className="mt-2 text-4xl md:text-5xl"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                color: "var(--color-bg-dark)",
                lineHeight: 1.05,
              }}
            >
              {done ? "Заказ принят" : "Оформление заказа"}
            </h1>
          </div>

          {done ? (
            <SuccessBlock />
          ) : (
            <>
              <Stepper step={step} />

              <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px] lg:gap-8">
                <form
                  onSubmit={submitOrder}
                  className="flex flex-col gap-5"
                  noValidate
                >
                  <AnimatePresence mode="wait">
                    {step === 0 && (
                      <StepCard key="contacts" title="Контактные данные">
                        <Field
                          label="Имя"
                          required
                          error={errors.name}
                          input={
                            <input
                              type="text"
                              autoComplete="name"
                              value={form.name}
                              maxLength={100}
                              onChange={(e) => update("name", e.target.value)}
                              placeholder="Как к вам обращаться"
                              className={inputCls(!!errors.name)}
                            />
                          }
                        />
                        <Field
                          label="Телефон"
                          required
                          error={errors.phone}
                          input={
                            <input
                              type="tel"
                              autoComplete="tel"
                              value={form.phone}
                              onChange={(e) => update("phone", maskPhone(e.target.value))}
                              placeholder="+7 (___) ___-__-__"
                              inputMode="tel"
                              className={inputCls(!!errors.phone)}
                            />
                          }
                        />
                        <Field
                          label="Email"
                          hint="по желанию"
                          error={errors.email}
                          input={
                            <input
                              type="email"
                              autoComplete="email"
                              value={form.email}
                              maxLength={255}
                              onChange={(e) => update("email", e.target.value)}
                              placeholder="you@example.com"
                              className={inputCls(!!errors.email)}
                            />
                          }
                        />
                      </StepCard>
                    )}

                    {step === 1 && (
                      <StepCard key="delivery" title="Доставка и оплата">
                        <div className="flex flex-col gap-3">
                          <SectionLabel>Способ доставки</SectionLabel>
                          <RadioCard
                            checked={form.delivery === "pickup_leningradskaya"}
                            onSelect={() => update("delivery", "pickup_leningradskaya")}
                            icon={<Store size={18} />}
                            title="Самовывоз - Левый берег"
                            description={PICKUP_ADDRESSES.pickup_leningradskaya}
                          />
                          <RadioCard
                            checked={form.delivery === "pickup_titova"}
                            onSelect={() => update("delivery", "pickup_titova")}
                            icon={<Store size={18} />}
                            title="Самовывоз - Правый берег"
                            description={PICKUP_ADDRESSES.pickup_titova}
                          />
                          <RadioCard
                            checked={form.delivery === "courier_nsk"}
                            onSelect={() => update("delivery", "courier_nsk")}
                            icon={<MapPin size={18} />}
                            title="Доставка по Новосибирску"
                            description="Курьером в день заказа или на следующий день"
                          />
                          <RadioCard
                            checked={form.delivery === "russia"}
                            onSelect={() => !perishable && update("delivery", "russia")}
                            disabled={perishable}
                            icon={<Truck size={18} />}
                            title="Доставка по России"
                            description={
                              perishable
                                ? "Скоропортящиеся товары доставляются только по Новосибирску"
                                : "СДЭК / Почта России, 3-10 дней"
                            }
                          />
                          {errors.delivery && <ErrorText>{errors.delivery}</ErrorText>}
                        </div>

                        {(form.delivery === "courier_nsk" || form.delivery === "russia") && (
                          <Field
                            label="Адрес доставки"
                            required
                            error={errors.address}
                            input={
                              <input
                                type="text"
                                autoComplete="street-address"
                                value={form.address}
                                maxLength={250}
                                onChange={(e) => update("address", e.target.value)}
                                placeholder="Город, улица, дом, квартира"
                                className={inputCls(!!errors.address)}
                              />
                            }
                          />
                        )}

                        <div className="mt-2 flex flex-col gap-3">
                          <SectionLabel>Способ оплаты</SectionLabel>
                          <RadioCard
                            checked={form.payment === "online"}
                            onSelect={() => update("payment", "online")}
                            icon={<CreditCard size={18} />}
                            title="Картой онлайн"
                            description="Безопасная оплата на сайте"
                          />
                          <RadioCard
                            checked={form.payment === "cash_on_pickup"}
                            onSelect={() => isPickup && update("payment", "cash_on_pickup")}
                            disabled={!isPickup}
                            icon={<Banknote size={18} />}
                            title="Наличными при получении"
                            description={
                              isPickup
                                ? "Оплата в магазине"
                                : "Доступно только при самовывозе"
                            }
                          />
                          <RadioCard
                            checked={form.payment === "card_on_pickup"}
                            onSelect={() => isPickup && update("payment", "card_on_pickup")}
                            disabled={!isPickup}
                            icon={<Wallet size={18} />}
                            title="Картой при получении"
                            description={
                              isPickup
                                ? "Оплата картой в магазине"
                                : "Доступно только при самовывозе"
                            }
                          />
                        </div>
                      </StepCard>
                    )}

                    {step === 2 && (
                      <StepCard key="confirm" title="Подтверждение">
                        <ReviewBlock label="Контакты">
                          <div>{form.name}</div>
                          <div>{form.phone}</div>
                          {form.email && <div>{form.email}</div>}
                        </ReviewBlock>
                        <ReviewBlock label="Доставка">
                          <div>{deliveryLabel}</div>
                          {form.address && (
                            <div style={{ color: "var(--color-text-muted)" }}>
                              {form.address}
                            </div>
                          )}
                        </ReviewBlock>
                        <ReviewBlock label="Оплата">
                          <div>{paymentLabel[form.payment]}</div>
                        </ReviewBlock>
                        <ReviewBlock label="Товары">
                          <ul className="flex flex-col gap-1.5">
                            {items.map((it) => (
                              <li
                                key={it.product.id}
                                className="flex items-baseline justify-between gap-3"
                              >
                                <span className="truncate">
                                  {it.product.name}
                                  <span style={{ color: "var(--color-text-muted)" }}>
                                    {" "}
                                    × {it.quantity}
                                  </span>
                                </span>
                                <span style={{ fontWeight: 600 }}>
                                  {formatPrice(it.product.price * it.quantity)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </ReviewBlock>
                      </StepCard>
                    )}
                  </AnimatePresence>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {step > 0 ? (
                      <button
                        type="button"
                        onClick={goBack}
                        className="inline-flex items-center justify-center gap-2 rounded-full"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 600,
                          fontSize: 14,
                          padding: "12px 22px",
                          minHeight: 48,
                          backgroundColor: "transparent",
                          color: "var(--color-text)",
                          border: "1px solid rgba(31,26,14,0.18)",
                        }}
                      >
                        <ArrowLeft size={16} />
                        Назад
                      </button>
                    ) : (
                      <Link
                        to="/cart"
                        className="inline-flex items-center justify-center gap-2 rounded-full"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 600,
                          fontSize: 14,
                          padding: "12px 22px",
                          minHeight: 48,
                          color: "var(--color-text)",
                          border: "1px solid rgba(31,26,14,0.18)",
                          textDecoration: "none",
                        }}
                      >
                        <ArrowLeft size={16} />
                        В корзину
                      </Link>
                    )}

                    {step < 2 ? (
                      <button
                        // key разводит DOM-узлы «Далее»/«Подтвердить»: иначе клик
                        // по «Далее» после смены шага дощёлкивает type=submit
                        key="next"
                        type="button"
                        onClick={goNext}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full sm:w-auto"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 700,
                          fontSize: 14,
                          padding: "12px 28px",
                          minHeight: 48,
                          backgroundColor: "var(--color-accent)",
                          color: "var(--color-bg-dark)",
                        }}
                      >
                        Далее
                        <ArrowRight size={16} />
                      </button>
                    ) : (
                      <button
                        key="submit"
                        type="submit"
                        disabled={submitting}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full disabled:opacity-60 sm:w-auto"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 700,
                          fontSize: 15,
                          padding: "14px 32px",
                          minHeight: 52,
                          backgroundColor: "var(--color-accent)",
                          color: "var(--color-bg-dark)",
                        }}
                      >
                        <Check size={18} />
                        {submitting
                          ? "Отправляем..."
                          : form.payment === "online"
                            ? "Оплатить"
                            : "Оформить заказ"}
                      </button>
                    )}
                  </div>
                </form>

                <aside className="hidden lg:block">
                  <div className="sticky top-24">
                    <OrderSummary
                      count={count}
                      total={total + (quote?.deliveryRub ?? 0)}
                      subtotal={total}
                      deliveryCost={quote ? quote.deliveryRub : null}
                      deliveryLabel={deliveryLabel || "—"}
                    />
                  </div>
                </aside>

                {/* Mobile summary */}
                <div className="lg:hidden">
                  <OrderSummary
                    count={count}
                    total={total + (quote?.deliveryRub ?? 0)}
                    subtotal={total}
                    deliveryCost={quote ? quote.deliveryRub : null}
                    deliveryLabel={deliveryLabel || "—"}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function inputCls(hasError: boolean) {
  return "w-full rounded-xl outline-none transition-colors";
}

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div
              className="flex items-center gap-2"
              style={{ minWidth: 0 }}
            >
              <span
                className="inline-flex items-center justify-center rounded-full transition-colors"
                style={{
                  width: 30,
                  height: 30,
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: done
                    ? "var(--color-bg-dark)"
                    : active
                      ? "var(--color-accent)"
                      : "rgba(31,26,14,0.08)",
                  color: done
                    ? "var(--color-text-on-dark)"
                    : active
                      ? "var(--color-bg-dark)"
                      : "var(--color-text-muted)",
                }}
              >
                {done ? <Check size={14} /> : i + 1}
              </span>
              <span
                className="hidden sm:inline"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: active || done ? 600 : 500,
                  color: active
                    ? "var(--color-bg-dark)"
                    : "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className="h-px flex-1"
                style={{
                  backgroundColor: done
                    ? "var(--color-bg-dark)"
                    : "rgba(31,26,14,0.12)",
                }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22 }}
      style={{
        backgroundColor: "#fffdf7",
        border: "1px solid rgba(31,26,14,0.06)",
        borderRadius: 20,
        padding: 24,
        boxShadow: "var(--shadow-card)",
      }}
      className="flex flex-col gap-4"
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  input,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  input: React.ReactElement<{ style?: React.CSSProperties }>;
}) {
  const styledInput = {
    ...input,
    props: {
      ...input.props,
      style: {
        fontFamily: "var(--font-body)",
        fontSize: 15,
        color: "var(--color-text)",
        padding: "12px 14px",
        backgroundColor: "#fff",
        border: `1px solid ${error ? "var(--color-error)" : "rgba(31,26,14,0.14)"}`,
        borderRadius: 12,
        ...(input.props?.style ?? {}),
      },
    },
  };
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="flex items-center gap-1.5"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {label}
        {required && <span style={{ color: "var(--color-error)" }}>*</span>}
        {hint && (
          <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
            ({hint})
          </span>
        )}
      </span>
      {styledInput}
      {error && <ErrorText>{error}</ErrorText>}
    </label>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-body)",
        fontSize: 12,
        color: "var(--color-error)",
      }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-body)",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
      }}
    >
      {children}
    </span>
  );
}

function RadioCard({
  checked,
  onSelect,
  icon,
  title,
  description,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="flex w-full items-start gap-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-55"
      style={{
        borderRadius: 14,
        padding: "14px 16px",
        backgroundColor: checked ? "rgba(232,180,79,0.14)" : "#fff",
        border: `1.5px solid ${
          checked ? "var(--color-accent)" : "rgba(31,26,14,0.1)"
        }`,
      }}
    >
      <span
        className="mt-0.5 inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          width: 32,
          height: 32,
          backgroundColor: checked
            ? "var(--color-accent)"
            : "rgba(31,26,14,0.06)",
          color: checked ? "var(--color-bg-dark)" : "var(--color-text-muted)",
        }}
      >
        {icon}
      </span>
      <span className="flex flex-1 flex-col">
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--color-text)",
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--color-text-muted)",
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {description}
        </span>
      </span>
      <span
        className="mt-1 inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          width: 20,
          height: 20,
          border: `2px solid ${checked ? "var(--color-accent)" : "rgba(31,26,14,0.25)"}`,
          backgroundColor: checked ? "var(--color-accent)" : "transparent",
          color: "var(--color-bg-dark)",
        }}
      >
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
    </button>
  );
}

function ReviewBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        backgroundColor: "rgba(31,26,14,0.03)",
        padding: 16,
      }}
    >
      <SectionLabel>{label}</SectionLabel>
      <div
        className="mt-2 flex flex-col gap-1"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--color-text)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function OrderSummary({
  count,
  total,
  subtotal,
  deliveryCost,
  deliveryLabel,
}: {
  count: number;
  total: number;
  subtotal: number;
  deliveryCost: number | null;
  deliveryLabel: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "#fffdf7",
        border: "1px solid rgba(31,26,14,0.06)",
        borderRadius: 20,
        padding: 24,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
          fontSize: 20,
          fontWeight: 600,
          color: "var(--color-text)",
          marginBottom: 14,
        }}
      >
        Ваш заказ
      </h3>
      <SummaryLine label={`Товары (${count})`} value={formatPrice(subtotal)} />
      <SummaryLine
        label="Доставка"
        value={
          deliveryCost === null
            ? deliveryLabel
            : deliveryCost === 0
              ? "Бесплатно"
              : formatPrice(deliveryCost)
        }
        muted={deliveryCost === null}
      />
      <hr style={{ borderColor: "rgba(31,26,14,0.08)", margin: "14px 0" }} />
      <div className="flex items-baseline justify-between">
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text)",
          }}
        >
          Итого
        </span>
        <span
          style={{
            fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--color-accent)",
            lineHeight: 1,
          }}
        >
          {formatPrice(total)}
        </span>
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </span>
      <span
        className="text-right"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          fontWeight: muted ? 500 : 600,
          color: muted ? "var(--color-text-muted)" : "var(--color-text)",
          maxWidth: "62%",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SuccessBlock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto mt-6 flex max-w-xl flex-col items-center text-center"
      style={{
        backgroundColor: "#fffdf7",
        border: "1px solid rgba(31,26,14,0.06)",
        borderRadius: 24,
        padding: "48px 24px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 88,
          height: 88,
          backgroundColor: "rgba(59,110,74,0.12)",
          color: "#3b6e4a",
        }}
      >
        <CheckCircle2 size={44} />
      </div>
      <h2
        className="mt-5"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 600,
          color: "var(--color-bg-dark)",
        }}
      >
        Спасибо за заказ!
      </h2>
      <p
        className="mt-2"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 15,
          color: "var(--color-text-muted)",
          lineHeight: 1.5,
        }}
      >
        Мы свяжемся с вами в ближайшее время для подтверждения деталей.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          to="/catalog"
          className="inline-flex items-center gap-2 rounded-full"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg-dark)",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            fontSize: 14,
            padding: "12px 24px",
            textDecoration: "none",
          }}
        >
          В каталог
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full"
          style={{
            border: "1px solid rgba(31,26,14,0.18)",
            color: "var(--color-text)",
            fontFamily: "var(--font-body)",
            fontWeight: 600,
            fontSize: 14,
            padding: "12px 24px",
            textDecoration: "none",
          }}
        >
          На главную
        </Link>
      </div>
    </motion.div>
  );
}
