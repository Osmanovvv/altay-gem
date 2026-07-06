import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** ТЗ р.9: создание заказа; идемпотентно по заголовку Idempotency-Key. */
  @Post()
  @HttpCode(201)
  create(
    @Body() dto: CreateOrderDto,
    @Headers('x-source') sourceHeader?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const source = sourceHeader === 'max' ? 'max' : 'web';
    return this.orders.create(dto, source, idempotencyKey || undefined);
  }

  /** Публичный статус заказа: id + токен доступа из ссылки (ТЗ р.9). */
  @Get(':id')
  status(@Param('id', ParseIntPipe) id: number, @Query('token') token?: string) {
    if (!token) throw new NotFoundException('Заказ не найден');
    return this.orders.publicStatus(id, token);
  }
}
