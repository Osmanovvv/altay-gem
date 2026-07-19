import { Module } from '@nestjs/common';
import { EvotorModule } from '../evotor/evotor.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

/**
 * Админка владельца (этап 2, Вариант A): вход + раздел «Заказы» +
 * мониторинг синхронизации с Эвотором. Данные заказов — из OrdersService,
 * статус/ручной запуск сверки — из ReconcileService (EvotorModule экспортирует).
 */
@Module({
  imports: [OrdersModule, EvotorModule],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
