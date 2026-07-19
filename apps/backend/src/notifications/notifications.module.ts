import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';

/** Уведомления магазину (Telegram; далее — MAX на этапе 4). */
@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class NotificationsModule {}
