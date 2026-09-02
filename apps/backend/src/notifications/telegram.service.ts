import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StrapiService } from '../strapi/strapi.service';
import { newcomers, recipientsFor, type Recipient } from './recipients';
import { withTransportRetry } from './retry';

/** Данные заказа для уведомления магазину. */
export interface NewOrderNotice {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryMethod: string;
  deliveryAddress?: string | null;
  items: Array<{ name: string; quantity: number; unit?: string }>;
  totalRub: number;
  source: string;
}

const DELIVERY_LABEL: Record<string, string> = {
  pickup_leningradskaya: 'Самовывоз — Ленинградская 75/2',
  pickup_titova: 'Самовывоз — Титова 32',
  courier_nsk: 'Курьер по Новосибирску',
  russia: 'СДЭК / Почта России',
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Текст технического алерта исполнителю (сбой сверки, признаки недоставки
 * вебхуков — этап 2, ТЗ р.10.3 п.9). HTML parse_mode. Чистая функция.
 */
export function buildAlertMessage(subject: string, detail?: string): string {
  const lines = [`🚨 <b>${esc(subject)}</b>`];
  if (detail?.trim()) lines.push(esc(detail));
  return lines.join('\n');
}

/** Текст уведомления о новом заказе (HTML parse_mode). Чистая функция. */
export function buildNewOrderMessage(o: NewOrderNotice): string {
  const lines = [
    `🛒 <b>Новый заказ ${esc(o.orderNumber)}</b>`,
    `${esc(o.customerName)}, ${esc(o.customerPhone)}`,
    esc(DELIVERY_LABEL[o.deliveryMethod] ?? o.deliveryMethod),
  ];
  if (o.deliveryAddress?.trim()) lines.push(`Адрес: ${esc(o.deliveryAddress)}`);
  lines.push('');
  for (const it of o.items) {
    lines.push(`• ${esc(it.name)} × ${it.quantity}${it.unit ? ` ${esc(it.unit)}` : ''}`);
  }
  lines.push('');
  lines.push(`Итого: <b>${o.totalRub.toLocaleString('ru-RU')} ₽</b>`);
  if (o.source === 'max') lines.push('Источник: MAX');
  return lines.join('\n');
}

/**
 * Уведомления магазину в Telegram (этап 2, Вариант A — подтянуто из этапа 3).
 * Опционально: без TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID — тихий no-op
 * (заказы важнее уведомления; сбой Telegram не должен ронять заказ).
 * Нативный fetch, без внешних зависимостей.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramService.name);
  private readonly token: string;
  private readonly chatId: string;
  /** Чат для тех-алертов исполнителю; по умолчанию — тот же, что для заказов. */
  private readonly alertChatId: string;
  private readonly siteUrl: string;
  private readonly enabled: boolean;

  /** Список получателей из админки: кеш на минуту, как у каталога. */
  private cache: { at: number; list: Recipient[] } | null = null;
  /** Состав прошлого чтения — по нему видно, кто появился (см. newcomers). */
  private known: Set<string> | null = null;
  /** Фоновый опрос списка получателей. */
  private poller: NodeJS.Timeout | null = null;

  constructor(
    config: ConfigService,
    private readonly strapi: StrapiService,
  ) {
    this.token = config.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.chatId = config.get<string>('TELEGRAM_ADMIN_CHAT_ID', '');
    this.alertChatId =
      config.get<string>('TELEGRAM_ALERT_CHAT_ID', '') || this.chatId;
    this.siteUrl = (config.get<string>('PUBLIC_SITE_URL', '') || '').replace(
      /\/+$/,
      '',
    );
    // Достаточно токена: получатели могут быть заведены только в админке.
    this.enabled = Boolean(this.token);
    if (!this.enabled) {
      this.log.log('Telegram-уведомления выключены (нет TELEGRAM_BOT_TOKEN)');
    }
  }

  /**
   * Фоновое обновление списка.
   *
   * Без него список читался бы ТОЛЬКО в момент отправки уведомления — то есть
   * добавленный в админке человек не узнал бы о себе до следующего заказа, а
   * первый получатель вообще никогда: на первом чтении состав запоминается
   * молча (см. newcomers), и без повторных чтений «новичком» стать некому.
   * Поэтому опрашиваем раз в минуту: проверочное сообщение приходит вскоре
   * после сохранения, как и обещано в подсказке под полем в админке.
   */
  onModuleInit(): void {
    if (!this.enabled) return;
    void this.refresh();
    this.poller = setInterval(() => void this.refresh(), 60_000);
    // Не держим процесс живым только ради опроса.
    this.poller.unref?.();
  }

  onModuleDestroy(): void {
    if (this.poller) clearInterval(this.poller);
  }

  /**
   * Перечитать получателей из админки. Ошибку Strapi проглатываем сознательно:
   * список — дополнение к адресам из настроек сервера, и недоступность админки
   * не должна гасить уведомления совсем (для оповещений аварийный адрес всё
   * равно в игре). При сбое продолжаем жить на прошлом успешном списке.
   */
  private async refresh(): Promise<Recipient[]> {
    try {
      const list: Recipient[] = (await this.strapi.notificationRecipients()).map(
        (row) => ({
          chatId: String(row.chatId ?? '').trim(),
          name: String(row.name ?? '').trim(),
          orders: row.orders === true,
          alerts: row.alerts === true,
          enabled: row.enabled !== false,
        }),
      );
      this.cache = { at: Date.now(), list };
      await this.greetNewcomers(list);
      return list;
    } catch (err) {
      this.log.warn(
        `Не удалось прочитать получателей уведомлений: ${(err as Error).message}`,
      );
      return this.cache?.list ?? [];
    }
  }

  /** Список для отправки: свежий кеш или перечитать. */
  private async recipients(): Promise<Recipient[]> {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.list;
    return this.refresh();
  }

  /** Проверочное сообщение тем, кого добавили после запуска сервера. */
  private async greetNewcomers(list: Recipient[]): Promise<void> {
    const active = list.filter((r) => r.enabled).map((r) => r.chatId).filter(Boolean);
    const fresh = newcomers(this.known, active);
    this.known = new Set(active);
    for (const chatId of fresh) {
      const who = list.find((r) => r.chatId === chatId);
      await this.send(
        chatId,
        `✅ <b>Уведомления подключены</b>\nПолучатель: ${esc(who?.name ?? '')}\n` +
          `Заказы: ${who?.orders ? 'да' : 'нет'} · Технические оповещения: ${who?.alerts ? 'да' : 'нет'}`,
      );
    }
  }

  /**
   * Разослать всем чатам. Каждому отдельно и независимо: неверный номер или
   * бот, выкинутый из группы, не должны лишить уведомления остальных.
   */
  private async broadcast(
    chatIds: string[],
    text: string,
    replyMarkup?: unknown,
  ): Promise<void> {
    for (const chatId of chatIds) {
      await this.send(chatId, text, replyMarkup);
    }
  }

  /** Уведомить магазин о новом заказе. Никогда не бросает исключение. */
  async notifyNewOrder(o: NewOrderNotice): Promise<void> {
    if (!this.enabled) return;
    const replyMarkup = this.siteUrl
      ? {
          inline_keyboard: [
            [
              {
                text: 'Открыть заказ',
                url: `${this.siteUrl}/admin?order=${o.id}`,
              },
            ],
          ],
        }
      : undefined;
    const chats = recipientsFor('order', await this.recipients(), {
      adminChatId: this.chatId,
    });
    if (chats.length === 0) {
      this.log.warn(
        `Заказ ${o.orderNumber}: некому отправить уведомление — нет получателей с галочкой «Заказы»`,
      );
      return;
    }
    await this.broadcast(chats, buildNewOrderMessage(o), replyMarkup);
  }

  /**
   * Тех-алерт исполнителю (сбой ночной сверки, признаки недоставки вебхуков —
   * ТЗ р.10.3 п.9). Уходит в TELEGRAM_ALERT_CHAT_ID (или админ-чат). Никогда
   * не бросает исключение — мониторинг не должен ронять фоновые задачи.
   */
  async alert(subject: string, detail?: string): Promise<void> {
    if (!this.token) return;
    const chats = recipientsFor('alert', await this.recipients(), {
      alertChatId: this.alertChatId,
    });
    await this.broadcast(chats, buildAlertMessage(subject, detail));
  }

  /** Отправка одного сообщения. Свои ошибки только логирует, не пробрасывает. */
  private async send(
    chatId: string,
    text: string,
    replyMarkup?: unknown,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    try {
      // Повтор только при транспортном сбое: одно уведомление уже потерялось
      // из-за разового «fetch failed», а второго шанса у него не было
      // (см. retry.ts). Отказ сервера повтором не лечится и не повторяется.
      const res = await withTransportRetry(() =>
        fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        this.log.warn(
          `Telegram sendMessage -> HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`,
        );
      }
    } catch (err) {
      this.log.warn(
        `Telegram недоступен даже после повтора: ${(err as Error).message}`,
      );
    }
  }
}
