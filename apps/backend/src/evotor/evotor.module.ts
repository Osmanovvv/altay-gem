import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EvotorApiService } from './evotor-api.service';
import { EvotorController } from './evotor.controller';
import { EvotorService } from './evotor.service';
import { ReconcileService } from './reconcile.service';

/**
 * Интеграция с Эвотором (этап 2, ТЗ р.10): приём уведомлений
 * (установка, чеки, номенклатура), клиент Cloud API (магазины,
 * номенклатура, документы), ночная сверка из выгрузки + мониторинг/алерты.
 * DB и Cache — глобальные модули; NotificationsModule даёт Telegram-алерты.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [EvotorController],
  providers: [EvotorService, EvotorApiService, ReconcileService],
  exports: [EvotorApiService, ReconcileService],
})
export class EvotorModule {}
