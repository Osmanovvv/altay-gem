/**
 * Список файлов загруженной картинки, которые надо пережать в avif/webp.
 *
 * Strapi сохраняет оригинал и производные форматы (thumbnail/small/medium/
 * large) отдельными файлами в public/uploads. nginx выбирает формат по
 * заголовку Accept через try_files `$uri.avif` → `$uri.webp` → `$uri`,
 * поэтому пережатый файл называется ПОЛНЫМ именем исходного плюс своё
 * расширение: `photo_abc.jpg.avif`.
 */
export interface UploadFileResult {
  hash?: string;
  ext?: string;
  mime?: string;
  formats?: Record<string, { hash?: string; ext?: string } | undefined>;
}

const RASTER = /\.(jpe?g|png)$/i;

/**
 * Пора ли (пере)генерировать avif/webp-вариант.
 *
 * «Replace media» в Strapi сохраняет hash и URL, меняя содержимое файла, —
 * проверка «вариант существует» оставила бы браузерам старую картинку
 * навсегда. Сравниваем времена: вариант отсутствует или не моложе исходника —
 * генерируем. Равенство тоже «генерировать»: грубость mtime дешевле риска
 * отдать устаревший вариант.
 */
export function isVariantStale(srcMtimeMs: number, variantMtimeMs: number | null): boolean {
  if (variantMtimeMs === null) return true;
  return variantMtimeMs <= srcMtimeMs;
}

export function imageTargets(result: UploadFileResult | undefined): string[] {
  if (!result) return [];
  const names: string[] = [];
  const add = (hash?: string, ext?: string) => {
    if (hash && ext && RASTER.test(ext)) names.push(hash + ext);
  };
  add(result.hash, result.ext);
  for (const fmt of Object.values(result.formats ?? {})) add(fmt?.hash, fmt?.ext);
  return names;
}
