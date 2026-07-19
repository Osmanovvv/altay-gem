import { describe, expect, it } from 'bun:test';
import {
  passwordMatches,
  signAdminToken,
  tokenFromHeader,
  verifyAdminToken,
} from './admin-token';

const SECRET = 'test-session-secret-000';
const NOW = 1_800_000_000_000;

describe('signAdminToken / verifyAdminToken', () => {
  it('свежий токен проходит проверку', () => {
    const t = signAdminToken(SECRET, NOW + 3600_000);
    expect(verifyAdminToken(SECRET, t, NOW)).toBe(true);
  });

  it('истёкший токен отклоняется', () => {
    const t = signAdminToken(SECRET, NOW - 1);
    expect(verifyAdminToken(SECRET, t, NOW)).toBe(false);
  });

  it('чужой секрет отклоняется', () => {
    const t = signAdminToken(SECRET, NOW + 3600_000);
    expect(verifyAdminToken('другой-секрет', t, NOW)).toBe(false);
  });

  it('подделка payload (продление срока) не проходит — подпись не сходится', () => {
    const t = signAdminToken(SECRET, NOW - 1);
    const forgedPayload = Buffer.from(
      JSON.stringify({ exp: NOW + 999_999 }),
    ).toString('base64url');
    const forged = `${forgedPayload}.${t.split('.')[1]}`;
    expect(verifyAdminToken(SECRET, forged, NOW)).toBe(false);
  });

  it('мусор и пустые значения отклоняются', () => {
    expect(verifyAdminToken(SECRET, undefined, NOW)).toBe(false);
    expect(verifyAdminToken(SECRET, 'нет-точки', NOW)).toBe(false);
    expect(verifyAdminToken(SECRET, '.abc', NOW)).toBe(false);
    expect(verifyAdminToken('', signAdminToken('x', NOW + 1), NOW)).toBe(false);
  });
});

describe('tokenFromHeader', () => {
  it('снимает префикс Bearer и принимает голый токен', () => {
    expect(tokenFromHeader('Bearer abc.def')).toBe('abc.def');
    expect(tokenFromHeader('abc.def')).toBe('abc.def');
    expect(tokenFromHeader(undefined)).toBeUndefined();
  });
});

describe('passwordMatches', () => {
  it('верный пароль — да, неверный/пустой — нет', () => {
    expect(passwordMatches('S3cret!', 'S3cret!')).toBe(true);
    expect(passwordMatches('wrong', 'S3cret!')).toBe(false);
    expect(passwordMatches('S3cret!', '')).toBe(false); // пароль не задан
    expect(passwordMatches('', 'S3cret!')).toBe(false);
  });
  it('разная длина не роняет (сравнение по дайджесту)', () => {
    expect(passwordMatches('a', 'намного-длиннее')).toBe(false);
  });
});
