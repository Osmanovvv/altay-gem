import { Module } from '@nestjs/common';
import { StrapiService } from '../strapi/strapi.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, StrapiService],
})
export class CatalogModule {}
