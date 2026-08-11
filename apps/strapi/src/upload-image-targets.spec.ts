import { describe, expect, test } from 'bun:test';
import { imageTargets, isVariantStale } from './upload-image-targets';

/**
 * Какие файлы загруженной картинки надо пережать в avif/webp.
 *
 * Strapi кладёт в public/uploads оригинал и производные форматы
 * (thumbnail/small/medium/large) — каждый со своим hash и ext. nginx отдаёт
 * <файл>.avif / <файл>.webp по заголовку Accept, поэтому имя пережатого
 * файла — это ПОЛНОЕ имя исходного плюс расширение, а не замена расширения:
 * `photo_abc.jpg.avif`, не `photo_abc.avif` (на этом уже спотыкались —
 * try_files не находил файл и молча отдавал jpg).
 */
describe('imageTargets', () => {
  test('оригинал и все производные форматы', () => {
    expect(
      imageTargets({
        hash: 'photo_abc',
        ext: '.jpg',
        formats: {
          thumbnail: { hash: 'thumbnail_photo_abc', ext: '.jpg' },
          large: { hash: 'large_photo_abc', ext: '.jpg' },
        },
      }),
    ).toEqual(['photo_abc.jpg', 'thumbnail_photo_abc.jpg', 'large_photo_abc.jpg']);
  });

  test('png тоже пережимаем', () => {
    expect(imageTargets({ hash: 'logo', ext: '.png' })).toEqual(['logo.png']);
  });

  test('JPEG в верхнем регистре — тот же файл, регистр не должен его терять', () => {
    expect(imageTargets({ hash: 'foto', ext: '.JPEG' })).toEqual(['foto.JPEG']);
  });

  test('не-растровые вложения пропускаем: svg, pdf, видео', () => {
    expect(imageTargets({ hash: 'icon', ext: '.svg' })).toEqual([]);
    expect(imageTargets({ hash: 'doc', ext: '.pdf' })).toEqual([]);
    expect(imageTargets({ hash: 'clip', ext: '.mp4' })).toEqual([]);
  });

  test('битые данные не роняют обработчик', () => {
    expect(imageTargets(undefined)).toEqual([]);
    expect(imageTargets({})).toEqual([]);
    expect(imageTargets({ hash: 'no-ext' })).toEqual([]);
    expect(imageTargets({ ext: '.jpg' })).toEqual([]);
    expect(imageTargets({ hash: 'x', ext: '.jpg', formats: { thumbnail: undefined } })).toEqual([
      'x.jpg',
    ]);
  });

  test('имя пережатого файла = имя исходного + расширение формата', () => {
    const [name] = imageTargets({ hash: 'photo_abc', ext: '.jpg' });
    expect(`${name}.avif`).toBe('photo_abc.jpg.avif');
    expect(`${name}.webp`).toBe('photo_abc.jpg.webp');
  });
});

/**
 * «Replace media» в Strapi сохраняет тот же hash и URL, меняя СОДЕРЖИМОЕ
 * файла. Гейт «вариант уже существует — пропустить» в этом случае навсегда
 * оставляет браузерам старую картинку в avif/webp. Правильный признак —
 * времена файлов: исходник моложе варианта → вариант устарел.
 */
describe('isVariantStale', () => {
  test('варианта нет — генерировать', () => {
    expect(isVariantStale(1000, null)).toBe(true);
  });

  test('вариант старее исходника (Replace media) — перегенерировать', () => {
    expect(isVariantStale(2000, 1000)).toBe(true);
  });

  test('вариант свежее исходника — не трогать', () => {
    expect(isVariantStale(1000, 2000)).toBe(false);
  });

  test('одинаковое время (грубые файловые системы) — перегенерировать, это дёшево', () => {
    expect(isVariantStale(1500, 1500)).toBe(true);
  });
});
