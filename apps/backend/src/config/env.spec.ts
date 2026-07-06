import { describe, expect, it } from 'bun:test';
import { validateEnv } from './env';

const required = {
  DATABASE_URL: 'postgresql://altai:altai@localhost:5432/altai',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('проходит с обязательными ключами и подставляет дефолты', () => {
    const env = validateEnv({ ...required });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.EVOTOR_API_BASE).toBe('https://api.evotor.ru');
  });

  it('падает без обязательных ключей и перечисляет их все разом', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({})).toThrow(/REDIS_URL/);
    expect(() => validateEnv({})).toThrow(/\.env\.example/);
  });

  it('приводит PORT к числу и отвергает мусор', () => {
    expect(validateEnv({ ...required, PORT: '8080' }).PORT).toBe(8080);
    expect(() => validateEnv({ ...required, PORT: 'abc' })).toThrow();
    expect(() => validateEnv({ ...required, PORT: '-1' })).toThrow();
  });

  it('отвергает неизвестный NODE_ENV', () => {
    expect(() =>
      validateEnv({ ...required, NODE_ENV: 'staging' }),
    ).toThrow(/NODE_ENV/);
  });
});
