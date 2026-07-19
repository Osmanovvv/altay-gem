import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Токен админ-сессии владельца (этап 2, Вариант A: раздел «Заказы»).
 *
 * Мини-JWT на HMAC-SHA256 без внешних зависимостей (в проекте нет auth-стека):
 * подписанный stateless-токен `<payload>.<sig>`, payload = {exp} в мс.
 * Хранилища сессий не нужно — проверка чисто по подписи и сроку.
 */

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString('base64url');

/** Подписать токен со сроком жизни expiresAtMs (эпоха, мс). */
export function signAdminToken(secret: string, expiresAtMs: number): string {
  const payload = b64url(JSON.stringify({ exp: expiresAtMs }));
  const sig = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

/**
 * Проверка токена: подпись верна (constant-time) и не истёк на момент nowMs.
 * nowMs передаётся снаружи — функция чистая и детерминированная (для тестов).
 */
export function verifyAdminToken(
  secret: string,
  token: string | undefined,
  nowMs: number,
): boolean {
  if (!secret || !token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(
    createHmac('sha256', secret).update(payload).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as { exp?: number };
    return typeof data.exp === 'number' && data.exp > nowMs;
  } catch {
    return false;
  }
}

/** Токен из заголовка Authorization: принимаем «Bearer <t>» и голый «<t>». */
export function tokenFromHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
}

/**
 * Постоянное по времени сравнение пароля. Сравниваем SHA-256-дайджесты
 * (фиксированная длина) — не утекает даже длина пароля.
 */
export function passwordMatches(input: string, expected: string): boolean {
  if (!expected || !input) return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
