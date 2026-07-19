import { describe, expect, it } from 'bun:test';
import { bannerIsLive } from './banner-window';

/**
 * Окно показа баннера (ТЗ р.7: showFrom/showTo в модели баннера). Раньше
 * бэкенд фильтровал только active — просроченный баннер продолжал висеть
 * на главной, а запланированный показывался раньше срока.
 */
const NOW = Date.parse('2026-07-16T12:00:00Z');

describe('bannerIsLive', () => {
  it('окно не задано (обе даты пустые) → показываем', () => {
    expect(bannerIsLive({}, NOW)).toBe(true);
    expect(bannerIsLive({ showFrom: null, showTo: null }, NOW)).toBe(true);
  });

  it('внутри окна → показываем; границы включительно', () => {
    expect(
      bannerIsLive({ showFrom: '2026-07-01', showTo: '2026-07-31' }, NOW),
    ).toBe(true);
    expect(bannerIsLive({ showFrom: '2026-07-16T12:00:00Z' }, NOW)).toBe(true);
  });

  it('ещё не началось (showFrom в будущем) → НЕ показываем', () => {
    expect(bannerIsLive({ showFrom: '2026-08-01' }, NOW)).toBe(false);
  });

  it('уже кончилось (showTo в прошлом) → НЕ показываем', () => {
    expect(bannerIsLive({ showTo: '2026-07-15' }, NOW)).toBe(false);
  });

  it('дата-день без времени: showTo действует ДО КОНЦА дня (23:59)', () => {
    // Баннер «по 16 июля» должен жить весь день 16-го, а не умереть в 00:00.
    expect(bannerIsLive({ showTo: '2026-07-16' }, NOW)).toBe(true);
  });

  it('битые даты не роняют главную → показываем как без окна', () => {
    expect(bannerIsLive({ showFrom: 'мусор', showTo: 'мусор' }, NOW)).toBe(true);
  });
});
