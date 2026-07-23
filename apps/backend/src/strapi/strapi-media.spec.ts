import { describe, expect, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import { StrapiService } from './strapi.service';

/** Сервис с дефолтами конфига (publicBase = http://localhost:1337). */
const svc = new StrapiService(new ConfigService({}));

describe('mediaUrl — оптимизированные варианты (ТЗ 7.3: сжатие/web-форматы)', () => {
  test('по умолчанию отдаёт large-вариант, не оригинал', () => {
    expect(
      svc.mediaUrl({
        url: '/uploads/orig.png',
        formats: {
          large: { url: '/uploads/large_orig.png' },
          medium: { url: '/uploads/medium_orig.png' },
        },
      }),
    ).toBe('http://localhost:1337/uploads/large_orig.png');
  });

  test('нет large — деградация medium → small → оригинал', () => {
    expect(
      svc.mediaUrl({
        url: '/uploads/o.png',
        formats: { medium: { url: '/uploads/medium_o.png' } },
      }),
    ).toBe('http://localhost:1337/uploads/medium_o.png');
    expect(
      svc.mediaUrl({
        url: '/uploads/o.png',
        formats: { small: { url: '/uploads/small_o.png' } },
      }),
    ).toBe('http://localhost:1337/uploads/small_o.png');
    expect(svc.mediaUrl({ url: '/uploads/o.png', formats: null })).toBe(
      'http://localhost:1337/uploads/o.png',
    );
  });

  test('{ original: true } — всегда оригинал (широкие баннеры/hero)', () => {
    expect(
      svc.mediaUrl(
        { url: '/uploads/o.png', formats: { large: { url: '/uploads/large_o.png' } } },
        { original: true },
      ),
    ).toBe('http://localhost:1337/uploads/o.png');
  });

  test('абсолютный URL не префиксуется; пустое — null', () => {
    expect(
      svc.mediaUrl({ url: 'https://cdn.x/a.png', formats: null }),
    ).toBe('https://cdn.x/a.png');
    expect(svc.mediaUrl(null)).toBeNull();
  });
});
