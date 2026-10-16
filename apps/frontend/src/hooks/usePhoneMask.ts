import { useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";

import {
  caretAfterDigit,
  formatPhoneDigits,
  phoneDigits,
  phoneKeyAction,
  significantDigitsBeforeCaret,
} from "@/lib/phone-mask";

/**
 * Обвязка управляемого <input> телефона вокруг lib/phone-mask: маска
 * «+7 (999) 123-45-67», Backspace/Delete пробивают разделители, курсор не
 * прыгает в конец. Значение хранит вызывающий: value + onValue.
 *
 * ЗАЧЕМ. Мини-апп MAX форматировал номер одним onChange, и Backspace с конца
 * залипал на хвостовом «-»: стёртый разделитель тут же возвращался
 * форматированием, исправить номер с конца было нельзя (найдено 16.10.2026).
 * На сайте (routes/checkout.tsx) та же логика пока встроена в форму —
 * переводить форму оплаты сайта на хук отдельной задачей, с прогоном.
 */
export function usePhoneMask(value: string, onValue: (formatted: string) => void) {
  const ref = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const pos = caret.current;
    if (el && pos !== null && document.activeElement === el) el.setSelectionRange(pos, pos);
    caret.current = null;
  }, [value]);

  function set(digits: string, caretDigits: number, countryTyped = false) {
    // Набрали только «7»/«8» — показываем заготовку «+7 (», чтобы формат был
    // виден сразу; Backspace на ней очищает поле целиком.
    const formatted = digits ? formatPhoneDigits(digits) : countryTyped ? "+7 (" : "";
    caret.current = caretAfterDigit(formatted, caretDigits);
    onValue(formatted);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    set(
      phoneDigits(el.value),
      significantDigitsBeforeCaret(el.value, el.selectionStart ?? el.value.length),
      /\d/.test(el.value),
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const action = phoneKeyAction(el.value, start, el.selectionEnd ?? start, e.key);
    if (action.kind === "native") return;
    e.preventDefault();
    if (action.kind === "clear") onValue("");
    else if (action.kind === "set") set(action.digits, action.caretDigits);
  }

  return { ref, onChange, onKeyDown };
}
