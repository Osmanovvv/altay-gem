import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { OrdersService } from './orders.service';
import { clientIpFromXff } from './yookassa-webhook';

/**
 * Приёмник уведомлений эквайера (Этап 3, шаг 2). В кабинете ЮKassa адрес
 * настраивается как https://<домен>/api/v1/webhooks/payment (глобальный префикс
 * api/v1 + маршрут nginx /api/ → backend).
 *
 * Тело принимаем нетипизированным (unknown) — глобальный ValidationPipe классы
 * без декораторов не трогает; разбор и вся верификация — в OrdersService.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly orders: OrdersService) {}

  /** Результат оплаты ЮKassa. Всегда 200, кроме явных ошибок (см. сервис). */
  @Post('payment')
  @HttpCode(200)
  async payment(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<Record<string, never>> {
    // Реальный IP пира берём из X-Forwarded-For (nginx дописывает пира справа),
    // с откатом на req.ip. Проверку IP делает сервис (второй эшелон).
    const xff = req.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff.join(',') : xff;
    const clientIp = clientIpFromXff(xffStr, req.ip ?? '');
    await this.orders.handlePaymentWebhook(body, clientIp);
    return {};
  }
}
