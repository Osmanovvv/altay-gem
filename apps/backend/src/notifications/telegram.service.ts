import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
export class TelegramService {
  private readonly log = new Logger(TelegramService.name);
  private readonly token: string;
  private readonly chatId: string;
  /** Чат для тех-алертов исполнителю; по умолчанию — тот же, что для заказов. */
  private readonly alertChatId: string;
  private readonly siteUrl: string;
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.token = config.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.chatId = config.get<string>('TELEGRAM_ADMIN_CHAT_ID', '');
    this.alertChatId =
      config.get<string>('TELEGRAM_ALERT_CHAT_ID', '') || this.chatId;
    this.siteUrl = (config.get<string>('PUBLIC_SITE_URL', '') || '').replace(
      /\/+$/,
      '',
    );
    this.enabled = Boolean(this.token && this.chatId);
    if (!this.enabled) {
      this.log.log('Telegram-уведомления выключены (нет token/chat_id)');
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
    await this.send(this.chatId, buildNewOrderMessage(o), replyMarkup);
  }

  /**
   * Тех-алерт исполнителю (сбой ночной сверки, признаки недоставки вебхуков —
   * ТЗ р.10.3 п.9). Уходит в TELEGRAM_ALERT_CHAT_ID (или админ-чат). Никогда
   * не бросает исключение — мониторинг не должен ронять фоновые задачи.
   */
  async alert(subject: string, detail?: string): Promise<void> {
    if (!this.token || !this.alertChatId) return;
    await this.send(this.alertChatId, buildAlertMessage(subject, detail));
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
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        this.log.warn(
          `Telegram sendMessage -> HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`,
        );
      }
    } catch (err) {
      this.log.warn(`Telegram недоступен: ${(err as Error).message}`);
    }
  }
}
