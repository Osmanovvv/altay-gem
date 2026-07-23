import { Module } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { EvotorModule } from '../evotor/evotor.module';
import { OrdersModule } from '../orders/orders.module';
import { StrapiService } from '../strapi/strapi.service';
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
  // CatalogService/StrapiService — как в OrdersModule (кеш общий в Redis,
  // invalidate() любого инстанса сбрасывает его для всех).
  providers: [AdminGuard, CatalogService, StrapiService],
})
export class AdminModule {}
