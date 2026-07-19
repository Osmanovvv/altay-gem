import { Module } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PromocodesModule } from '../promocodes/promocodes.module';
import { StrapiService } from '../strapi/strapi.service';
import { DeliveryController } from './delivery.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentService } from './payment.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [PromocodesModule, NotificationsModule],
  controllers: [OrdersController, DeliveryController, WebhooksController],
  providers: [OrdersService, CatalogService, StrapiService, PaymentService],
  exports: [OrdersService],
})
export class OrdersModule {}
