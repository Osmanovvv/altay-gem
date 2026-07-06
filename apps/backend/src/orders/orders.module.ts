import { Module } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { PromocodesModule } from '../promocodes/promocodes.module';
import { StrapiService } from '../strapi/strapi.service';
import { DeliveryController } from './delivery.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PromocodesModule],
  controllers: [OrdersController, DeliveryController],
  providers: [OrdersService, CatalogService, StrapiService],
})
export class OrdersModule {}
