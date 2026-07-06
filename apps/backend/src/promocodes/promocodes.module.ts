import { Module } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { StrapiService } from '../strapi/strapi.service';
import { PromocodesController } from './promocodes.controller';
import { PromocodesService } from './promocodes.service';

@Module({
  controllers: [PromocodesController],
  providers: [PromocodesService, CatalogService, StrapiService],
  exports: [PromocodesService],
})
export class PromocodesModule {}
