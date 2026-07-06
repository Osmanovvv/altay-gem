import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import type { DeliveryMethod } from './delivery';
import { OrderItemDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

class DeliveryQuoteDto {
  @IsIn(['pickup_leningradskaya', 'pickup_titova', 'courier_nsk', 'russia'])
  deliveryMethod!: DeliveryMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsOptional()
  @IsString()
  @Length(1, 64)
  promoCode?: string;
}

@Controller('delivery')
export class DeliveryController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Предрасчёт доставки для сводки чекаута ДО оплаты (ТЗ 6.7):
   * стоимость считает сервер, витрина только показывает.
   */
  @Post('calculate')
  @HttpCode(200)
  calculate(@Body() dto: DeliveryQuoteDto) {
    return this.orders.quoteDelivery(dto);
  }
}
