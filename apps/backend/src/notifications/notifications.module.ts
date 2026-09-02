import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { StrapiService } from '../strapi/strapi.service';

/**
 * Уведомления магазину (Telegram; далее — MAX на этапе 4).
 *
 * StrapiService нужен, чтобы читать список получателей из админки: их заводит
 * контент-менеджер, а не разработчик в настройках сервера. Провайдер объявлен
 * прямо здесь — как в остальных модулях проекта, отдельного StrapiModule нет.
 */
@Module({
  providers: [TelegramService, StrapiService],
  exports: [TelegramService],
})
export class NotificationsModule {}
