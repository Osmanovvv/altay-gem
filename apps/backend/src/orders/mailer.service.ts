import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * Отправка писем покупателю (запрос ПМ: «дублировать заказ на почту»).
 *
 * Без SMTP-настроек — no-op с одним предупреждением в лог: код живёт на проде
 * до того, как заказчица заведёт ящик на домене (тот же приём, что у
 * PaymentService без ключей ЮKassa). Отправка НИКОГДА не роняет заказ:
 * письмо — приятное дополнение, а деньги и резерв уже проведены.
 */
@Injectable()
export class MailerService {
  private readonly log = new Logger(MailerService.name);
  private readonly from: string;
  private transporter: Transporter | null = null;
  private warned = false;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST', '') || '';
    const user = config.get<string>('SMTP_USER', '') || '';
    const pass = config.get<string>('SMTP_PASSWORD', '') || '';
    const port = Number(config.get<string>('SMTP_PORT', '') || 465);
    // 465 — SMTPS (implicit TLS), 587 — STARTTLS. Timeweb даёт оба.
    const secure =
      (config.get<string>('SMTP_SECURE', '') || '').toLowerCase() === 'true' ||
      port === 465;
    this.from =
      config.get<string>('SMTP_FROM', '') ||
      (user ? `Жемчужина Алтая <${user}>` : '');

    if (host && user && pass) {
      this.transporter = createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        // Письмо не должно держать HTTP-ответ: короткие таймауты.
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000,
      });
      this.log.log(`почта настроена: ${host}:${port} (secure=${secure})`);
    }
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  /**
   * Отправка письма. Возвращает true, если письмо ушло.
   * Ошибки не пробрасываются — только лог.
   */
  async send(to: string, subject: string, text: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      if (!this.warned) {
        this.warned = true;
        this.log.warn(
          'SMTP не настроен (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) — письма покупателям не отправляются',
        );
      }
      return false;
    }
    const address = to.trim();
    if (!address) return false;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: address,
        subject,
        text,
        html,
      });
      this.log.log(`письмо отправлено: ${subject} → ${address}`);
      return true;
    } catch (e) {
      this.log.error(
        `письмо НЕ отправлено (${subject} → ${address}): ${(e as Error).message}`,
      );
      return false;
    }
  }
}
