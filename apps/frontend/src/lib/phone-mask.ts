/**
 * Маска российского телефона «+7 (999) 123-45-67» с честной работой курсора.
 *
 * Почему не просто format(onChange): управляемый input пересобирает строку из
 * цифр, и когда Backspace съедает только разделитель («-», «)», пробел),
 * цифры не меняются → строка форматируется в ту же самую → курсор «упирается»
 * в тире и стереть номер невозможно. Правильная модель: состояние — значащие
 * ЦИФРЫ (10, без кода страны), формат — их проекция, курсор — позиция в
 * «цифровом» пространстве, а удаление через разделитель пробивает ближайшую
 * цифру. Модуль чистый (без React) — переиспользуется любой формой с
 * телефоном (чекаут, в будущем мини-апп MAX).
 */

/** Значащие цифры номера (до 10, без кода страны 7/8). */
export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  const rest = /^[78]/.test(digits) ? digits.slice(1) : digits;
  return rest.slice(0, 10);
}

/** Смещение кода страны: сколько ведущих цифр ввода не являются значащими. */
function countryOffset(value: string): number {
  const digits = value.replace(/\D/g, "");
  return digits.length - Math.min(phoneDigits(value).length, digits.length) >= 1 &&
    /^[78]/.test(digits)
    ? 1
    : 0;
}

/** Формат «+7 (999) 123-45-67» из значащих цифр (прогрессивный при наборе). */
export function formatPhoneDigits(d: string): string {
  if (!d) return "";
  let out = `+7 (${d.slice(0, 3)}`;
  if (d.length >= 3) out += `) ${d.slice(3, 6)}`;
  if (d.length >= 6) out += `-${d.slice(6, 8)}`;
  if (d.length >= 8) out += `-${d.slice(8, 10)}`;
  return out;
}

/** Сколько ЗНАЧАЩИХ цифр левее курсора (код страны не считается). */
export function significantDigitsBeforeCaret(value: string, caret: number): number {
  const before = value.slice(0, caret).replace(/\D/g, "").length;
  return Math.max(0, before - countryOffset(value));
}

/** Позиция курсора в форматированной строке сразу ПОСЛЕ n-й значащей цифры. */
export function caretAfterDigit(formatted: string, n: number): number {
  if (!formatted) return 0;
  let seen = 0;
  let skippedCountry = false;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      if (!skippedCountry) {
        skippedCountry = true; // «7» кода страны — вне цифрового пространства
        continue;
      }
      seen++;
      if (seen === n) return i + 1;
    }
  }
  // n=0 — встать перед первой значащей цифрой (сразу за «+7 (»)
  return n <= 0 ? Math.min(4, formatted.length) : formatted.length;
}
